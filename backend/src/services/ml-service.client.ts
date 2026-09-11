import { ML_SERVICE_URL, env, features } from '../config/env';
import { DependencyUnavailableError } from '../utils/errors';
import type { SnapshotRow } from './snapshot.service';

/**
 * Client for the FastAPI ML service.
 *
 * The Node backend is the ONLY intended caller. The frontend never reaches the
 * ML service directly — if it could, it would be able to score feature vectors
 * of its own invention rather than snapshots the database actually recorded,
 * which would make every assessment unattributable.
 *
 * ###########################################################################
 * # WHAT THIS CLIENT SENDS, AND WHAT IT STRUCTURALLY CANNOT SEND            #
 * #                                                                        #
 * # It sends exactly the 21 feature columns of a stored snapshot, built     #
 * # field by field below. It has no access to actual_outcomes, and the ML   #
 * # service rejects unknown fields (extra="forbid") — so outcome data       #
 * # cannot reach the model even if a future edit tried to pass it.          #
 * #                                                                        #
 * # The service also holds no database credentials of its own, so it cannot #
 * # go and fetch outcomes either. The leakage boundary is architectural.    #
 * ###########################################################################
 *
 * Phase 4 scope: this client exists and is verified against a running service.
 * Persisting predictions and wiring the endpoints is Phase 5.
 */

/** How long to wait before giving up on the ML service. */
const REQUEST_TIMEOUT_MS = 10_000;

export interface TriggeredRule {
  rule_id: string;
  factor: string;
  category: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  contribution: number;
  reason: string;
  evidence: Record<string, unknown>;
}

export interface SkippedRule {
  rule_id: string;
  factor: string;
  category: string;
  missing_fields: string[];
  reason: string;
}

export interface RuleCoverage {
  rules_total: number;
  rules_evaluated: number;
  rules_skipped: number;
  coverage_pct: number;
  sufficient: boolean;
  missing_core_inputs: string[];
}

export interface Recommendation {
  title: string;
  action: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  rationale: string;
  linked_rule_ids: string[];
}

export interface MLEstimate {
  predicted_delay_days: number | null;
  prediction_type: 'EXPERIMENTAL_ML_ESTIMATE' | 'BASELINE_MEDIAN' | 'UNAVAILABLE';
  model_version: string | null;
  model_type: string | null;
  confidence: 'LOW' | 'NONE';
  beats_baseline: boolean;
  note: string;
}

export interface PredictionResult {
  project_id: string | null;
  snapshot_id: string | null;
  risk_score: number;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  triggered_rules: TriggeredRule[];
  skipped_rules: SkippedRule[];
  coverage: RuleCoverage;
  recommendations: Recommendation[];
  explanation: string;
  ml_estimate: MLEstimate;
  limitations: Record<string, unknown>;
}

export interface MlServiceHealth {
  status: string;
  version: string;
  auth_enabled: boolean;
  rule_engine: { rules: number; categories: number };
  model: { loaded: boolean; version: string | null; error: string | null };
}

/**
 * Build the request payload from a stored snapshot.
 *
 * Written out field by field rather than spreading the row. A spread would
 * forward whatever columns the row happened to carry, which is how an outcome
 * column reaches a model six months after someone adds it to a SELECT.
 */
function toRequestSnapshot(snapshot: SnapshotRow): Record<string, unknown> {
  const num = (v: string | number | null): number | null =>
    v === null || v === undefined ? null : Number(v);

  return {
    snapshot_id: snapshot.id,
    project_id: snapshot.project_id,
    snapshot_date: snapshot.snapshot_date,

    land_required_ha: num(snapshot.land_required_ha),
    land_acquired_ha: num(snapshot.land_acquired_ha),
    acquisition_percentage: num(snapshot.acquisition_percentage),

    compensation_pending: num(snapshot.compensation_pending),
    compensation_pending_percentage: num(snapshot.compensation_pending_percentage),

    affected_landowners: snapshot.affected_landowners,
    affected_families: snapshot.affected_families,

    court_cases_count: snapshot.court_cases_count,
    litigation_flag: snapshot.litigation_flag,
    land_dispute_flag: snapshot.land_dispute_flag,
    title_issue_flag: snapshot.title_issue_flag,
    land_record_issue_flag: snapshot.land_record_issue_flag,

    r_and_r_required: snapshot.r_and_r_required,
    r_and_r_pending: snapshot.r_and_r_pending,
    row_issue: snapshot.row_issue,
    encroachment: snapshot.encroachment,
    forest_clearance_pending: snapshot.forest_clearance_pending,
    possession_pending: snapshot.possession_pending,
    administrative_delay: snapshot.administrative_delay,

    notification_delay_days: snapshot.notification_delay_days,
    award_delay_days: snapshot.award_delay_days,
  };
}

async function callMlService<T>(path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  // The shared secret authenticates this backend to the ML service. It is read
  // from the environment and never logged.
  if (features.mlServiceAuth && env.ML_SERVICE_API_KEY) {
    headers['X-API-Key'] = env.ML_SERVICE_API_KEY;
  }

  let response: Response;
  try {
    response = await fetch(`${ML_SERVICE_URL}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers,
      ...(body !== undefined && { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    // Unreachable or timed out. The ML service being down must degrade the
    // product, never take the API down with it — the caller decides how to
    // handle an absent assessment.
    console.error('[ml] request failed', { path, detail: (err as Error).message });
    throw new DependencyUnavailableError('The prediction service is unavailable.');
  }

  if (!response.ok) {
    // Detail to the log; the caller gets a stable sentence. An ML service
    // error body can echo the payload, which is project data.
    const detail = await response.text().catch(() => '');
    console.error('[ml] non-OK response', { path, status: response.status, detail: detail.slice(0, 500) });

    if (response.status === 401) {
      throw new DependencyUnavailableError(
        'The prediction service rejected this backend’s credentials.',
      );
    }
    throw new DependencyUnavailableError('The prediction service returned an error.');
  }

  return (await response.json()) as T;
}

/** Full assessment: rule engine plus the experimental estimate. */
export async function predict(snapshot: SnapshotRow): Promise<PredictionResult> {
  return callMlService<PredictionResult>('/predict', { snapshot: toRequestSnapshot(snapshot) });
}

/** Rule engine only — no model involved. */
export async function evaluateRules(snapshot: SnapshotRow): Promise<{
  risk_score: number;
  risk_level: string;
  triggered_rules: TriggeredRule[];
  skipped_rules: SkippedRule[];
  coverage: RuleCoverage;
}> {
  return callMlService('/evaluate-rules', { snapshot: toRequestSnapshot(snapshot) });
}

/** Recommendations for whatever the rules found. */
export async function getRecommendations(snapshot: SnapshotRow): Promise<Recommendation[]> {
  return callMlService<Recommendation[]>('/recommendations', {
    snapshot: toRequestSnapshot(snapshot),
  });
}

/**
 * Liveness probe.
 *
 * Returns null rather than throwing: this is used by /health, which must keep
 * answering when a dependency is down. A health endpoint that goes dark during
 * an incident is useless at exactly the moment it is needed.
 */
export async function checkMlService(): Promise<MlServiceHealth | null> {
  try {
    const response = await fetch(`${ML_SERVICE_URL}/health`, {
      signal: AbortSignal.timeout(2_000),
    });
    if (!response.ok) return null;
    return (await response.json()) as MlServiceHealth;
  } catch {
    return null;
  }
}

/** The request payload builder, exported for tests. */
export const __testing = { toRequestSnapshot };
