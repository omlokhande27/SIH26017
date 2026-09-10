import { supabaseAdmin } from '../config/supabase';
import { NotFoundError, UnprocessableError } from '../utils/errors';
import { translateDbError } from '../utils/db-error';
import { getProjectById } from './project.service';
import {
  getCompensation,
  getLandAcquisition,
  listLegalIssues,
  listRiskFactors,
} from './project-data.service';
import {
  assessSnapshotQuality,
  deriveSnapshotFeatures,
  hasBlockingIssues,
  type QualityReport,
  type SnapshotFeatures,
  type SnapshotSource,
} from './snapshot-features';

/**
 * Feature snapshot creation — the hand-off point between the operational
 * system and the ML system.
 *
 * A snapshot is an INTENTIONAL PREDICTION POINT, not an audit log. It is
 * created only when an authorised user asks for one, never as a side effect of
 * editing project data. Auto-snapshotting on every update would fill the table
 * with near-identical rows, make "which snapshot did this prediction use"
 * meaningless, and quietly turn each keystroke into a training example.
 *
 * Snapshots are IMMUTABLE. This service exposes create and read only — there is
 * no update and no delete, because a prediction made today must remain
 * explainable next year, which is impossible if its inputs can be revised. The
 * database backs this up: no UPDATE policy for any non-admin role, no
 * `updated_at` column, no trigger, and `ON DELETE RESTRICT` from predictions.
 */

const SNAPSHOT_COLUMNS = `
  id, project_id, snapshot_date,
  land_required_ha, land_acquired_ha, acquisition_percentage,
  compensation_pending, compensation_pending_percentage,
  affected_landowners, affected_families,
  court_cases_count, litigation_flag, land_dispute_flag, title_issue_flag,
  land_record_issue_flag, r_and_r_required, r_and_r_pending, row_issue,
  encroachment, forest_clearance_pending, possession_pending, administrative_delay,
  notification_delay_days, award_delay_days, created_at
`;

export interface SnapshotRow extends SnapshotFeatures {
  id: string;
  project_id: string;
  snapshot_date: string;
  created_at: string;
}

export interface SnapshotCreationResult {
  snapshot: SnapshotRow;
  /**
   * Provenance and completeness, COMPUTED AT CREATION AND RETURNED, NOT STORED.
   *
   * `project_feature_snapshots` has no column for it, and Phase 3 does not add
   * one — inventing schema to hold metadata is a bigger decision than it
   * looks. Callers that need to retain this should persist the response.
   */
  dataQuality: QualityReport & { computedAt: string; persisted: false };
}

/** Gather every current input a snapshot draws on, in parallel. */
async function collectSource(projectId: string, asOf: Date): Promise<SnapshotSource> {
  // Four independent reads, issued together rather than in sequence. This is
  // the N+1 avoidance for this endpoint: one round trip per table, never one
  // per row.
  const [project, land, compensation, legalIssues, riskFactors] = await Promise.all([
    getProjectById(projectId),
    getLandAcquisition(projectId),
    getCompensation(projectId),
    listLegalIssues(projectId),
    listRiskFactors(projectId),
  ]);

  return {
    project: { id: project.id, planned_start_date: project.planned_start_date },
    land,
    compensation,
    legalIssues,
    riskFactors,
    asOf,
  };
}

/**
 * Assess the project's data without writing anything.
 *
 * Lets a frontend show "this project is not ready for a prediction, and here is
 * why" before the user commits to creating a snapshot.
 */
export async function previewSnapshot(
  projectId: string,
  asOf: Date = new Date(),
): Promise<{ features: SnapshotFeatures; dataQuality: QualityReport; wouldSucceed: boolean }> {
  const source = await collectSource(projectId, asOf);
  const dataQuality = assessSnapshotQuality(source);
  return {
    features: deriveSnapshotFeatures(source),
    dataQuality,
    wouldSucceed: !hasBlockingIssues(dataQuality),
  };
}

export async function createSnapshot(
  projectId: string,
  asOf: Date = new Date(),
): Promise<SnapshotCreationResult> {
  const source = await collectSource(projectId, asOf);

  const dataQuality = assessSnapshotQuality(source);
  if (hasBlockingIssues(dataQuality)) {
    // 422: the request was valid, the project's data is not adequate. Refusing
    // is the honest outcome — the alternative is inventing values to fill the
    // gaps, which produces a confident feature vector describing nothing.
    throw new UnprocessableError(
      'The project data cannot support a feature snapshot. Resolve the blocking issues and try again.',
      {
        issues: dataQuality.issues.filter((i) => i.severity === 'blocking'),
        warnings: dataQuality.issues.filter((i) => i.severity === 'warning'),
      },
    );
  }

  const features = deriveSnapshotFeatures(source);

  const { data, error } = await supabaseAdmin
    .from('project_feature_snapshots')
    .insert({
      project_id: projectId,
      snapshot_date: asOf.toISOString(),
      ...features,
    })
    .select(SNAPSHOT_COLUMNS)
    .single();

  if (error) {
    throw translateDbError(error, { resource: 'Snapshot', context: { projectId } });
  }

  return {
    snapshot: data as unknown as SnapshotRow,
    dataQuality: {
      ...dataQuality,
      computedAt: asOf.toISOString(),
      persisted: false,
    },
  };
}

export async function listSnapshots(projectId: string): Promise<SnapshotRow[]> {
  const { data, error } = await supabaseAdmin
    .from('project_feature_snapshots')
    .select(SNAPSHOT_COLUMNS)
    .eq('project_id', projectId)
    .order('snapshot_date', { ascending: false });

  if (error) throw translateDbError(error, { resource: 'Snapshot', context: { projectId } });
  return (data ?? []) as unknown as SnapshotRow[];
}

export async function getSnapshot(projectId: string, snapshotId: string): Promise<SnapshotRow> {
  // Scoped by both ids so a snapshot is only reachable through its own project.
  const { data, error } = await supabaseAdmin
    .from('project_feature_snapshots')
    .select(SNAPSHOT_COLUMNS)
    .eq('project_id', projectId)
    .eq('id', snapshotId)
    .maybeSingle();

  if (error) {
    throw translateDbError(error, { resource: 'Snapshot', context: { projectId, snapshotId } });
  }
  if (!data) throw new NotFoundError('Snapshot');
  return data as unknown as SnapshotRow;
}
