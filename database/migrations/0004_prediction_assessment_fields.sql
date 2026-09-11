-- ============================================================================
-- 0004 — carry the rule-engine assessment alongside the ML estimate
-- ============================================================================
--
-- Phase 5 persists a COMBINED assessment: a rule-based risk evaluation (the
-- primary decision-support signal) and a delay figure from the ML service
-- (currently a historical median, explicitly low-confidence).
--
-- The baseline schema was designed when the ML model was expected to be the
-- product, so it has nowhere to record the rule engine's output, how much of
-- the rule set could be evaluated, or how much confidence the delay figure
-- carries. Without those columns the API would have to either drop that
-- information on write or re-derive it on read — and re-deriving it later
-- against project data that has since changed would silently produce a
-- different assessment from the one that was actually returned.
--
-- Purely additive. Every column is nullable, no existing constraint changes,
-- and rows written before this migration remain valid.
--
-- ---------------------------------------------------------------------------
-- WHY prediction_explanations NEEDS A SOURCE COLUMN
-- ---------------------------------------------------------------------------
-- That table is documented as holding "the model's contributions to ITS OWN
-- output (e.g. SHAP values)". Phase 5 writes RULE-ENGINE findings into it:
-- same shape (named factor, signed contribution, direction, rank), completely
-- different provenance. A rule contribution is a deterministic, auditable
-- score from a stated threshold; a SHAP value is a model's self-attribution.
--
-- Storing both without distinguishing them would let a reader take a rule
-- finding for a model explanation, which is exactly the category-mixing this
-- project refuses elsewhere. `explanation_source` keeps them apart, and
-- defaults to MODEL_ATTRIBUTION so any pre-existing row keeps its original
-- meaning.
-- ---------------------------------------------------------------------------

BEGIN;

-- --- predictions ------------------------------------------------------------

ALTER TABLE public.predictions
  -- Which system produced predicted_delay_days. BASELINE_MEDIAN means the
  -- figure is the historical median, not a model output — the distinction the
  -- API surface depends on.
  ADD COLUMN IF NOT EXISTS prediction_type TEXT
    CHECK (prediction_type IN ('BASELINE_MEDIAN', 'EXPERIMENTAL_ML_ESTIMATE')),

  -- Never 'HIGH' on the current dataset. The column allows it so a genuinely
  -- predictive future model is not blocked by a schema change.
  ADD COLUMN IF NOT EXISTS confidence TEXT
    CHECK (confidence IN ('NONE', 'LOW', 'MEDIUM', 'HIGH')),

  -- The rule engine's 0-100 score. `risk_level` (already present) holds its
  -- band; this holds the number behind it.
  ADD COLUMN IF NOT EXISTS risk_score NUMERIC(5, 2)
    CHECK (risk_score >= 0 AND risk_score <= 100),

  -- How much of the rule set could actually be evaluated.
  ADD COLUMN IF NOT EXISTS rule_coverage_pct NUMERIC(5, 2)
    CHECK (rule_coverage_pct >= 0 AND rule_coverage_pct <= 100),

  -- FALSE when core inputs were missing. Without this a low risk_score on a
  -- project with no data recorded is indistinguishable from a genuinely
  -- low-risk project — the single most misleading thing this system could do.
  ADD COLUMN IF NOT EXISTS assessment_complete BOOLEAN,

  -- Rules that could not be evaluated, and the model limitations in force at
  -- the time. Stored as JSON because both are lists whose shape belongs to the
  -- ML service, and pinning them into columns would couple the schema to it.
  ADD COLUMN IF NOT EXISTS missing_core_inputs JSONB,
  ADD COLUMN IF NOT EXISTS limitations JSONB;

COMMENT ON COLUMN public.predictions.risk_level IS
  'Risk band from the RULE ENGINE, which is the primary decision-support '
  'signal. It is not derived from predicted_delay_days.';

COMMENT ON COLUMN public.predictions.predicted_delay_days IS
  'Delay estimate from the ML service. While prediction_type is '
  'BASELINE_MEDIAN this is the historical median, carries no project-specific '
  'signal, and must not be presented as a forecast.';

-- --- prediction_explanations ------------------------------------------------

ALTER TABLE public.prediction_explanations
  ADD COLUMN IF NOT EXISTS explanation_source TEXT NOT NULL
    DEFAULT 'MODEL_ATTRIBUTION'
    CHECK (explanation_source IN ('RULE_ENGINE', 'MODEL_ATTRIBUTION'));

COMMENT ON COLUMN public.prediction_explanations.explanation_source IS
  'RULE_ENGINE: a deterministic rule contribution, auditable against a stated '
  'threshold. MODEL_ATTRIBUTION: a model explaining its own output (e.g. SHAP). '
  'These must never be conflated when presented to officials.';

-- --- recommendations --------------------------------------------------------

ALTER TABLE public.recommendations
  -- The rule that produced this recommendation. Makes the chain
  -- evidence -> finding -> action auditable end to end, and lets a reviewer
  -- confirm no recommendation was generated without a triggering condition.
  ADD COLUMN IF NOT EXISTS source_rule_id TEXT;

COMMENT ON COLUMN public.recommendations.source_rule_id IS
  'Rule id that triggered this recommendation. NULL only for rows created '
  'before Phase 5.';

-- --- index for "latest prediction for a project" ----------------------------
-- The assessment endpoint reads the most recent prediction per project on
-- every call; without this it is a sort over the whole table.
CREATE INDEX IF NOT EXISTS idx_predictions_project_latest
  ON public.predictions (project_id, created_at DESC);

COMMIT;
