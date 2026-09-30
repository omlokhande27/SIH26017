import { supabaseAdmin } from '../config/supabase';
import { NotFoundError, UnprocessableError } from '../utils/errors';
import { translateDbError } from '../utils/db-error';
import * as mlClient from './ml-service.client';
import type { PredictionResult, TriggeredRule } from './ml-service.client';
import { createSnapshot, listSnapshots, getSnapshot, type SnapshotRow } from './snapshot.service';

/**
 * Prediction orchestration — the Phase 5 workflow.
 *
 *   project -> feature snapshot -> ML service (rules + estimate)
 *           -> persist prediction, explanations, recommendations
 *           -> return the combined assessment
 *
 * ###########################################################################
 * # TWO SIGNALS, KEPT SEPARATE ON PURPOSE                                   #
 * #                                                                        #
 * #   RULE ENGINE   deterministic, auditable, explains itself with the      #
 * #                 evidence that fired each rule. The PRIMARY signal.      #
 * #                                                                        #
 * #   DELAY FIGURE  currently the historical median. No trained model beat  #
 * #                 a median baseline (every R² negative), so this carries  #
 * #                 no project-specific signal at all.                     #
 * #                                                                        #
 * # They are never blended into a single "AI confidence". Combining a       #
 * # deterministic score with a figure that has no predictive content would  #
 * # produce a number that looks authoritative and means nothing.           #
 * ###########################################################################
 *
 * LEAKAGE: the ML payload is built by `ml-service.client.toRequestSnapshot`,
 * which enumerates the 21 snapshot feature columns by name. Nothing here
 * spreads a database row, so a column added to `project_feature_snapshots`
 * later cannot reach the model by accident. `actual_outcomes` is never read.
 */

/** Columns returned for a persisted prediction. Enumerated, never `*`. */
const PREDICTION_COLUMNS = `
  id, project_id, feature_snapshot_id, model_version_id,
  predicted_delay_days, risk_level, prediction_status,
  prediction_type, confidence, risk_score, rule_coverage_pct,
  assessment_complete, missing_core_inputs, limitations, created_at
`;

export interface PredictionRow {
  id: string;
  project_id: string;
  feature_snapshot_id: string;
  model_version_id: string | null;
  predicted_delay_days: string | number | null;
  risk_level: string | null;
  prediction_status: string;
  prediction_type: string | null;
  confidence: string | null;
  risk_score: string | number | null;
  rule_coverage_pct: string | number | null;
  assessment_complete: boolean | null;
  missing_core_inputs: unknown;
  limitations: unknown;
  created_at: string;
}

export interface AssessmentResponse {
  prediction: {
    id: string;
    predicted_delay_days: number | null;
    model_version: string | null;
    prediction_type: string | null;
    confidence: string | null;
    note: string;
  };
  risk_assessment: {
    risk_score: number | null;
    risk_level: string | null;
    rule_coverage_pct: number | null;
    assessment_complete: boolean | null;
    triggered_rules: TriggeredRule[];
    skipped_rules: mlClient.SkippedRule[];
    explanation: string;
  };
  recommendations: Array<{
    title: string;
    action: string;
    priority: string;
    rationale: string;
    source_rule_id: string | null;
  }>;
  limitations: string[];
  missing_inputs: string[];
  snapshot: { id: string; snapshot_date: string };
  created_at: string;
}

// ---------------------------------------------------------------------------
// Model version registry
// ---------------------------------------------------------------------------

/**
 * Ensure `model_versions` holds a row for whatever the ML service is serving,
 * and return its id.
 *
 * The registry is keyed on the version STRING the service reports, so when a
 * better model is deployed (say `1.0.0-xgboost`) a new row appears on the
 * first prediction and every subsequent prediction is attributable to it.
 * Nothing in the backend needs changing for that to work — which is the point
 * of registering by lookup rather than by configuration.
 *
 * Metrics are copied from the model card as reported, including the negative
 * R² of the current baseline. Recording an unflattering metric is the whole
 * reason the registry exists.
 */
async function ensureModelVersion(): Promise<string | null> {
  let info: Awaited<ReturnType<typeof mlClient.getModelInfo>>;
  try {
    info = await mlClient.getModelInfo();
  } catch {
    // The registry is provenance, not correctness. A prediction with an
    // unknown model version is worth less, but refusing to record the
    // assessment because the registry lookup failed would be worse.
    console.warn('[prediction] model-info unavailable; prediction will have no model_version_id');
    return null;
  }

  if (!info.model_version) return null;

  const existing = await supabaseAdmin
    .from('model_versions')
    .select('id')
    .eq('version', info.model_version)
    .maybeSingle();

  if (existing.error) throw translateDbError(existing.error, { context: { op: 'ensureModelVersion' } });
  if (existing.data) return (existing.data as { id: string }).id;

  const metrics = (info.metrics ?? {}) as Record<string, number>;
  const inserted = await supabaseAdmin
    .from('model_versions')
    .insert({
      version: info.model_version,
      algorithm: info.model_type ?? 'unknown',
      training_date: info.trained_at ?? null,
      dataset_size: info.training_rows ?? null,
      mae: metrics.mae ?? null,
      rmse: metrics.rmse ?? null,
      r2_score: metrics.r2 ?? null,
      // STAGING, not ACTIVE. Promoting a model to ACTIVE is a deliberate
      // decision, and the current baseline has not earned it — it lost to a
      // median. The table permits only one ACTIVE row, so auto-promoting here
      // would also make a future genuine model's registration fail.
      status: 'STAGING',
    })
    .select('id')
    .single();

  if (inserted.error) {
    // A concurrent request may have inserted the same version between our
    // check and our write; the UNIQUE constraint is the arbiter.
    const retry = await supabaseAdmin
      .from('model_versions')
      .select('id')
      .eq('version', info.model_version)
      .maybeSingle();
    if (retry.data) return (retry.data as { id: string }).id;
    throw translateDbError(inserted.error, { context: { op: 'registerModelVersion' } });
  }

  return (inserted.data as { id: string }).id;
}

// ---------------------------------------------------------------------------
// Snapshot selection
// ---------------------------------------------------------------------------

/**
 * Resolve the snapshot a prediction will be attributed to.
 *
 * Phase 3 established that snapshots are intentional prediction points and are
 * never created as a side effect of editing project data. Requesting a
 * prediction IS such a point, so creating one here is consistent with that
 * rule rather than an exception to it.
 *
 * Precedence:
 *   1. an explicitly supplied snapshot_id (must belong to this project)
 *   2. the project's most recent existing snapshot
 *   3. a new snapshot, created now
 */
async function resolveSnapshot(
  projectId: string,
  requestedSnapshotId?: string,
): Promise<{ snapshot: SnapshotRow; created: boolean }> {
  if (requestedSnapshotId) {
    const snapshot = await getSnapshot(projectId, requestedSnapshotId);
    return { snapshot, created: false };
  }

  // Always generate a fresh snapshot of the project's current operational state
  const result = await createSnapshot(projectId, new Date());
  return { snapshot: result.snapshot, created: true };
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

/** Pull a numeric value out of a rule's evidence, when one is there to pull. */
function numericEvidence(rule: TriggeredRule): number | null {
  for (const value of Object.values(rule.evidence ?? {})) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'boolean') return value ? 1 : 0;
  }
  return null;
}

async function saveExplanations(predictionId: string, rules: TriggeredRule[]): Promise<void> {
  if (rules.length === 0) return;

  // Ranked by contribution, so rank 1 is the largest driver. The table's
  // UNIQUE (prediction_id, rank) and UNIQUE (prediction_id, feature_name) both
  // hold: ranks are sequential and rule_id is unique within an evaluation.
  const rows = rules
    .slice()
    .sort((a, b) => b.contribution - a.contribution)
    .map((rule, index) => ({
      prediction_id: predictionId,
      feature_name: rule.rule_id,
      feature_value: numericEvidence(rule),
      contribution_score: rule.contribution,
      // Every rule in this engine raises risk; none lowers it. Stated
      // explicitly rather than inferred from the sign.
      contribution_direction: 'INCREASES_DELAY',
      rank: index + 1,
      // The column that stops a rule finding being read as a model's
      // self-attribution. See migration 0004.
      explanation_source: 'RULE_ENGINE',
    }));

  const { error } = await supabaseAdmin.from('prediction_explanations').insert(rows);
  if (error) throw translateDbError(error, { context: { op: 'saveExplanations', predictionId } });
}

async function saveRecommendations(
  predictionId: string,
  recommendations: mlClient.Recommendation[],
): Promise<void> {
  if (recommendations.length === 0) return;

  const rows = recommendations.map((rec) => ({
    prediction_id: predictionId,
    title: rec.title,
    description: rec.rationale,
    priority: rec.priority,
    recommended_action: rec.action,
    status: 'OPEN',
    source_rule_id: rec.linked_rule_ids[0] ?? null,
  }));

  const { error } = await supabaseAdmin.from('recommendations').insert(rows);
  if (error) {
    throw translateDbError(error, { context: { op: 'saveRecommendations', predictionId } });
  }
}

// ---------------------------------------------------------------------------
// The orchestration
// ---------------------------------------------------------------------------

export interface RunPredictionOptions {
  snapshotId?: string;
}

export async function runPrediction(
  projectId: string,
  options: RunPredictionOptions = {},
): Promise<AssessmentResponse> {
  const { snapshot } = await resolveSnapshot(projectId, options.snapshotId);

  // Call the ML service BEFORE writing anything. If it is unreachable the
  // client raises a 503 and nothing is persisted — a prediction row with no
  // assessment behind it would be worse than no row at all.
  const result: PredictionResult = await mlClient.predict(snapshot);

  // The service is up but has no usable model. Persisting a prediction with a
  // null delay would create a row the schema's status/result constraint
  // classifies as FAILED, discarding the rule assessment that did succeed.
  // Refusing is clearer than storing a half-record.
  if (result.ml_estimate.predicted_delay_days === null) {
    throw new UnprocessableError(
      'The prediction service returned no delay estimate, so no assessment was recorded.',
      { ml_note: result.ml_estimate.note, prediction_type: result.ml_estimate.prediction_type },
    );
  }

  const modelVersionId = await ensureModelVersion();

  const insert = await supabaseAdmin
    .from('predictions')
    .insert({
      project_id: projectId,
      feature_snapshot_id: snapshot.id,
      model_version_id: modelVersionId,

      // The ML side.
      predicted_delay_days: result.ml_estimate.predicted_delay_days,
      prediction_type: result.ml_estimate.prediction_type,
      confidence: result.ml_estimate.confidence,
      prediction_status: 'SUCCESS',

      // The rule side. risk_level is the RULE ENGINE's band, not a bucketing
      // of the delay figure — see the column comment in migration 0004.
      risk_level: result.risk_level,
      risk_score: result.risk_score,
      rule_coverage_pct: result.coverage.coverage_pct,
      assessment_complete: result.coverage.sufficient,
      missing_core_inputs: result.coverage.missing_core_inputs,
      limitations: result.limitations,
    })
    .select(PREDICTION_COLUMNS)
    .single();

  if (insert.error) {
    throw translateDbError(insert.error, { resource: 'Prediction', context: { projectId } });
  }

  const prediction = insert.data as unknown as PredictionRow;

  // Children are written after the parent because they reference it. There is
  // no multi-statement transaction over PostgREST, so a failure here would
  // otherwise leave a prediction with no explanation — a row asserting a risk
  // level with nothing to justify it. The compensating delete keeps the
  // alternative (no record) rather than the misleading one.
  try {
    await saveExplanations(prediction.id, result.triggered_rules);
    await saveRecommendations(prediction.id, result.recommendations);
  } catch (err) {
    await supabaseAdmin.from('predictions').delete().eq('id', prediction.id);
    console.error('[prediction] rolled back after child insert failed', {
      predictionId: prediction.id,
      detail: (err as Error).message,
    });
    throw err;
  }

  return buildAssessment(prediction, result, snapshot);
}

function buildAssessment(
  prediction: PredictionRow,
  result: PredictionResult,
  snapshot: SnapshotRow,
): AssessmentResponse {
  return {
    prediction: {
      id: prediction.id,
      predicted_delay_days: result.ml_estimate.predicted_delay_days,
      model_version: result.ml_estimate.model_version,
      prediction_type: result.ml_estimate.prediction_type,
      confidence: result.ml_estimate.confidence,
      note: result.ml_estimate.note,
    },
    risk_assessment: {
      risk_score: result.risk_score,
      risk_level: result.risk_level,
      rule_coverage_pct: result.coverage.coverage_pct,
      assessment_complete: result.coverage.sufficient,
      triggered_rules: result.triggered_rules,
      skipped_rules: result.skipped_rules,
      explanation: result.explanation,
    },
    recommendations: result.recommendations.map((rec) => ({
      title: rec.title,
      action: rec.action,
      priority: rec.priority,
      rationale: rec.rationale,
      source_rule_id: rec.linked_rule_ids[0] ?? null,
    })),
    limitations: limitationFlags(result.limitations),
    missing_inputs: result.coverage.missing_core_inputs,
    snapshot: { id: snapshot.id, snapshot_date: snapshot.snapshot_date },
    created_at: prediction.created_at,
  };
}

/** Limitations as flat flags, which is what a client renders. */
function limitationFlags(limitations: Record<string, unknown>): string[] {
  const flags: string[] = [];
  if (limitations.dataset_size_limited) flags.push('dataset_size_limited');
  if (limitations.feature_variance_limited) flags.push('feature_variance_limited');
  if (limitations.predictors_largely_imputed) flags.push('predictors_largely_imputed');
  if (limitations.ml_outperforms_baseline === false) flags.push('ml_outperforms_baseline_false');
  if (limitations.rule_coverage_sufficient === false) flags.push('rule_coverage_insufficient');
  return flags;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listPredictions(projectId: string): Promise<PredictionRow[]> {
  const { data, error } = await supabaseAdmin
    .from('predictions')
    .select(PREDICTION_COLUMNS)
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });

  if (error) throw translateDbError(error, { resource: 'Prediction', context: { projectId } });
  return (data ?? []) as unknown as PredictionRow[];
}

export async function getLatestPrediction(projectId: string): Promise<PredictionRow> {
  const predictions = await listPredictions(projectId);
  const latest = predictions[0];
  if (!latest) throw new NotFoundError('Prediction');
  return latest;
}

export interface StoredAssessment {
  prediction: PredictionRow;
  explanations: Array<Record<string, unknown>>;
  recommendations: Array<Record<string, unknown>>;
}

/**
 * The stored assessment for the most recent prediction.
 *
 * Read back from the database rather than recomputed. Re-running the rules
 * against current project data would produce a different answer from the one
 * that was actually returned and acted on — a stored assessment is a record of
 * what was said at a moment in time.
 */
export async function getStoredAssessment(projectId: string): Promise<StoredAssessment> {
  const prediction = await getLatestPrediction(projectId);

  const [explanations, recommendations] = await Promise.all([
    supabaseAdmin
      .from('prediction_explanations')
      .select('feature_name, feature_value, contribution_score, contribution_direction, rank, explanation_source')
      .eq('prediction_id', prediction.id)
      .order('rank', { ascending: true }),
    supabaseAdmin
      .from('recommendations')
      .select('id, title, description, priority, recommended_action, status, source_rule_id, created_at')
      .eq('prediction_id', prediction.id)
      .order('created_at', { ascending: true }),
  ]);

  if (explanations.error) {
    throw translateDbError(explanations.error, { context: { op: 'getStoredAssessment' } });
  }
  if (recommendations.error) {
    throw translateDbError(recommendations.error, { context: { op: 'getStoredAssessment' } });
  }

  return {
    prediction,
    explanations: (explanations.data ?? []) as Array<Record<string, unknown>>,
    recommendations: (recommendations.data ?? []) as Array<Record<string, unknown>>,
  };
}
