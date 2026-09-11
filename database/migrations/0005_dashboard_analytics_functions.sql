-- ============================================================================
-- 0005 — SQL aggregation functions for the dashboard and analytics layer
-- ============================================================================
--
-- WHY FUNCTIONS AND NOT PostgREST AGGREGATES
--
-- This project has aggregate functions disabled at the PostgREST layer
-- (PGRST123 "Use of aggregate functions is not allowed"), which is Supabase's
-- default. Without these functions the API would have to pull every row into
-- Node and reduce it there.
--
-- For counts that would merely be slow. For MONEY it would be wrong: PostgREST
-- serialises NUMERIC as a JSON number, so `compensation_pending` arrives in
-- JavaScript as an IEEE-754 double. Summing thousands of those accumulates
-- exactly the error NUMERIC exists to prevent. Every monetary total below is
-- computed in SQL as NUMERIC and returned as TEXT, so it reaches the API
-- exact and stays exact.
--
-- ---------------------------------------------------------------------------
-- AUTHORIZATION CONTRACT — READ BEFORE CALLING
-- ---------------------------------------------------------------------------
-- Every function takes `p_project_ids uuid[]`:
--
--   NULL          -> no restriction (caller has global read: ADMIN/ANALYST/VIEWER)
--   '{}'          -> empty set, returns zeros (an OFFICER with no assignments)
--   {id, id, ...} -> restricted to exactly these projects
--
-- The BACKEND computes that list from `public.profiles`, using the same
-- visibility rule as `requireProjectAccess`. These functions do not re-derive
-- it, so there is ONE authorization path rather than two that can drift.
--
-- They are SECURITY INVOKER (the default) on purpose. The backend calls them
-- with the service-role key, which already bypasses RLS, so DEFINER would add
-- privilege without adding safety. A future caller holding only an anon key
-- stays subject to RLS, which is the correct behaviour for that caller.
--
-- `search_path` is pinned on each function regardless, so a caller-set path
-- cannot redirect them to tables of its own making.
-- ---------------------------------------------------------------------------

BEGIN;

-- Helper: does this project fall inside the caller's visible set?
-- NULL array means unrestricted; this is the single place that rule is encoded.
CREATE OR REPLACE FUNCTION public.lg_in_scope(p_project_id UUID, p_project_ids UUID[])
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT p_project_ids IS NULL OR p_project_id = ANY (p_project_ids);
$$;


-- ---------------------------------------------------------------------------
-- 1. Dashboard overview
-- ---------------------------------------------------------------------------
-- Counts of projects, assessment coverage, risk bands, and how many projects
-- carry each operational issue.
--
-- Issue flags come from the LATEST feature snapshot per project, not from a
-- scan of every snapshot ever taken: a dispute resolved last year must not
-- keep a project counted as disputed forever.
CREATE OR REPLACE FUNCTION public.lg_dashboard_overview(p_project_ids UUID[] DEFAULT NULL)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
WITH scoped AS (
  SELECT p.id
  FROM public.projects p
  WHERE public.lg_in_scope(p.id, p_project_ids)
),
latest_prediction AS (
  -- DISTINCT ON gives one row per project: the most recent prediction.
  SELECT DISTINCT ON (pr.project_id)
         pr.project_id, pr.risk_level, pr.risk_score,
         pr.predicted_delay_days, pr.assessment_complete, pr.created_at
  FROM public.predictions pr
  JOIN scoped s ON s.id = pr.project_id
  WHERE pr.prediction_status = 'SUCCESS'
  ORDER BY pr.project_id, pr.created_at DESC
),
latest_snapshot AS (
  SELECT DISTINCT ON (fs.project_id) fs.*
  FROM public.project_feature_snapshots fs
  JOIN scoped s ON s.id = fs.project_id
  ORDER BY fs.project_id, fs.snapshot_date DESC
)
SELECT jsonb_build_object(
  'total_projects', (SELECT COUNT(*) FROM scoped),
  'total_projects_with_assessments', (SELECT COUNT(*) FROM latest_prediction),
  'projects_without_assessments',
    (SELECT COUNT(*) FROM scoped) - (SELECT COUNT(*) FROM latest_prediction),

  'low_risk_projects',      (SELECT COUNT(*) FROM latest_prediction WHERE risk_level = 'LOW'),
  'medium_risk_projects',   (SELECT COUNT(*) FROM latest_prediction WHERE risk_level = 'MEDIUM'),
  'high_risk_projects',     (SELECT COUNT(*) FROM latest_prediction WHERE risk_level = 'HIGH'),
  'critical_risk_projects', (SELECT COUNT(*) FROM latest_prediction WHERE risk_level = 'CRITICAL'),

  -- NUMERIC average, rendered as text. Rounded to one decimal because a delay
  -- estimate carrying more precision than that would overstate what it knows.
  'average_predicted_delay_days',
    (SELECT ROUND(AVG(predicted_delay_days), 1)::TEXT FROM latest_prediction
     WHERE predicted_delay_days IS NOT NULL),
  'average_risk_score',
    (SELECT ROUND(AVG(risk_score), 1)::TEXT FROM latest_prediction WHERE risk_score IS NOT NULL),

  'latest_assessment_count', (SELECT COUNT(*) FROM latest_prediction),
  'incomplete_assessments',
    (SELECT COUNT(*) FROM latest_prediction WHERE assessment_complete IS FALSE),

  -- Operational issues, from the latest snapshot per project.
  'projects_with_pending_compensation',
    (SELECT COUNT(*) FROM latest_snapshot WHERE compensation_pending > 0),
  'projects_with_land_disputes',
    (SELECT COUNT(*) FROM latest_snapshot WHERE land_dispute_flag),
  'projects_with_litigation',
    (SELECT COUNT(*) FROM latest_snapshot WHERE litigation_flag),
  'projects_with_row_issues',
    (SELECT COUNT(*) FROM latest_snapshot WHERE row_issue),
  'projects_with_encroachment',
    (SELECT COUNT(*) FROM latest_snapshot WHERE encroachment),
  'projects_with_land_record_issues',
    (SELECT COUNT(*) FROM latest_snapshot WHERE land_record_issue_flag),
  'projects_with_title_issues',
    (SELECT COUNT(*) FROM latest_snapshot WHERE title_issue_flag),
  'projects_with_forest_clearance_issues',
    (SELECT COUNT(*) FROM latest_snapshot WHERE forest_clearance_pending),
  'projects_with_rr_issues',
    (SELECT COUNT(*) FROM latest_snapshot WHERE r_and_r_pending),
  'projects_with_possession_pending',
    (SELECT COUNT(*) FROM latest_snapshot WHERE possession_pending),
  'projects_with_administrative_delay',
    (SELECT COUNT(*) FROM latest_snapshot WHERE administrative_delay)
);
$$;


-- ---------------------------------------------------------------------------
-- 2. Risk distribution
-- ---------------------------------------------------------------------------
-- One row per risk level, always all four, so a chart does not silently omit
-- an empty band and imply it cannot occur.
CREATE OR REPLACE FUNCTION public.lg_risk_distribution(p_project_ids UUID[] DEFAULT NULL)
RETURNS TABLE (risk_level TEXT, project_count BIGINT)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
WITH levels(risk_level, sort_order) AS (
  VALUES ('LOW', 1), ('MEDIUM', 2), ('HIGH', 3), ('CRITICAL', 4)
),
latest AS (
  SELECT DISTINCT ON (pr.project_id) pr.project_id, pr.risk_level
  FROM public.predictions pr
  WHERE pr.prediction_status = 'SUCCESS'
    AND public.lg_in_scope(pr.project_id, p_project_ids)
  ORDER BY pr.project_id, pr.created_at DESC
)
SELECT l.risk_level, COUNT(la.project_id)
FROM levels l
LEFT JOIN latest la ON la.risk_level = l.risk_level
GROUP BY l.risk_level, l.sort_order
ORDER BY l.sort_order;
$$;


-- ---------------------------------------------------------------------------
-- 3. Analytics by state
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lg_analytics_by_state(p_project_ids UUID[] DEFAULT NULL)
RETURNS TABLE (
  state TEXT,
  total_projects BIGINT,
  assessed_projects BIGINT,
  low_risk BIGINT,
  medium_risk BIGINT,
  high_risk BIGINT,
  critical_risk BIGINT,
  average_delay_days TEXT,
  average_risk_score TEXT,
  average_acquisition_percentage TEXT,
  total_compensation_pending TEXT,
  projects_with_major_issues BIGINT
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
WITH scoped AS (
  SELECT p.id, p.state
  FROM public.projects p
  WHERE public.lg_in_scope(p.id, p_project_ids)
),
latest_prediction AS (
  SELECT DISTINCT ON (pr.project_id)
         pr.project_id, pr.risk_level, pr.risk_score, pr.predicted_delay_days
  FROM public.predictions pr
  JOIN scoped s ON s.id = pr.project_id
  WHERE pr.prediction_status = 'SUCCESS'
  ORDER BY pr.project_id, pr.created_at DESC
),
latest_snapshot AS (
  SELECT DISTINCT ON (fs.project_id) fs.*
  FROM public.project_feature_snapshots fs
  JOIN scoped s ON s.id = fs.project_id
  ORDER BY fs.project_id, fs.snapshot_date DESC
)
SELECT
  s.state,
  COUNT(DISTINCT s.id),
  COUNT(DISTINCT lp.project_id),
  COUNT(DISTINCT lp.project_id) FILTER (WHERE lp.risk_level = 'LOW'),
  COUNT(DISTINCT lp.project_id) FILTER (WHERE lp.risk_level = 'MEDIUM'),
  COUNT(DISTINCT lp.project_id) FILTER (WHERE lp.risk_level = 'HIGH'),
  COUNT(DISTINCT lp.project_id) FILTER (WHERE lp.risk_level = 'CRITICAL'),
  ROUND(AVG(lp.predicted_delay_days), 1)::TEXT,
  ROUND(AVG(lp.risk_score), 1)::TEXT,
  ROUND(AVG(ls.acquisition_percentage), 2)::TEXT,
  -- Money summed in SQL as NUMERIC, returned as text.
  COALESCE(SUM(ls.compensation_pending), 0)::TEXT,
  COUNT(DISTINCT ls.project_id) FILTER (
    WHERE ls.litigation_flag OR ls.land_dispute_flag OR ls.title_issue_flag
       OR ls.encroachment OR ls.r_and_r_pending OR ls.forest_clearance_pending
  )
FROM scoped s
LEFT JOIN latest_prediction lp ON lp.project_id = s.id
LEFT JOIN latest_snapshot   ls ON ls.project_id = s.id
GROUP BY s.state
ORDER BY COUNT(DISTINCT s.id) DESC, s.state;
$$;


-- ---------------------------------------------------------------------------
-- 4. Land acquisition analytics
-- ---------------------------------------------------------------------------
-- Reads `land_acquisition` directly, so the figures are the CURRENT operational
-- position rather than whatever was frozen into a snapshot at prediction time.
-- Generated columns are read, never written.
CREATE OR REPLACE FUNCTION public.lg_analytics_land_acquisition(p_project_ids UUID[] DEFAULT NULL)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
WITH scoped AS (
  SELECT la.*
  FROM public.land_acquisition la
  WHERE public.lg_in_scope(la.project_id, p_project_ids)
),
comp AS (
  SELECT c.*
  FROM public.compensation c
  WHERE public.lg_in_scope(c.project_id, p_project_ids)
)
SELECT jsonb_build_object(
  'projects_with_land_data', (SELECT COUNT(*) FROM scoped),

  -- Hectares: NUMERIC throughout, text out.
  'total_land_required_ha',  (SELECT COALESCE(SUM(land_required_ha), 0)::TEXT FROM scoped),
  'total_land_acquired_ha',  (SELECT COALESCE(SUM(land_acquired_ha), 0)::TEXT FROM scoped),
  'total_land_pending_ha',
    (SELECT COALESCE(SUM(land_required_ha - land_acquired_ha), 0)::TEXT FROM scoped),

  -- Two different averages, and the difference matters. The first is the mean
  -- of per-project percentages (every project counts equally); the second is
  -- the portfolio position (a 900 ha project outweighs a 10 ha one). Reporting
  -- only one of them invites the wrong reading.
  'average_acquisition_percentage',
    (SELECT ROUND(AVG(land_acquisition_percentage), 2)::TEXT FROM scoped),
  'overall_acquisition_percentage',
    (SELECT CASE WHEN COALESCE(SUM(land_required_ha), 0) > 0
                 THEN ROUND(SUM(land_acquired_ha) / SUM(land_required_ha) * 100, 2)::TEXT
                 ELSE NULL END
     FROM scoped),

  'projects_below_25_percent',  (SELECT COUNT(*) FROM scoped WHERE land_acquisition_percentage < 25),
  'projects_below_50_percent',  (SELECT COUNT(*) FROM scoped WHERE land_acquisition_percentage < 50),
  'projects_below_75_percent',  (SELECT COUNT(*) FROM scoped WHERE land_acquisition_percentage < 75),
  'projects_fully_acquired',    (SELECT COUNT(*) FROM scoped WHERE land_acquisition_percentage >= 100),
  'projects_possession_obtained', (SELECT COUNT(*) FROM scoped WHERE possession_obtained),

  'total_affected_landowners', (SELECT COALESCE(SUM(affected_landowners), 0) FROM scoped),
  'total_affected_families',   (SELECT COALESCE(SUM(affected_families), 0) FROM scoped),

  'projects_with_compensation_data', (SELECT COUNT(*) FROM comp),
  'total_compensation_required', (SELECT COALESCE(SUM(total_compensation_required), 0)::TEXT FROM comp),
  'total_compensation_paid',     (SELECT COALESCE(SUM(total_compensation_paid), 0)::TEXT FROM comp),
  'total_compensation_pending',  (SELECT COALESCE(SUM(compensation_pending), 0)::TEXT FROM comp),
  'overall_compensation_pending_percentage',
    (SELECT CASE WHEN COALESCE(SUM(total_compensation_required), 0) > 0
                 THEN ROUND(SUM(compensation_pending) / SUM(total_compensation_required) * 100, 2)::TEXT
                 ELSE NULL END
     FROM comp),
  'projects_with_pending_compensation', (SELECT COUNT(*) FROM comp WHERE compensation_pending > 0),
  'projects_with_disputed_payment',     (SELECT COUNT(*) FROM comp WHERE payment_status = 'DISPUTED')
);
$$;


-- ---------------------------------------------------------------------------
-- 5. Delay analytics
-- ---------------------------------------------------------------------------
-- NOTE ON WHAT THESE NUMBERS ARE. While the ML service serves BASELINE_MEDIAN,
-- every predicted_delay_days is the SAME historical median, so the "spread"
-- below has no variance and carries no project-specific signal. The buckets
-- exist so the shape is already correct when a genuinely predictive model
-- replaces the baseline; the API reports prediction_type alongside them so a
-- client can see which situation it is in.
CREATE OR REPLACE FUNCTION public.lg_analytics_delay(p_project_ids UUID[] DEFAULT NULL)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
WITH latest AS (
  SELECT DISTINCT ON (pr.project_id)
         pr.project_id, pr.predicted_delay_days, pr.risk_score, pr.risk_level,
         pr.prediction_type, pr.confidence, pr.created_at, pr.assessment_complete
  FROM public.predictions pr
  WHERE pr.prediction_status = 'SUCCESS'
    AND public.lg_in_scope(pr.project_id, p_project_ids)
  ORDER BY pr.project_id, pr.created_at DESC
)
SELECT jsonb_build_object(
  'assessed_projects', (SELECT COUNT(*) FROM latest),
  'average_delay_days', (SELECT ROUND(AVG(predicted_delay_days), 1)::TEXT FROM latest),
  'median_delay_days',
    (SELECT ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY predicted_delay_days)::NUMERIC, 1)::TEXT
     FROM latest),
  'min_delay_days', (SELECT MIN(predicted_delay_days)::TEXT FROM latest),
  'max_delay_days', (SELECT MAX(predicted_delay_days)::TEXT FROM latest),

  'delay_buckets', (
    SELECT COALESCE(jsonb_agg(b ORDER BY b->>'sort'), '[]'::jsonb) FROM (
      SELECT jsonb_build_object('range', r.label, 'sort', r.sort, 'project_count',
        (SELECT COUNT(*) FROM latest
         WHERE predicted_delay_days >= r.lo
           AND (r.hi IS NULL OR predicted_delay_days < r.hi))) AS b
      FROM (VALUES
        ('0-90 days',     0,    90,   1),
        ('90-180 days',   90,   180,  2),
        ('180-365 days',  180,  365,  3),
        ('365-730 days',  365,  730,  4),
        ('730+ days',     730,  NULL, 5)
      ) AS r(label, lo, hi, sort)
    ) x
  ),

  'risk_score_buckets', (
    SELECT COALESCE(jsonb_agg(b ORDER BY b->>'sort'), '[]'::jsonb) FROM (
      SELECT jsonb_build_object('range', r.label, 'sort', r.sort, 'project_count',
        (SELECT COUNT(*) FROM latest
         WHERE risk_score >= r.lo AND (r.hi IS NULL OR risk_score < r.hi))) AS b
      FROM (VALUES
        ('0-30 (LOW)',       0,  30,   1),
        ('30-60 (MEDIUM)',   30, 60,   2),
        ('60-80 (HIGH)',     60, 80,   3),
        ('80-100 (CRITICAL)',80, NULL, 4)
      ) AS r(label, lo, hi, sort)
    ) x
  ),

  -- Assessment activity over time, for a trend line.
  'assessments_by_day', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('date', d, 'count', c) ORDER BY d), '[]'::jsonb)
    FROM (
      SELECT created_at::DATE AS d, COUNT(*) AS c
      FROM public.predictions
      WHERE prediction_status = 'SUCCESS'
        AND public.lg_in_scope(project_id, p_project_ids)
        AND created_at >= NOW() - INTERVAL '90 days'
      GROUP BY created_at::DATE
    ) t
  ),

  'incomplete_assessments', (SELECT COUNT(*) FROM latest WHERE assessment_complete IS FALSE),

  -- Honesty metadata carried straight through from what was stored.
  'model_types_in_use', (
    SELECT COALESCE(jsonb_agg(DISTINCT prediction_type), '[]'::jsonb)
    FROM latest WHERE prediction_type IS NOT NULL
  ),
  'confidence_levels_in_use', (
    SELECT COALESCE(jsonb_agg(DISTINCT confidence), '[]'::jsonb)
    FROM latest WHERE confidence IS NOT NULL
  )
);
$$;


-- ---------------------------------------------------------------------------
-- 6. High-risk projects
-- ---------------------------------------------------------------------------
-- One query, not one-per-project. Triggered rules and recommendations are
-- aggregated with LATERAL subqueries so the whole ranked list comes back in a
-- single round trip rather than N+1.
CREATE OR REPLACE FUNCTION public.lg_high_risk_projects(
  p_project_ids UUID[] DEFAULT NULL,
  p_limit INTEGER DEFAULT 10,
  p_state TEXT DEFAULT NULL,
  p_risk_level TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
WITH latest AS (
  SELECT DISTINCT ON (pr.project_id) pr.*
  FROM public.predictions pr
  WHERE pr.prediction_status = 'SUCCESS'
    AND public.lg_in_scope(pr.project_id, p_project_ids)
  ORDER BY pr.project_id, pr.created_at DESC
)
SELECT COALESCE(jsonb_agg(row ORDER BY (row->>'risk_score')::NUMERIC DESC NULLS LAST), '[]'::jsonb)
FROM (
  SELECT jsonb_build_object(
    'project_id', p.id,
    'project_name', p.project_name,
    'project_code', p.project_code,
    'state', p.state,
    'district', p.district,
    'sector', p.sector,
    'implementing_agency', p.implementing_agency,
    'project_status', p.project_status,
    'prediction_id', l.id,
    'risk_level', l.risk_level,
    'risk_score', l.risk_score,
    'predicted_delay_days', l.predicted_delay_days,
    'prediction_type', l.prediction_type,
    'confidence', l.confidence,
    'assessment_complete', l.assessment_complete,
    'assessed_at', l.created_at,
    'top_triggered_rules', COALESCE(tr.rules, '[]'::jsonb),
    'top_recommendations', COALESCE(rc.recs, '[]'::jsonb),
    'recommendation_count', COALESCE(rc.total, 0)
  ) AS row
  FROM latest l
  JOIN public.projects p ON p.id = l.project_id
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object(
             'rule_id', e.feature_name,
             'contribution', e.contribution_score,
             'rank', e.rank
           ) ORDER BY e.rank) AS rules
    FROM (
      SELECT * FROM public.prediction_explanations
      WHERE prediction_id = l.id AND explanation_source = 'RULE_ENGINE'
      ORDER BY rank LIMIT 5
    ) e
  ) tr ON TRUE
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object(
             'title', r.title,
             'priority', r.priority,
             'source_rule_id', r.source_rule_id,
             'status', r.status
           )) AS recs,
           (SELECT COUNT(*) FROM public.recommendations WHERE prediction_id = l.id) AS total
    FROM (
      SELECT * FROM public.recommendations
      WHERE prediction_id = l.id
      ORDER BY CASE priority
                 WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2
                 WHEN 'MEDIUM' THEN 3 ELSE 4 END
      LIMIT 3
    ) r
  ) rc ON TRUE
  WHERE (p_state IS NULL OR p.state = p_state)
    AND (p_risk_level IS NULL OR l.risk_level = p_risk_level)
  ORDER BY l.risk_score DESC NULLS LAST, l.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 10), 100))
) ranked;
$$;


-- ---------------------------------------------------------------------------
-- 7. Project comparison
-- ---------------------------------------------------------------------------
-- Side-by-side data for a handful of named projects, in ONE query.
--
-- The scope array is applied here as well as to the explicit id list, so an
-- OFFICER asking to compare a project they cannot see gets it omitted rather
-- than returned. The API reports which of the requested ids came back, so a
-- silently shortened list is visible to the caller rather than looking like
-- the project does not exist.
CREATE OR REPLACE FUNCTION public.lg_compare_projects(
  p_ids UUID[],
  p_project_ids UUID[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
WITH latest AS (
  SELECT DISTINCT ON (pr.project_id) pr.*
  FROM public.predictions pr
  WHERE pr.prediction_status = 'SUCCESS'
    AND pr.project_id = ANY (p_ids)
  ORDER BY pr.project_id, pr.created_at DESC
),
latest_snapshot AS (
  SELECT DISTINCT ON (fs.project_id) fs.*
  FROM public.project_feature_snapshots fs
  WHERE fs.project_id = ANY (p_ids)
  ORDER BY fs.project_id, fs.snapshot_date DESC
)
SELECT COALESCE(jsonb_agg(row ORDER BY row->>'project_name'), '[]'::jsonb)
FROM (
  SELECT jsonb_build_object(
    'project_id', p.id,
    'project_name', p.project_name,
    'project_code', p.project_code,
    'state', p.state,
    'district', p.district,
    'sector', p.sector,
    'implementing_agency', p.implementing_agency,
    'project_status', p.project_status,

    -- Current operational position, read from the live tables.
    'land_required_ha', la.land_required_ha::TEXT,
    'land_acquired_ha', la.land_acquired_ha::TEXT,
    'land_acquisition_percentage', la.land_acquisition_percentage::TEXT,
    'possession_obtained', la.possession_obtained,
    'affected_families', la.affected_families,

    'compensation_required', c.total_compensation_required::TEXT,
    'compensation_paid', c.total_compensation_paid::TEXT,
    'compensation_pending', c.compensation_pending::TEXT,
    'compensation_pending_percentage', c.compensation_pending_percentage::TEXT,
    'payment_status', c.payment_status,

    -- Issue flags from the latest snapshot.
    'issues', jsonb_build_object(
      'litigation', COALESCE(ls.litigation_flag, FALSE),
      'land_dispute', COALESCE(ls.land_dispute_flag, FALSE),
      'title_issue', COALESCE(ls.title_issue_flag, FALSE),
      'land_record_issue', COALESCE(ls.land_record_issue_flag, FALSE),
      'row_issue', COALESCE(ls.row_issue, FALSE),
      'encroachment', COALESCE(ls.encroachment, FALSE),
      'forest_clearance_pending', COALESCE(ls.forest_clearance_pending, FALSE),
      'r_and_r_pending', COALESCE(ls.r_and_r_pending, FALSE),
      'possession_pending', COALESCE(ls.possession_pending, FALSE),
      'administrative_delay', COALESCE(ls.administrative_delay, FALSE),
      'court_cases_count', COALESCE(ls.court_cases_count, 0)
    ),

    -- Latest assessment, or nulls when the project has never been assessed.
    -- Nulls rather than zeros: "not assessed" is not "assessed as zero risk".
    'assessment', CASE WHEN l.id IS NULL THEN NULL ELSE jsonb_build_object(
      'prediction_id', l.id,
      'risk_level', l.risk_level,
      'risk_score', l.risk_score,
      'predicted_delay_days', l.predicted_delay_days,
      'prediction_type', l.prediction_type,
      'confidence', l.confidence,
      'assessment_complete', l.assessment_complete,
      'rule_coverage_pct', l.rule_coverage_pct,
      'assessed_at', l.created_at
    ) END,
    'has_assessment', (l.id IS NOT NULL),
    'recommendation_count',
      (SELECT COUNT(*) FROM public.recommendations WHERE prediction_id = l.id)
  ) AS row
  FROM public.projects p
  LEFT JOIN public.land_acquisition la ON la.project_id = p.id
  LEFT JOIN public.compensation      c  ON c.project_id  = p.id
  LEFT JOIN latest                   l  ON l.project_id  = p.id
  LEFT JOIN latest_snapshot          ls ON ls.project_id = p.id
  WHERE p.id = ANY (p_ids)
    AND public.lg_in_scope(p.id, p_project_ids)
) cmp;
$$;

COMMIT;
