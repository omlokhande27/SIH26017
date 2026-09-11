import { supabaseAdmin } from '../config/supabase';
import { translateDbError } from '../utils/db-error';
import { visibleProjectIds } from './authorization.service';
import type { AppRole } from '../config/roles';

/**
 * Dashboard and analytics aggregation.
 *
 * ###########################################################################
 * # AGGREGATION HAPPENS IN SQL, NOT HERE.                                   #
 * #                                                                        #
 * # Every function below is a thin wrapper over a database function from    #
 * # migration 0005. That is not a style preference:                        #
 * #                                                                        #
 * #   PostgREST serialises NUMERIC as a JSON number, so a monetary column   #
 * #   arrives in Node as an IEEE-754 double. Summing thousands of those     #
 * #   accumulates exactly the error NUMERIC exists to prevent. Totals are   #
 * #   computed in SQL as NUMERIC and returned as TEXT, reaching the API     #
 * #   exact and staying exact.                                             #
 * #                                                                        #
 * #   It is also the only option available: aggregate functions are        #
 * #   disabled at the PostgREST layer on this project (PGRST123), so       #
 * #   `select=count()` is not a route.                                     #
 * ###########################################################################
 *
 * AUTHORIZATION: every call passes `visibleProjectIds(user)`. These queries
 * span the whole table, so there is no project id for `requireProjectAccess`
 * to guard, and the service-role key bypasses RLS. That scoped list is the
 * only thing standing between an OFFICER and national totals.
 */

async function callRpc<T>(
  fn: string,
  user: { id: string; role: AppRole },
  extraArgs: Record<string, unknown> = {},
): Promise<T> {
  // `null` means "no restriction" and is what the SQL expects for a caller
  // with global read. An empty array means "nothing visible" and yields zeros.
  const scope = await visibleProjectIds(user);

  const { data, error } = await supabaseAdmin.rpc(fn, {
    p_project_ids: scope,
    ...extraArgs,
  });

  if (error) {
    throw translateDbError(error, { context: { op: fn, role: user.role } });
  }
  return data as T;
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export interface DashboardOverview {
  total_projects: number;
  total_projects_with_assessments: number;
  projects_without_assessments: number;
  low_risk_projects: number;
  medium_risk_projects: number;
  high_risk_projects: number;
  critical_risk_projects: number;
  /** Text, not number — NUMERIC precision is preserved across the wire. */
  average_predicted_delay_days: string | null;
  average_risk_score: string | null;
  latest_assessment_count: number;
  incomplete_assessments: number;
  projects_with_pending_compensation: number;
  projects_with_land_disputes: number;
  projects_with_litigation: number;
  projects_with_row_issues: number;
  projects_with_encroachment: number;
  projects_with_land_record_issues: number;
  projects_with_title_issues: number;
  projects_with_forest_clearance_issues: number;
  projects_with_rr_issues: number;
  projects_with_possession_pending: number;
  projects_with_administrative_delay: number;
}

export const getDashboardOverview = (user: { id: string; role: AppRole }) =>
  callRpc<DashboardOverview>('lg_dashboard_overview', user);

export interface RiskDistributionRow {
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  project_count: number;
}

/**
 * Always returns all four bands, including empty ones.
 *
 * A chart that silently omits CRITICAL because no project is currently
 * critical implies the band does not exist.
 */
export const getRiskDistribution = (user: { id: string; role: AppRole }) =>
  callRpc<RiskDistributionRow[]>('lg_risk_distribution', user);

export interface HighRiskProject {
  project_id: string;
  project_name: string;
  project_code: string;
  state: string;
  district: string;
  sector: string;
  implementing_agency: string;
  project_status: string;
  prediction_id: string;
  risk_level: string;
  risk_score: number | string | null;
  predicted_delay_days: number | string | null;
  prediction_type: string | null;
  confidence: string | null;
  assessment_complete: boolean | null;
  assessed_at: string;
  top_triggered_rules: Array<{ rule_id: string; contribution: number; rank: number }>;
  top_recommendations: Array<{
    title: string;
    priority: string;
    source_rule_id: string | null;
    status: string;
  }>;
  recommendation_count: number;
}

export interface HighRiskQuery {
  limit?: number;
  state?: string;
  risk_level?: string;
}

/**
 * Ranked by the LATEST assessment per project, in one query.
 *
 * Triggered rules and recommendations are gathered with LATERAL subqueries in
 * SQL rather than a follow-up call per project — the N+1 this endpoint would
 * otherwise be.
 */
export const getHighRiskProjects = (user: { id: string; role: AppRole }, query: HighRiskQuery) =>
  callRpc<HighRiskProject[]>('lg_high_risk_projects', user, {
    p_limit: query.limit ?? 10,
    p_state: query.state ?? null,
    p_risk_level: query.risk_level ?? null,
  });

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

export interface StateAnalyticsRow {
  state: string;
  total_projects: number;
  assessed_projects: number;
  low_risk: number;
  medium_risk: number;
  high_risk: number;
  critical_risk: number;
  average_delay_days: string | null;
  average_risk_score: string | null;
  average_acquisition_percentage: string | null;
  total_compensation_pending: string;
  projects_with_major_issues: number;
}

export const getAnalyticsByState = (user: { id: string; role: AppRole }) =>
  callRpc<StateAnalyticsRow[]>('lg_analytics_by_state', user);

export interface LandAcquisitionAnalytics {
  projects_with_land_data: number;
  total_land_required_ha: string;
  total_land_acquired_ha: string;
  total_land_pending_ha: string;
  /** Mean of per-project percentages — every project counts equally. */
  average_acquisition_percentage: string | null;
  /** Portfolio position — a 900 ha project outweighs a 10 ha one. */
  overall_acquisition_percentage: string | null;
  projects_below_25_percent: number;
  projects_below_50_percent: number;
  projects_below_75_percent: number;
  projects_fully_acquired: number;
  projects_possession_obtained: number;
  total_affected_landowners: number;
  total_affected_families: number;
  projects_with_compensation_data: number;
  total_compensation_required: string;
  total_compensation_paid: string;
  total_compensation_pending: string;
  overall_compensation_pending_percentage: string | null;
  projects_with_pending_compensation: number;
  projects_with_disputed_payment: number;
}

export const getLandAcquisitionAnalytics = (user: { id: string; role: AppRole }) =>
  callRpc<LandAcquisitionAnalytics>('lg_analytics_land_acquisition', user);

export interface DelayAnalytics {
  assessed_projects: number;
  average_delay_days: string | null;
  median_delay_days: string | null;
  min_delay_days: string | null;
  max_delay_days: string | null;
  delay_buckets: Array<{ range: string; project_count: number }>;
  risk_score_buckets: Array<{ range: string; project_count: number }>;
  assessments_by_day: Array<{ date: string; count: number }>;
  incomplete_assessments: number;
  model_types_in_use: string[];
  confidence_levels_in_use: string[];
}

export const getDelayAnalytics = (user: { id: string; role: AppRole }) =>
  callRpc<DelayAnalytics>('lg_analytics_delay', user);
