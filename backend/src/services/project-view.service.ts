import { getProjectById, type ProjectRow } from './project.service';
import {
  getCompensation,
  getLandAcquisition,
  listLegalIssues,
  listRiskFactors,
  type CompensationRow,
  type LandAcquisitionRow,
  type LegalIssueRow,
  type RiskFactorRow,
} from './project-data.service';
import { listSnapshots, type SnapshotRow } from './snapshot.service';

/**
 * The composed "everything about this project" read.
 *
 * Five independent reads issued CONCURRENTLY rather than sequentially. Nothing
 * here depends on another's result, so awaiting them in turn would multiply
 * the latency by five for no reason. This is also the N+1 answer for this
 * endpoint: one query per table regardless of how many legal issues or risk
 * factors a project has — never one query per row.
 *
 * Snapshots are summarised rather than returned in full. A project accumulates
 * one per prediction point, each with 21 feature columns, and a frontend
 * rendering a project page needs to know they exist, not to receive all of
 * them. The full feature vector is available from the snapshot endpoints.
 */

export interface ProjectFullView {
  project: ProjectRow;
  land_acquisition: LandAcquisitionRow | null;
  compensation: CompensationRow | null;
  legal_issues: LegalIssueRow[];
  risk_factors: RiskFactorRow[];
  snapshots: {
    count: number;
    latest: Pick<SnapshotRow, 'id' | 'snapshot_date' | 'created_at'> | null;
  };
  summary: {
    /** Live issues only — resolved ones are history, not current risk. */
    open_legal_issues: number;
    open_risk_factors: number;
    active_court_cases: number;
    /** Copied from the generated column; never recomputed here. */
    acquisition_percentage: string | null;
    compensation_pending: string | null;
  };
}

const ACTIVE = new Set(['OPEN', 'IN_PROGRESS']);

export async function getProjectFullView(projectId: string): Promise<ProjectFullView> {
  const [project, land, compensation, legalIssues, riskFactors, snapshots] = await Promise.all([
    getProjectById(projectId),
    getLandAcquisition(projectId),
    getCompensation(projectId),
    listLegalIssues(projectId),
    listRiskFactors(projectId),
    listSnapshots(projectId),
  ]);

  const openLegal = legalIssues.filter((i) => ACTIVE.has(i.status));
  const latest = snapshots[0];

  return {
    project,
    land_acquisition: land,
    compensation,
    legal_issues: legalIssues,
    risk_factors: riskFactors,
    snapshots: {
      count: snapshots.length,
      latest: latest
        ? { id: latest.id, snapshot_date: latest.snapshot_date, created_at: latest.created_at }
        : null,
    },
    summary: {
      open_legal_issues: openLegal.length,
      open_risk_factors: riskFactors.filter((f) => ACTIVE.has(f.status)).length,
      active_court_cases: openLegal.filter((i) => i.court_case).length,
      acquisition_percentage: land?.land_acquisition_percentage ?? null,
      compensation_pending: compensation?.compensation_pending ?? null,
    },
  };
}
