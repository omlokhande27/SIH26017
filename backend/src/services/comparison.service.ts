import { supabaseAdmin } from '../config/supabase';
import { translateDbError } from '../utils/db-error';
import { visibleProjectIds } from './authorization.service';
import type { AppRole } from '../config/roles';

/**
 * Side-by-side project comparison.
 *
 * One SQL call for all requested projects, not one per project. The scope
 * array is applied inside the query, so a project the caller cannot see is
 * omitted rather than returned — and the response reports which ids came back,
 * so a silently shortened list is visible to the caller instead of looking
 * like the project does not exist.
 */

export interface ComparedProject {
  project_id: string;
  project_name: string;
  project_code: string;
  state: string;
  district: string;
  sector: string;
  implementing_agency: string;
  project_status: string;
  land_required_ha: string | null;
  land_acquired_ha: string | null;
  land_acquisition_percentage: string | null;
  possession_obtained: boolean | null;
  affected_families: number | null;
  compensation_required: string | null;
  compensation_paid: string | null;
  compensation_pending: string | null;
  compensation_pending_percentage: string | null;
  payment_status: string | null;
  issues: Record<string, boolean | number>;
  assessment: {
    prediction_id: string;
    risk_level: string;
    risk_score: number | string | null;
    predicted_delay_days: number | string | null;
    prediction_type: string | null;
    confidence: string | null;
    assessment_complete: boolean | null;
    rule_coverage_pct: number | string | null;
    assessed_at: string;
  } | null;
  has_assessment: boolean;
  recommendation_count: number;
}

export interface ComparisonResult {
  projects: ComparedProject[];
  requested: number;
  returned: number;
  /**
   * Ids asked for but not returned — either they do not exist, or the caller
   * cannot see them. Deliberately not distinguished: telling a caller "this
   * project exists but is not yours" is an enumeration oracle.
   */
  unavailable: string[];
}

export async function compareProjects(
  user: { id: string; role: AppRole },
  ids: string[],
): Promise<ComparisonResult> {
  const scope = await visibleProjectIds(user);

  const { data, error } = await supabaseAdmin.rpc('lg_compare_projects', {
    p_ids: ids,
    p_project_ids: scope,
  });

  if (error) throw translateDbError(error, { context: { op: 'compareProjects' } });

  const projects = (data ?? []) as ComparedProject[];
  const returnedIds = new Set(projects.map((p) => p.project_id));

  return {
    projects,
    requested: ids.length,
    returned: projects.length,
    unavailable: ids.filter((id) => !returnedIds.has(id)),
  };
}
