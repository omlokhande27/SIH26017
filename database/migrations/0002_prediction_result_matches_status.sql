-- ============================================================================
-- 0002 — predictions: result columns must agree with prediction_status
-- ============================================================================
--
-- Baseline 0001 declared predictions.predicted_delay_days and
-- predictions.risk_level as NOT NULL while prediction_status allowed 'FAILED'.
-- Those two rules contradict each other: a failed ML inference produces no
-- delay estimate and no risk band, so the NOT NULL forced callers to invent
-- one. The obvious placeholder, 0, is the most damaging possible choice —
-- it is indistinguishable from a genuine "no delay expected" forecast and
-- would be absorbed silently by dashboards, averages and training queries.
--
-- This migration makes both result columns nullable and replaces the implicit
-- rule with an explicit CHECK:
--
--   SUCCESS          -> predicted_delay_days AND risk_level are both PRESENT
--   PENDING / FAILED -> predicted_delay_days AND risk_level are both NULL
--
-- PENDING is grouped with FAILED because an inference that has not finished
-- has no result either, for exactly the same reason.
--
-- ---------------------------------------------------------------------------
-- BEFORE APPLYING TO A DATABASE THAT ALREADY HOLDS PREDICTIONS
-- ---------------------------------------------------------------------------
-- Any pre-existing FAILED or PENDING row carrying a placeholder value will
-- violate the new constraint and abort this migration. That is deliberate: the
-- rows must be inspected, not silently rewritten, because this migration
-- cannot tell a fabricated 0 from a genuine 0-day forecast that was mislabelled.
--
-- Find them first:
--
--   SELECT id, prediction_status, predicted_delay_days, risk_level
--   FROM public.predictions
--   WHERE prediction_status IN ('FAILED', 'PENDING')
--     AND (predicted_delay_days IS NOT NULL OR risk_level IS NOT NULL);
--
-- Once you have confirmed those rows are placeholders rather than results
-- filed under the wrong status, clear them explicitly:
--
--   UPDATE public.predictions
--   SET predicted_delay_days = NULL, risk_level = NULL
--   WHERE prediction_status IN ('FAILED', 'PENDING');
--
-- No such UPDATE runs automatically below.
-- ---------------------------------------------------------------------------

BEGIN;

ALTER TABLE public.predictions ALTER COLUMN predicted_delay_days DROP NOT NULL;
ALTER TABLE public.predictions ALTER COLUMN risk_level           DROP NOT NULL;

ALTER TABLE public.predictions
  DROP CONSTRAINT IF EXISTS predictions_result_matches_status;

ALTER TABLE public.predictions
  ADD CONSTRAINT predictions_result_matches_status CHECK (
    CASE prediction_status
      WHEN 'SUCCESS' THEN predicted_delay_days IS NOT NULL AND risk_level IS NOT NULL
      WHEN 'FAILED'  THEN predicted_delay_days IS NULL     AND risk_level IS NULL
      WHEN 'PENDING' THEN predicted_delay_days IS NULL     AND risk_level IS NULL
    END
  );

COMMIT;
