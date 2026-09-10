-- ============================================================================
-- LandGuard AI — Predictive Analytics System for Early Detection of
-- Land Acquisition Delays
--
-- Canonical PostgreSQL / Supabase schema.
--
-- Run this file in the Supabase SQL Editor (or via psql) against a fresh
-- project. It is written to be re-runnable: every object uses IF NOT EXISTS
-- or DROP ... IF EXISTS, so applying it twice is safe.
--
-- Object order matters and is deliberate:
--   1. extensions           5. domain tables (parents before children)
--   2. helper functions     6. indexes
--   3. reference tables     7. updated_at triggers
--   4. identity tables      8. row level security
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. EXTENSIONS / UUID STRATEGY
-- ----------------------------------------------------------------------------
-- gen_random_uuid() is built into PostgreSQL 13+ and Supabase runs 15+, so no
-- extension is normally needed. pgcrypto is installed only as a fallback for
-- older instances, so this file also applies to a legacy database.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'gen_random_uuid') THEN
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
  END IF;
END $$;


-- ----------------------------------------------------------------------------
-- 2. HELPER FUNCTIONS
-- ----------------------------------------------------------------------------

-- Reusable updated_at maintenance. Attached to every table that has an
-- updated_at column via the trigger loop in section 7 — the function is
-- written once rather than repeated per table.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. REFERENCE TABLES
-- ----------------------------------------------------------------------------

-- Risk factor vocabulary lives in a lookup table rather than a CHECK
-- constraint or enum, because the brief requires new factor types to be added
-- without destructive schema changes. Adding a type is a single INSERT.
CREATE TABLE IF NOT EXISTS public.risk_factor_types (
  code        TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  description TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.risk_factor_types (code, label, description) VALUES
  ('R_AND_R_PENDING',          'R&R Pending',              'Rehabilitation and resettlement obligations outstanding'),
  ('ROW_ISSUE',                'Right of Way Issue',       'Right-of-way not secured or contested'),
  ('ENCROACHMENT',             'Encroachment',             'Unauthorised occupation of project land'),
  ('FOREST_CLEARANCE_PENDING', 'Forest Clearance Pending', 'Statutory forest or environmental clearance outstanding'),
  ('POSSESSION_PENDING',       'Possession Pending',       'Award passed but physical possession not handed over'),
  ('ADMINISTRATIVE_DELAY',     'Administrative Delay',     'Internal approval or processing bottleneck'),
  ('LANDOWNER_OBJECTION',      'Landowner Objection',      'Objection raised by affected landowners')
ON CONFLICT (code) DO NOTHING;


-- ----------------------------------------------------------------------------
-- 4. IDENTITY
-- ----------------------------------------------------------------------------

-- One row per authenticated user, keyed to Supabase's auth.users.
--
-- role is stored here, server-side, and is never accepted from a client
-- request body. RLS (section 8) prevents a user from editing their own role.
CREATE TABLE IF NOT EXISTS public.profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name  TEXT,
  role       TEXT NOT NULL DEFAULT 'VIEWER'
             CHECK (role IN ('ADMIN', 'OFFICER', 'ANALYST', 'VIEWER')),
  department TEXT,
  state      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- --- automatic profile provisioning ------------------------------------------
-- Every authenticated user must have a profiles row, because the backend
-- resolves authorization from this table and fails closed when the row is
-- absent. Without this trigger a freshly signed-up user authenticates
-- successfully and is then refused by every endpoint.
--
-- ##########################################################################
-- # THE ROLE IS A HARD-CODED LITERAL. IT IS NEVER READ FROM USER INPUT.    #
-- #                                                                        #
-- # raw_user_meta_data is whatever the client sent to the signup call, and #
-- # the user can rewrite it at any time via auth.updateUser(). Sourcing    #
-- # the role from it — even "just as a default" — would let anyone         #
-- # self-provision as ADMIN during signup. Promotion is an ADMIN action    #
-- # performed against profiles, guarded by RLS.                            #
-- ##########################################################################
--
-- full_name IS taken from metadata: it is a display string, carries no
-- privilege, and is trimmed and length-capped below. Anything that grants
-- authority must not follow the same path.
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    NEW.id,
    NULLIF(LEFT(TRIM(COALESCE(NEW.raw_user_meta_data ->> 'full_name', '')), 200), ''),
    'VIEWER'   -- literal, never NEW.raw_user_meta_data ->> 'role'
  )
  ON CONFLICT (id) DO NOTHING;   -- idempotent; never overwrites an existing role

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();


-- ----------------------------------------------------------------------------
-- 5. PROJECTS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.projects (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_name            TEXT NOT NULL,
  project_code            TEXT UNIQUE NOT NULL,
  state                   TEXT NOT NULL,
  district                TEXT NOT NULL,
  sector                  TEXT NOT NULL,
  implementing_agency     TEXT NOT NULL,
  planned_start_date      DATE,
  planned_completion_date DATE,
  actual_start_date       DATE,
  actual_completion_date  DATE,
  project_status          TEXT NOT NULL DEFAULT 'PLANNED'
                          CHECK (project_status IN
                            ('PLANNED', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED')),
  latitude                NUMERIC(9, 6) CHECK (latitude  BETWEEN -90  AND 90),
  longitude               NUMERIC(9, 6) CHECK (longitude BETWEEN -180 AND 180),
  created_by              UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT projects_planned_dates_ordered CHECK (
    planned_start_date IS NULL
    OR planned_completion_date IS NULL
    OR planned_completion_date >= planned_start_date
  ),
  CONSTRAINT projects_actual_dates_ordered CHECK (
    actual_start_date IS NULL
    OR actual_completion_date IS NULL
    OR actual_completion_date >= actual_start_date
  )
);

-- ----------------------------------------------------------------------------
-- 6. LAND ACQUISITION  (one row per project)
-- ----------------------------------------------------------------------------
-- Derived-field strategy — Option B (generated column).
--
-- land_acquisition_percentage is GENERATED ALWAYS ... STORED. PostgreSQL
-- computes it from land_acquired_ha / land_required_ha on every write, so a
-- client physically cannot supply or spoof the value: an INSERT or UPDATE that
-- targets the column is rejected by the server. This is strictly stronger than
-- computing it in the Node layer, because it also holds for direct SQL, admin
-- edits and future services.
--
-- Trade-off vs. the brief: a generated column cannot also declare
-- "NOT NULL DEFAULT 0". It is NOT NULL in effect (its inputs are NOT NULL and
-- the expression is total), and a DEFAULT would be meaningless because the
-- value is never client-supplied. See docs/DATABASE.md.
CREATE TABLE IF NOT EXISTS public.land_acquisition (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id                  UUID UNIQUE NOT NULL
                              REFERENCES public.projects(id) ON DELETE CASCADE,

  land_required_ha            NUMERIC(14, 4) NOT NULL CHECK (land_required_ha > 0),
  land_acquired_ha            NUMERIC(14, 4) NOT NULL DEFAULT 0
                              CHECK (land_acquired_ha >= 0),

  -- CASE guard is defensive only; land_required_ha > 0 is already enforced.
  land_acquisition_percentage NUMERIC(7, 4)
    GENERATED ALWAYS AS (
      CASE WHEN land_required_ha > 0
           THEN ROUND((land_acquired_ha / land_required_ha) * 100, 4)
           ELSE 0
      END
    ) STORED,

  land_parcels_total          INTEGER CHECK (land_parcels_total    >= 0),
  land_parcels_acquired       INTEGER CHECK (land_parcels_acquired >= 0),
  affected_landowners         INTEGER CHECK (affected_landowners   >= 0),
  affected_families           INTEGER CHECK (affected_families     >= 0),

  possession_obtained         BOOLEAN NOT NULL DEFAULT FALSE,
  notification_date           DATE,
  award_date                  DATE,
  possession_date             DATE,

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT land_acquired_not_over_required
    CHECK (land_acquired_ha <= land_required_ha),

  -- Only enforced when both parcel counts are present.
  CONSTRAINT land_parcels_acquired_not_over_total CHECK (
    land_parcels_total IS NULL
    OR land_parcels_acquired IS NULL
    OR land_parcels_acquired <= land_parcels_total
  ),

  -- Statutory sequence: notification -> award -> possession.
  CONSTRAINT land_award_after_notification CHECK (
    notification_date IS NULL OR award_date IS NULL OR award_date >= notification_date
  ),
  CONSTRAINT land_possession_after_award CHECK (
    award_date IS NULL OR possession_date IS NULL OR possession_date >= award_date
  )
);


-- ----------------------------------------------------------------------------
-- 7. COMPENSATION  (one row per project)
-- ----------------------------------------------------------------------------
-- Money precision: NUMERIC(18, 2) — exact decimal, never floating point.
-- Amounts are stored in Indian Rupees to two decimal places (paise).
-- NUMERIC(18,2) holds up to 9,999,999,999,999,999.99 (~1.0e16), comfortably
-- above any single project's compensation outlay. Percentages use
-- NUMERIC(7,4). Both derived columns are GENERATED ... STORED for the same
-- anti-spoofing reason as land_acquisition_percentage.
CREATE TABLE IF NOT EXISTS public.compensation (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id                      UUID UNIQUE NOT NULL
                                  REFERENCES public.projects(id) ON DELETE CASCADE,

  total_compensation_required     NUMERIC(18, 2) NOT NULL DEFAULT 0
                                  CHECK (total_compensation_required >= 0),
  total_compensation_paid         NUMERIC(18, 2) NOT NULL DEFAULT 0
                                  CHECK (total_compensation_paid >= 0),

  compensation_pending            NUMERIC(18, 2)
    GENERATED ALWAYS AS (total_compensation_required - total_compensation_paid) STORED,

  -- Guard against division by zero: required may legitimately be 0.
  compensation_pending_percentage NUMERIC(7, 4)
    GENERATED ALWAYS AS (
      CASE WHEN total_compensation_required > 0
           THEN ROUND(((total_compensation_required - total_compensation_paid)
                       / total_compensation_required) * 100, 4)
           ELSE 0
      END
    ) STORED,

  payment_status                  TEXT NOT NULL DEFAULT 'NOT_STARTED'
                                  CHECK (payment_status IN
                                    ('NOT_STARTED', 'IN_PROGRESS', 'PARTIAL', 'COMPLETED', 'DISPUTED')),

  last_updated                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT compensation_paid_not_over_required
    CHECK (total_compensation_paid <= total_compensation_required)
);


-- ----------------------------------------------------------------------------
-- 8. LEGAL ISSUES  (many per project)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.legal_issues (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,

  issue_type     TEXT NOT NULL CHECK (issue_type IN
                   ('LITIGATION', 'LAND_DISPUTE', 'TITLE_DISPUTE',
                    'LAND_RECORD_ISSUE', 'COMPENSATION_DISPUTE')),
  court_case     BOOLEAN NOT NULL DEFAULT FALSE,
  case_reference TEXT,
  status         TEXT NOT NULL DEFAULT 'OPEN'
                 CHECK (status IN ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED')),
  severity       TEXT NOT NULL
                 CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  description    TEXT,
  reported_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  resolved_date  DATE,

  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT legal_resolved_after_reported CHECK (
    resolved_date IS NULL OR resolved_date >= reported_date
  ),
  -- A case reference only makes sense for an actual court case.
  CONSTRAINT legal_case_reference_requires_court_case CHECK (
    case_reference IS NULL OR court_case = TRUE
  )
);


-- ----------------------------------------------------------------------------
-- 9. RISK FACTORS  (many per project)
-- ----------------------------------------------------------------------------
-- factor_type is a FK to the reference table so new factor types are an INSERT,
-- not a schema migration.
CREATE TABLE IF NOT EXISTS public.risk_factors (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,

  factor_type   TEXT NOT NULL REFERENCES public.risk_factor_types(code),
  factor_name   TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'OPEN'
                CHECK (status IN ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED')),
  severity      TEXT NOT NULL
                CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  description   TEXT,
  reported_date DATE NOT NULL DEFAULT CURRENT_DATE,
  resolved_date DATE,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT risk_resolved_after_reported CHECK (
    resolved_date IS NULL OR resolved_date >= reported_date
  )
);

-- ----------------------------------------------------------------------------
-- 10. PROJECT FEATURE SNAPSHOTS
-- ----------------------------------------------------------------------------
-- The immutable ML input record.
--
-- A project mutates continuously. A prediction made today must remain
-- explainable next year, which is impossible if it points at live project rows
-- that have since changed. Every prediction therefore references a snapshot:
-- a frozen copy of exactly the feature values fed to the model.
--
-- ##########################################################################
-- # DATA LEAKAGE BOUNDARY — READ BEFORE ADDING ANY COLUMN                  #
-- #                                                                        #
-- # This table may contain ONLY information observable at snapshot_date.   #
-- #                                                                        #
-- # NEVER add: delay_days_target, delay_months_target, actual delay,       #
-- # actual completion date, realised cost overrun, or any other outcome    #
-- # known only after the fact. Such a column would leak the target into    #
-- # training, producing a model with excellent offline metrics and no      #
-- # real predictive power.                                                 #
-- #                                                                        #
-- # Ground truth lives in actual_outcomes (section 14), deliberately in a  #
-- # separate table, joined only at training time.                          #
-- ##########################################################################
--
-- Snapshots are append-only by policy: no UPDATE policy is granted to any
-- role in section 8, and the table has no updated_at column, because a
-- mutable snapshot would defeat its entire purpose.
CREATE TABLE IF NOT EXISTS public.project_feature_snapshots (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id                      UUID NOT NULL
                                  REFERENCES public.projects(id) ON DELETE CASCADE,
  snapshot_date                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Land features (copied from land_acquisition at snapshot time)
  land_required_ha                NUMERIC(14, 4),
  land_acquired_ha                NUMERIC(14, 4),
  acquisition_percentage          NUMERIC(7, 4),

  -- Compensation features
  compensation_pending            NUMERIC(18, 2),
  compensation_pending_percentage NUMERIC(7, 4),

  -- Scale of social impact
  affected_landowners             INTEGER CHECK (affected_landowners >= 0),
  affected_families               INTEGER CHECK (affected_families   >= 0),

  -- Legal features
  court_cases_count               INTEGER NOT NULL DEFAULT 0 CHECK (court_cases_count >= 0),
  litigation_flag                 BOOLEAN NOT NULL DEFAULT FALSE,
  land_dispute_flag               BOOLEAN NOT NULL DEFAULT FALSE,
  title_issue_flag                BOOLEAN NOT NULL DEFAULT FALSE,
  land_record_issue_flag          BOOLEAN NOT NULL DEFAULT FALSE,

  -- Risk-factor features
  r_and_r_required                BOOLEAN NOT NULL DEFAULT FALSE,
  r_and_r_pending                 BOOLEAN NOT NULL DEFAULT FALSE,
  row_issue                       BOOLEAN NOT NULL DEFAULT FALSE,
  encroachment                    BOOLEAN NOT NULL DEFAULT FALSE,
  forest_clearance_pending        BOOLEAN NOT NULL DEFAULT FALSE,
  possession_pending              BOOLEAN NOT NULL DEFAULT FALSE,
  administrative_delay            BOOLEAN NOT NULL DEFAULT FALSE,

  -- Elapsed-time features. These measure delay ALREADY OBSERVED as of
  -- snapshot_date (e.g. days notification -> award). They are inputs, not the
  -- prediction target, and must never be computed against a future date.
  notification_delay_days         NUMERIC(10, 2) CHECK (notification_delay_days >= 0),
  award_delay_days                NUMERIC(10, 2) CHECK (award_delay_days       >= 0),

  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT snapshot_acquired_not_over_required CHECK (
    land_required_ha IS NULL
    OR land_acquired_ha IS NULL
    OR land_acquired_ha <= land_required_ha
  ),
  -- Pending R&R implies R&R was required in the first place.
  CONSTRAINT snapshot_rr_pending_requires_rr CHECK (
    r_and_r_pending = FALSE OR r_and_r_required = TRUE
  ),
  -- Any litigation implies at least one recorded court case, and vice versa.
  CONSTRAINT snapshot_litigation_matches_case_count CHECK (
    (litigation_flag = TRUE AND court_cases_count > 0)
    OR (litigation_flag = FALSE AND court_cases_count = 0)
  )
);

-- Backs the composite foreign keys on predictions and actual_outcomes, which
-- make it structurally impossible to attach a snapshot to the wrong project.
CREATE UNIQUE INDEX IF NOT EXISTS project_feature_snapshots_id_project_key
  ON public.project_feature_snapshots (id, project_id);


-- ----------------------------------------------------------------------------
-- 11. MODEL VERSIONS
-- ----------------------------------------------------------------------------
-- Metrics are NULLable on purpose: a model row is registered when training
-- starts, and mae / rmse / r2_score stay NULL until a real evaluation run
-- fills them in. NULL means "not yet measured" — never substitute a guess.
CREATE TABLE IF NOT EXISTS public.model_versions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version       TEXT UNIQUE NOT NULL,
  algorithm     TEXT NOT NULL,
  training_date TIMESTAMPTZ,
  dataset_size  INTEGER CHECK (dataset_size >= 0),

  mae           NUMERIC(12, 4) CHECK (mae  >= 0),
  rmse          NUMERIC(12, 4) CHECK (rmse >= 0),
  r2_score      NUMERIC(8, 6)  CHECK (r2_score <= 1),  -- R² is unbounded below

  status        TEXT NOT NULL DEFAULT 'TRAINING'
                CHECK (status IN ('TRAINING', 'STAGING', 'ACTIVE', 'ARCHIVED', 'FAILED')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- At most one model may serve production traffic at a time.
CREATE UNIQUE INDEX IF NOT EXISTS model_versions_single_active
  ON public.model_versions ((status)) WHERE status = 'ACTIVE';


-- ----------------------------------------------------------------------------
-- 12. PREDICTIONS
-- ----------------------------------------------------------------------------
-- RESULT COLUMNS ARE NULLABLE BY DESIGN — see predictions_result_matches_status.
--
-- A prediction row records an *inference attempt*, and an attempt does not
-- always produce a result. If predicted_delay_days were NOT NULL, a failed
-- inference would have to store an invented number, and 0 is the worst
-- possible choice: it is a valid, plausible reading of "no delay expected".
-- A dashboard, an average, or a training query would silently absorb it as a
-- real forecast of zero days. Storing NULL makes the absence of a result
-- explicit and unaggregatable.
--
-- The same argument applies to risk_level: a failed inference has no risk
-- band, and writing 'LOW' would be the same fabrication in a different column.
--
-- The CHECK constraint below makes the two representable states exhaustive:
--   SUCCESS          -> predicted_delay_days AND risk_level are both PRESENT
--   PENDING / FAILED -> predicted_delay_days AND risk_level are both NULL
-- There is no way to record a successful prediction with no value, and no way
-- to record a failure carrying one.
CREATE TABLE IF NOT EXISTS public.predictions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id           UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  feature_snapshot_id  UUID NOT NULL
                       REFERENCES public.project_feature_snapshots(id) ON DELETE RESTRICT,
  model_version_id     UUID REFERENCES public.model_versions(id) ON DELETE SET NULL,

  -- NULL only when prediction_status is PENDING or FAILED.
  predicted_delay_days NUMERIC(10, 2) CHECK (predicted_delay_days >= 0),
  risk_level           TEXT
                       CHECK (risk_level IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  prediction_status    TEXT NOT NULL DEFAULT 'SUCCESS'
                       CHECK (prediction_status IN ('PENDING', 'SUCCESS', 'FAILED')),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Result presence must agree with the status of the inference attempt.
  -- Written as a CASE so every status is handled explicitly: adding a new
  -- status without deciding its result semantics fails loudly here.
  CONSTRAINT predictions_result_matches_status CHECK (
    CASE prediction_status
      WHEN 'SUCCESS' THEN predicted_delay_days IS NOT NULL AND risk_level IS NOT NULL
      WHEN 'FAILED'  THEN predicted_delay_days IS NULL     AND risk_level IS NULL
      WHEN 'PENDING' THEN predicted_delay_days IS NULL     AND risk_level IS NULL
    END
  ),

  -- The snapshot must belong to the same project as the prediction.
  -- Enforced structurally rather than by application discipline.
  CONSTRAINT predictions_snapshot_matches_project
    FOREIGN KEY (feature_snapshot_id, project_id)
    REFERENCES public.project_feature_snapshots (id, project_id)
    ON DELETE RESTRICT
);


-- ----------------------------------------------------------------------------
-- 13. PREDICTION EXPLANATIONS
-- ----------------------------------------------------------------------------
-- Per-feature attributions (e.g. SHAP values) for one prediction.
--
-- IMPORTANT: these are the model's contributions to ITS OWN output. They
-- describe how the model weighted each feature — they are NOT evidence of a
-- causal relationship in the real world, and must not be presented to
-- officials as proof that a factor caused a delay. See docs/DATABASE.md.
CREATE TABLE IF NOT EXISTS public.prediction_explanations (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prediction_id          UUID NOT NULL
                         REFERENCES public.predictions(id) ON DELETE CASCADE,

  feature_name           TEXT NOT NULL,
  feature_value          NUMERIC(18, 4),
  contribution_score     NUMERIC(12, 6) NOT NULL,   -- signed; may be negative
  contribution_direction TEXT NOT NULL
                         CHECK (contribution_direction IN
                           ('INCREASES_DELAY', 'DECREASES_DELAY', 'NEUTRAL')),
  rank                   INTEGER NOT NULL CHECK (rank > 0),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT prediction_explanations_unique_rank UNIQUE (prediction_id, rank),
  CONSTRAINT prediction_explanations_unique_feature UNIQUE (prediction_id, feature_name)
);


-- ----------------------------------------------------------------------------
-- 14. RECOMMENDATIONS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.recommendations (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prediction_id      UUID NOT NULL REFERENCES public.predictions(id) ON DELETE CASCADE,

  title              TEXT NOT NULL,
  description        TEXT NOT NULL,
  priority           TEXT NOT NULL
                     CHECK (priority IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
  recommended_action TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'OPEN'
                     CHECK (status IN ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'DISMISSED')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at       TIMESTAMPTZ,

  -- A completion timestamp only makes sense for a closed recommendation.
  CONSTRAINT recommendations_completed_at_requires_terminal_status CHECK (
    completed_at IS NULL OR status IN ('COMPLETED', 'DISMISSED')
  )
);

-- ----------------------------------------------------------------------------
-- 15. ACTUAL OUTCOMES  (ground truth / training labels)
-- ----------------------------------------------------------------------------
-- Observed reality, recorded after the fact. This is the ML target.
--
-- It is a separate table from project_feature_snapshots by design. Keeping the
-- label physically apart from the features is the structural half of leakage
-- prevention: a training query has to perform an explicit, reviewable JOIN to
-- reach the target, so it cannot be pulled in by accident (e.g. SELECT *).
--
-- The composite FK ties an outcome to a snapshot of the SAME project, and the
-- trigger below enforces that the outcome was observed at or after the moment
-- the features were frozen.
CREATE TABLE IF NOT EXISTS public.actual_outcomes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  feature_snapshot_id UUID NOT NULL
                      REFERENCES public.project_feature_snapshots(id) ON DELETE RESTRICT,

  actual_delay_days   NUMERIC(10, 2) NOT NULL CHECK (actual_delay_days >= 0),
  outcome_date        DATE NOT NULL,
  verified_by         UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One ground-truth label per snapshot.
  CONSTRAINT actual_outcomes_one_per_snapshot UNIQUE (feature_snapshot_id),

  CONSTRAINT actual_outcomes_snapshot_matches_project
    FOREIGN KEY (feature_snapshot_id, project_id)
    REFERENCES public.project_feature_snapshots (id, project_id)
    ON DELETE RESTRICT
);

-- Temporal leakage guard: an outcome cannot predate the features it labels.
-- A CHECK constraint cannot express this because it spans two tables.
CREATE OR REPLACE FUNCTION public.enforce_outcome_after_snapshot()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_snapshot_date TIMESTAMPTZ;
BEGIN
  SELECT snapshot_date INTO v_snapshot_date
  FROM public.project_feature_snapshots
  WHERE id = NEW.feature_snapshot_id;

  IF v_snapshot_date IS NOT NULL AND NEW.outcome_date < v_snapshot_date::DATE THEN
    RAISE EXCEPTION
      'Data leakage: outcome_date % precedes snapshot_date % for snapshot %',
      NEW.outcome_date, v_snapshot_date::DATE, NEW.feature_snapshot_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_actual_outcomes_temporal_guard ON public.actual_outcomes;
CREATE TRIGGER trg_actual_outcomes_temporal_guard
  BEFORE INSERT OR UPDATE ON public.actual_outcomes
  FOR EACH ROW EXECUTE FUNCTION public.enforce_outcome_after_snapshot();


-- ----------------------------------------------------------------------------
-- 16. PROJECT ASSIGNMENTS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.project_assignments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES public.projects(id)  ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES public.profiles(id)  ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Prevents duplicate project-user assignments.
  CONSTRAINT project_assignments_unique UNIQUE (project_id, user_id)
);


-- ============================================================================
-- 17. INDEXES
-- ============================================================================
-- Only indexes that back an expected access path are created.
--
-- Deliberately NOT created (the column already has a unique index from its
-- PRIMARY KEY or UNIQUE constraint, so a second one would be dead weight on
-- every write):
--   land_acquisition(project_id)  -- UNIQUE
--   compensation(project_id)      -- UNIQUE
--   actual_outcomes(feature_snapshot_id) -- UNIQUE
--   project_assignments(project_id, user_id) -- UNIQUE (serves project_id too)

-- projects: dashboard filters
CREATE INDEX IF NOT EXISTS idx_projects_state      ON public.projects (state);
CREATE INDEX IF NOT EXISTS idx_projects_district   ON public.projects (district);
CREATE INDEX IF NOT EXISTS idx_projects_sector     ON public.projects (sector);
CREATE INDEX IF NOT EXISTS idx_projects_status     ON public.projects (project_status);
CREATE INDEX IF NOT EXISTS idx_projects_created_by ON public.projects (created_by);

-- legal_issues / risk_factors: per-project drill-down and triage lists
CREATE INDEX IF NOT EXISTS idx_legal_issues_project  ON public.legal_issues (project_id);
CREATE INDEX IF NOT EXISTS idx_legal_issues_status   ON public.legal_issues (status);
CREATE INDEX IF NOT EXISTS idx_legal_issues_severity ON public.legal_issues (severity);

CREATE INDEX IF NOT EXISTS idx_risk_factors_project  ON public.risk_factors (project_id);
CREATE INDEX IF NOT EXISTS idx_risk_factors_status   ON public.risk_factors (status);
CREATE INDEX IF NOT EXISTS idx_risk_factors_severity ON public.risk_factors (severity);

-- snapshots: "latest snapshot for this project" is the hot query, so the
-- composite ordered index serves it directly.
CREATE INDEX IF NOT EXISTS idx_snapshots_project_date
  ON public.project_feature_snapshots (project_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_snapshots_date
  ON public.project_feature_snapshots (snapshot_date DESC);

-- predictions: "latest prediction for this project" plus risk triage
CREATE INDEX IF NOT EXISTS idx_predictions_project_created
  ON public.predictions (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_predictions_created
  ON public.predictions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_predictions_risk_level
  ON public.predictions (risk_level);
CREATE INDEX IF NOT EXISTS idx_predictions_snapshot
  ON public.predictions (feature_snapshot_id);
CREATE INDEX IF NOT EXISTS idx_predictions_model_version
  ON public.predictions (model_version_id);

-- explanations: always fetched by prediction, ordered by rank
CREATE INDEX IF NOT EXISTS idx_explanations_prediction_rank
  ON public.prediction_explanations (prediction_id, rank);

-- recommendations: action queue
CREATE INDEX IF NOT EXISTS idx_recommendations_prediction ON public.recommendations (prediction_id);
CREATE INDEX IF NOT EXISTS idx_recommendations_status     ON public.recommendations (status);

-- outcomes and assignments
CREATE INDEX IF NOT EXISTS idx_actual_outcomes_project ON public.actual_outcomes (project_id);
CREATE INDEX IF NOT EXISTS idx_assignments_user        ON public.project_assignments (user_id);


-- ============================================================================
-- 18. updated_at AUTOMATION
-- ============================================================================
-- One function (section 2) attached to every table carrying updated_at, via a
-- loop rather than eight near-identical CREATE TRIGGER statements.
-- project_feature_snapshots is absent by design: snapshots are immutable.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'profiles',
    'projects',
    'land_acquisition',
    'compensation',
    'legal_issues',
    'risk_factors'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_set_updated_at ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_%I_set_updated_at
         BEFORE UPDATE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', t, t);
  END LOOP;
END $$;

-- compensation.last_updated tracks the same event as updated_at but is part of
-- the domain model (when the payment figures were last revised), so it is
-- maintained alongside it.
CREATE OR REPLACE FUNCTION public.set_compensation_last_updated()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.last_updated := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_compensation_last_updated ON public.compensation;
CREATE TRIGGER trg_compensation_last_updated
  BEFORE UPDATE ON public.compensation
  FOR EACH ROW EXECUTE FUNCTION public.set_compensation_last_updated();


-- ============================================================================
-- 19. ROW LEVEL SECURITY
-- ============================================================================
-- These are BASELINE policies covering the roles in the brief. They are
-- deliberately conservative: default-deny, with read access widened per role
-- and write access confined to ADMIN and assigned OFFICERs.
--
-- ---------------------------------------------------------------------------
-- ROLE VISIBILITY POLICY (SIH PROTOTYPE)
-- ---------------------------------------------------------------------------
-- The access model implemented below, stated in full:
--
--   ADMIN    Full access to all projects and to system management
--            (profiles, role assignment, model registry, reference data).
--
--   ANALYST  Read access to all projects, plus analytics: predictions,
--            explanations, recommendations, snapshots and outcomes.
--            No write access to operational records.
--
--   OFFICER  Access limited to ASSIGNED projects only (via
--            project_assignments, or having created the project). May modify
--            authorised project information on those projects — land,
--            compensation, legal issues, risk factors, and the status of
--            recommendations. May NOT create or delete projects, and may NOT
--            update snapshots, predictions or outcomes, which are the audit
--            trail of what the model saw and what actually happened.
--
--   VIEWER   Read-only. No write access to any table.
--
-- >> PROTOTYPE SCOPE DECISION — VIEWER/ANALYST READ NATIONALLY <<
--
-- For this prototype, VIEWER and ANALYST read access spans ALL projects
-- nationally. This is a deliberate, documented interim position, not an
-- oversight: the brief specifies "read-only access according to allowed
-- project visibility" without defining what bounds that visibility, and the
-- state / department / project scoping rules have not been settled. Inventing
-- a boundary now would hard-code a guess into the security model.
--
-- This is the ONLY relaxation. It widens READ for two already read-only
-- roles. It does not touch write authorisation anywhere:
--   - VIEWER still has no write policy on any table.
--   - ANALYST still has no write policy on any table.
--   - OFFICER writes are still confined to assigned projects.
--   - Role self-promotion is still blocked (profiles policies below).
--   - Snapshots / predictions / outcomes are still update-proof.
--
-- REPLACING IT LATER is a scoped change with a known blast radius. Every
-- affected policy is a SELECT policy containing the literal
-- 'ANALYST', 'VIEWER' in its role list. profiles.state and profiles.department
-- already exist to carry the boundary. A future migration narrows those
-- clauses, e.g.:
--
--   public.current_app_role() IN ('ADMIN')
--   OR (public.current_app_role() IN ('ANALYST', 'VIEWER')
--       AND state = public.current_user_state())
--
-- No table, column or write policy has to change to make that switch.
-- See docs/DATABASE.md §9 "Role visibility policy" for the full rationale.
-- ---------------------------------------------------------------------------
--
-- CRITICAL — RLS IS NOT THE ONLY CONTROL.
-- The Node backend connects with the Supabase SERVICE ROLE key, which bypasses
-- RLS entirely. Every policy below is therefore invisible to backend queries.
-- RLS protects the direct-from-client path (anon key, PostgREST) and acts as a
-- second line of defence; the backend MUST enforce the same rules in its own
-- authorization layer. See docs/DATABASE.md, "RLS Strategy".
--
-- Read the "Before production" checklist in docs/DATABASE.md before relying on
-- these policies for real data.

-- --- authorization helper functions ---------------------------------------
-- Defined here, after the tables they read: a SQL-language function body is
-- parsed and validated at CREATE time, so public.profiles must already exist.
-- Resolves the caller's application role from their profile.
--
-- SECURITY DEFINER is essential: RLS policies on other tables call this, and
-- it reads public.profiles, which is itself under RLS. Without DEFINER the
-- policy on profiles would re-enter itself and recurse infinitely.
-- search_path is pinned so the function cannot be hijacked by a caller-set
-- search_path.
CREATE OR REPLACE FUNCTION public.current_app_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(public.current_app_role() = 'ADMIN', FALSE);
$$;

-- TRUE when the caller is explicitly assigned to the project, or created it.
CREATE OR REPLACE FUNCTION public.is_assigned_to_project(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_assignments pa
    WHERE pa.project_id = p_project_id
      AND pa.user_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = p_project_id
      AND p.created_by = auth.uid()
  );
$$;

ALTER TABLE public.profiles                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.land_acquisition          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compensation              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_issues              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_factors              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_feature_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.model_versions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.predictions               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prediction_explanations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recommendations           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.actual_outcomes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_assignments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_factor_types         ENABLE ROW LEVEL SECURITY;

-- --- profiles ---------------------------------------------------------------
-- A user may read and edit their own profile but NOT change their own role;
-- role changes are an ADMIN action. The WITH CHECK clause compares the new row
-- against the caller's current stored role to block self-promotion.
DROP POLICY IF EXISTS profiles_select_own_or_privileged ON public.profiles;
CREATE POLICY profiles_select_own_or_privileged ON public.profiles
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR public.current_app_role() IN ('ADMIN', 'ANALYST', 'OFFICER')
  );

DROP POLICY IF EXISTS profiles_update_own_no_role_change ON public.profiles;
CREATE POLICY profiles_update_own_no_role_change ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid() AND role = public.current_app_role());

DROP POLICY IF EXISTS profiles_admin_all ON public.profiles;
CREATE POLICY profiles_admin_all ON public.profiles
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- --- reference data ---------------------------------------------------------
-- Readable by every authenticated user; only ADMIN may extend the vocabulary.
DROP POLICY IF EXISTS risk_factor_types_read ON public.risk_factor_types;
CREATE POLICY risk_factor_types_read ON public.risk_factor_types
  FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS risk_factor_types_admin_write ON public.risk_factor_types;
CREATE POLICY risk_factor_types_admin_write ON public.risk_factor_types
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- --- projects ---------------------------------------------------------------
-- ADMIN / ANALYST / VIEWER read all projects (oversight roles).
-- OFFICER reads only projects assigned to them, per the brief.
DROP POLICY IF EXISTS projects_select ON public.projects;
CREATE POLICY projects_select ON public.projects
  FOR SELECT TO authenticated
  USING (
    public.current_app_role() IN ('ADMIN', 'ANALYST', 'VIEWER')
    OR (public.current_app_role() = 'OFFICER' AND public.is_assigned_to_project(id))
  );

DROP POLICY IF EXISTS projects_admin_write ON public.projects;
CREATE POLICY projects_admin_write ON public.projects
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- An OFFICER may update projects they are assigned to, but not create or
-- delete them (no INSERT/DELETE policy is granted to OFFICER).
DROP POLICY IF EXISTS projects_officer_update_assigned ON public.projects;
CREATE POLICY projects_officer_update_assigned ON public.projects
  FOR UPDATE TO authenticated
  USING (public.current_app_role() = 'OFFICER' AND public.is_assigned_to_project(id))
  WITH CHECK (public.current_app_role() = 'OFFICER' AND public.is_assigned_to_project(id));

-- --- project-owned child tables --------------------------------------------
-- Identical shape for every table hanging off projects: read follows project
-- visibility, write is ADMIN or assigned OFFICER. Generated in a loop so the
-- rule is stated once and cannot drift between tables.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'land_acquisition',
    'compensation',
    'legal_issues',
    'risk_factors',
    'project_feature_snapshots',
    'predictions',
    'actual_outcomes'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON public.%I', t, t);
    EXECUTE format($f$
      CREATE POLICY %I_select ON public.%I
        FOR SELECT TO authenticated
        USING (
          public.current_app_role() IN ('ADMIN', 'ANALYST', 'VIEWER')
          OR (public.current_app_role() = 'OFFICER'
              AND public.is_assigned_to_project(project_id))
        )$f$, t, t);

    EXECUTE format('DROP POLICY IF EXISTS %I_admin_write ON public.%I', t, t);
    EXECUTE format($f$
      CREATE POLICY %I_admin_write ON public.%I
        FOR ALL TO authenticated
        USING (public.is_admin()) WITH CHECK (public.is_admin())$f$, t, t);

    EXECUTE format('DROP POLICY IF EXISTS %I_officer_insert ON public.%I', t, t);
    EXECUTE format($f$
      CREATE POLICY %I_officer_insert ON public.%I
        FOR INSERT TO authenticated
        WITH CHECK (public.current_app_role() = 'OFFICER'
                    AND public.is_assigned_to_project(project_id))$f$, t, t);
  END LOOP;
END $$;

-- OFFICERs may revise mutable project data on their assigned projects.
-- project_feature_snapshots, predictions and actual_outcomes are excluded:
-- they are the immutable audit trail of what the model saw and what happened.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'land_acquisition',
    'compensation',
    'legal_issues',
    'risk_factors'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_officer_update ON public.%I', t, t);
    EXECUTE format($f$
      CREATE POLICY %I_officer_update ON public.%I
        FOR UPDATE TO authenticated
        USING (public.current_app_role() = 'OFFICER'
               AND public.is_assigned_to_project(project_id))
        WITH CHECK (public.current_app_role() = 'OFFICER'
                    AND public.is_assigned_to_project(project_id))$f$, t, t);
  END LOOP;
END $$;

-- --- prediction-owned tables ------------------------------------------------
-- Visibility is inherited from the parent prediction's project.
DROP POLICY IF EXISTS prediction_explanations_select ON public.prediction_explanations;
CREATE POLICY prediction_explanations_select ON public.prediction_explanations
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.predictions p
      WHERE p.id = prediction_id
        AND (
          public.current_app_role() IN ('ADMIN', 'ANALYST', 'VIEWER')
          OR (public.current_app_role() = 'OFFICER'
              AND public.is_assigned_to_project(p.project_id))
        )
    )
  );

DROP POLICY IF EXISTS prediction_explanations_admin_write ON public.prediction_explanations;
CREATE POLICY prediction_explanations_admin_write ON public.prediction_explanations
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS recommendations_select ON public.recommendations;
CREATE POLICY recommendations_select ON public.recommendations
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.predictions p
      WHERE p.id = prediction_id
        AND (
          public.current_app_role() IN ('ADMIN', 'ANALYST', 'VIEWER')
          OR (public.current_app_role() = 'OFFICER'
              AND public.is_assigned_to_project(p.project_id))
        )
    )
  );

DROP POLICY IF EXISTS recommendations_admin_write ON public.recommendations;
CREATE POLICY recommendations_admin_write ON public.recommendations
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- An OFFICER acts on recommendations for their own projects: they may move a
-- recommendation through its lifecycle (ACT stage of the product flow).
DROP POLICY IF EXISTS recommendations_officer_update ON public.recommendations;
CREATE POLICY recommendations_officer_update ON public.recommendations
  FOR UPDATE TO authenticated
  USING (
    public.current_app_role() = 'OFFICER'
    AND EXISTS (
      SELECT 1 FROM public.predictions p
      WHERE p.id = prediction_id AND public.is_assigned_to_project(p.project_id)
    )
  )
  WITH CHECK (
    public.current_app_role() = 'OFFICER'
    AND EXISTS (
      SELECT 1 FROM public.predictions p
      WHERE p.id = prediction_id AND public.is_assigned_to_project(p.project_id)
    )
  );

-- --- model_versions ---------------------------------------------------------
-- Readable by all authenticated users (model provenance is not sensitive);
-- writable only by ADMIN, since the registry drives which model serves traffic.
DROP POLICY IF EXISTS model_versions_read ON public.model_versions;
CREATE POLICY model_versions_read ON public.model_versions
  FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS model_versions_admin_write ON public.model_versions;
CREATE POLICY model_versions_admin_write ON public.model_versions
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- --- project_assignments ----------------------------------------------------
-- A user sees their own assignments; ADMIN manages all of them.
DROP POLICY IF EXISTS project_assignments_select ON public.project_assignments;
CREATE POLICY project_assignments_select ON public.project_assignments
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.current_app_role() IN ('ADMIN', 'ANALYST'));

DROP POLICY IF EXISTS project_assignments_admin_write ON public.project_assignments;
CREATE POLICY project_assignments_admin_write ON public.project_assignments
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());


-- ============================================================================
-- END OF SCHEMA
-- ============================================================================
