-- ============================================================================
-- LandGuard AI — DEMO / DEVELOPMENT SEED DATA
-- ============================================================================
--
--  ####################################################################
--  #                                                                  #
--  #   ALL DATA IN THIS FILE IS FICTIONAL AND FOR DEVELOPMENT ONLY.   #
--  #                                                                  #
--  #   These are INVENTED projects with INVENTED figures. They are    #
--  #   NOT government data, NOT official statistics, and NOT drawn    #
--  #   from any real infrastructure project, agency or land record.   #
--  #   Every project name is prefixed "[DEMO]" and every code with    #
--  #   "DEMO-" so seeded rows can never be mistaken for real records. #
--  #                                                                  #
--  #   DO NOT RUN THIS AGAINST A PRODUCTION DATABASE.                 #
--  #                                                                  #
--  ####################################################################
--
-- Purpose: populate enough related rows to exercise every relationship in the
-- schema — project -> land/compensation/legal/risk -> snapshot -> prediction
-- -> explanation/recommendation, plus one closed feedback loop with a
-- recorded actual outcome.
--
-- Prerequisite: run database/schema.sql first.
-- Idempotent: fixed UUIDs + ON CONFLICT DO NOTHING, so re-running is safe.
--
-- NOTE ON PROFILES: public.profiles references auth.users, which is managed by
-- Supabase Auth. Rows cannot be invented here. Create demo users first
-- (Dashboard > Authentication > Add user), then run PART B at the bottom.
-- PART A below needs no users and runs standalone.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- PART A — project data (no authenticated users required)
-- ----------------------------------------------------------------------------

-- --- Model registry ---------------------------------------------------------
-- Evaluation metrics are intentionally left NULL. No model has been trained or
-- evaluated yet, and inventing an MAE/RMSE/R² would be fabricating results.
-- The ML service fills these in after a real evaluation run.
INSERT INTO public.model_versions (id, version, algorithm, training_date, dataset_size, status)
VALUES
  ('a0000000-0000-4000-8000-000000000001', 'demo-0.1.0-untrained',
   'PLACEHOLDER — no model trained yet', NULL, NULL, 'TRAINING')
ON CONFLICT (id) DO NOTHING;


-- --- Projects ---------------------------------------------------------------
-- Six fictional projects spanning a range of acquisition maturity, so the
-- dashboard has low-, medium- and high-risk cases to render.
INSERT INTO public.projects
  (id, project_name, project_code, state, district, sector, implementing_agency,
   planned_start_date, planned_completion_date, actual_start_date, project_status,
   latitude, longitude)
VALUES
  ('b0000000-0000-4000-8000-000000000001',
   '[DEMO] Northern Bypass Corridor — Package A', 'DEMO-RD-001',
   'Maharashtra', 'Demo District North', 'ROAD', '[DEMO] State Highways Agency',
   '2024-01-15', '2026-06-30', '2024-02-01', 'ACTIVE', 19.075000, 72.877600),

  ('b0000000-0000-4000-8000-000000000002',
   '[DEMO] Riverside Irrigation Canal Phase II', 'DEMO-IR-002',
   'Rajasthan', 'Demo District West', 'IRRIGATION', '[DEMO] Water Resources Board',
   '2023-07-01', '2026-12-31', '2023-09-10', 'ACTIVE', 26.912400, 75.787300),

  ('b0000000-0000-4000-8000-000000000003',
   '[DEMO] Eastern Freight Rail Link', 'DEMO-RL-003',
   'Odisha', 'Demo District East', 'RAILWAY', '[DEMO] Rail Infrastructure Corp',
   '2024-04-01', '2027-03-31', NULL, 'PLANNED', 20.296100, 85.824500),

  ('b0000000-0000-4000-8000-000000000004',
   '[DEMO] Solar Park Transmission Line', 'DEMO-PW-004',
   'Gujarat', 'Demo District Central', 'POWER', '[DEMO] Power Transmission Utility',
   '2023-02-01', '2025-08-31', '2023-03-15', 'ACTIVE', 23.022500, 72.571400),

  ('b0000000-0000-4000-8000-000000000005',
   '[DEMO] Hill Region Tunnel Approach Road', 'DEMO-RD-005',
   'Himachal Pradesh', 'Demo District Hills', 'ROAD', '[DEMO] Border Roads Agency',
   '2022-10-01', '2025-12-31', '2022-11-20', 'ON_HOLD', 31.104800, 77.173400),

  ('b0000000-0000-4000-8000-000000000006',
   '[DEMO] Coastal Water Supply Pipeline', 'DEMO-WS-006',
   'Tamil Nadu', 'Demo District Coast', 'WATER_SUPPLY', '[DEMO] Municipal Water Board',
   '2022-06-01', '2024-09-30', '2022-07-01', 'COMPLETED', 13.082700, 80.270700)
ON CONFLICT (id) DO NOTHING;


-- --- Land acquisition -------------------------------------------------------
-- land_acquisition_percentage is a GENERATED column and is deliberately absent
-- from this INSERT: PostgreSQL derives it. Supplying it would raise an error.
INSERT INTO public.land_acquisition
  (project_id, land_required_ha, land_acquired_ha, land_parcels_total, land_parcels_acquired,
   affected_landowners, affected_families, possession_obtained,
   notification_date, award_date, possession_date)
VALUES
  ('b0000000-0000-4000-8000-000000000001', 145.5000, 132.4000, 620, 561, 540, 480, FALSE,
   '2023-08-10', '2024-01-05', NULL),
  ('b0000000-0000-4000-8000-000000000002', 890.2500, 356.1000, 2140, 861, 1980, 1750, FALSE,
   '2023-01-20', '2023-11-15', NULL),
  ('b0000000-0000-4000-8000-000000000003', 412.0000,  41.2000, 1150, 118, 1020,  940, FALSE,
   '2024-02-01', NULL, NULL),
  ('b0000000-0000-4000-8000-000000000004',  76.8000,  70.9000, 310, 288, 265, 240, FALSE,
   '2022-11-05', '2023-04-18', NULL),
  ('b0000000-0000-4000-8000-000000000005', 233.4000,  98.6000, 840, 355, 790, 700, FALSE,
   '2022-05-12', '2023-02-28', NULL),
  ('b0000000-0000-4000-8000-000000000006',  58.2000,  58.2000, 190, 190, 175, 160, TRUE,
   '2021-09-01', '2022-01-15', '2022-04-20')
ON CONFLICT (project_id) DO NOTHING;


-- --- Compensation -----------------------------------------------------------
-- compensation_pending and compensation_pending_percentage are GENERATED and
-- likewise omitted. Amounts are fictional INR figures, NUMERIC(18,2).
INSERT INTO public.compensation
  (project_id, total_compensation_required, total_compensation_paid, payment_status)
VALUES
  ('b0000000-0000-4000-8000-000000000001', 412000000.00, 366000000.00, 'IN_PROGRESS'),
  ('b0000000-0000-4000-8000-000000000002', 1875000000.00, 640000000.00, 'PARTIAL'),
  ('b0000000-0000-4000-8000-000000000003', 980000000.00,  58000000.00, 'IN_PROGRESS'),
  ('b0000000-0000-4000-8000-000000000004', 224000000.00, 201000000.00, 'IN_PROGRESS'),
  ('b0000000-0000-4000-8000-000000000005', 610000000.00, 189000000.00, 'DISPUTED'),
  ('b0000000-0000-4000-8000-000000000006', 143000000.00, 143000000.00, 'COMPLETED')
ON CONFLICT (project_id) DO NOTHING;


-- --- Legal issues -----------------------------------------------------------
INSERT INTO public.legal_issues
  (id, project_id, issue_type, court_case, case_reference, status, severity, description, reported_date, resolved_date)
VALUES
  ('c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002',
   'LITIGATION', TRUE, '[DEMO] WP/0000/2024', 'IN_PROGRESS', 'CRITICAL',
   'Fictional writ petition filed by a group of landowners contesting the award.', '2024-03-12', NULL),
  ('c0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000002',
   'COMPENSATION_DISPUTE', FALSE, NULL, 'OPEN', 'HIGH',
   'Fictional dispute over the valuation basis used for irrigated plots.', '2024-05-02', NULL),
  ('c0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000005',
   'TITLE_DISPUTE', TRUE, '[DEMO] CS/0000/2023', 'IN_PROGRESS', 'CRITICAL',
   'Fictional title dispute between claimants over ancestral holdings.', '2023-06-18', NULL),
  ('c0000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000005',
   'LAND_RECORD_ISSUE', FALSE, NULL, 'OPEN', 'MEDIUM',
   'Fictional mismatch between survey records and field measurement.', '2023-08-04', NULL),
  ('c0000000-0000-4000-8000-000000000005', 'b0000000-0000-4000-8000-000000000003',
   'LAND_DISPUTE', FALSE, NULL, 'OPEN', 'HIGH',
   'Fictional boundary dispute affecting the alignment.', '2024-04-22', NULL),
  ('c0000000-0000-4000-8000-000000000006', 'b0000000-0000-4000-8000-000000000006',
   'COMPENSATION_DISPUTE', FALSE, NULL, 'RESOLVED', 'LOW',
   'Fictional dispute settled through negotiation.', '2022-02-10', '2022-05-30')
ON CONFLICT (id) DO NOTHING;


-- --- Risk factors -----------------------------------------------------------
INSERT INTO public.risk_factors
  (id, project_id, factor_type, factor_name, status, severity, description, reported_date, resolved_date)
VALUES
  ('d0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002',
   'R_AND_R_PENDING', 'Resettlement of displaced families pending', 'OPEN', 'CRITICAL',
   'Fictional: resettlement colony not yet ready.', '2024-01-08', NULL),
  ('d0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000002',
   'POSSESSION_PENDING', 'Possession not handed over after award', 'OPEN', 'HIGH',
   'Fictional: award passed but physical possession withheld.', '2024-02-19', NULL),
  ('d0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000003',
   'FOREST_CLEARANCE_PENDING', 'Stage-II forest clearance awaited', 'OPEN', 'CRITICAL',
   'Fictional: diversion proposal under review.', '2024-03-01', NULL),
  ('d0000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000003',
   'ADMINISTRATIVE_DELAY', 'Inter-departmental approval pending', 'IN_PROGRESS', 'MEDIUM',
   'Fictional: file pending with competent authority.', '2024-04-10', NULL),
  ('d0000000-0000-4000-8000-000000000005', 'b0000000-0000-4000-8000-000000000005',
   'ENCROACHMENT', 'Unauthorised structures on alignment', 'OPEN', 'HIGH',
   'Fictional: encroachments identified during joint survey.', '2023-03-25', NULL),
  ('d0000000-0000-4000-8000-000000000006', 'b0000000-0000-4000-8000-000000000005',
   'LANDOWNER_OBJECTION', 'Objections to the compensation rate', 'OPEN', 'HIGH',
   'Fictional: objections filed during the hearing.', '2023-05-14', NULL),
  ('d0000000-0000-4000-8000-000000000007', 'b0000000-0000-4000-8000-000000000001',
   'ROW_ISSUE', 'Right of way contested on a short stretch', 'IN_PROGRESS', 'MEDIUM',
   'Fictional: alternative alignment under study.', '2024-06-01', NULL),
  ('d0000000-0000-4000-8000-000000000008', 'b0000000-0000-4000-8000-000000000006',
   'POSSESSION_PENDING', 'Possession handed over', 'RESOLVED', 'LOW',
   'Fictional: closed after possession was taken.', '2022-01-20', '2022-04-20')
ON CONFLICT (id) DO NOTHING;


-- --- Feature snapshots ------------------------------------------------------
-- Frozen ML inputs. Each row records only what was observable at snapshot_date.
-- No target/outcome column exists here — that is the schema's leakage boundary.
INSERT INTO public.project_feature_snapshots
  (id, project_id, snapshot_date,
   land_required_ha, land_acquired_ha, acquisition_percentage,
   compensation_pending, compensation_pending_percentage,
   affected_landowners, affected_families,
   court_cases_count, litigation_flag, land_dispute_flag, title_issue_flag, land_record_issue_flag,
   r_and_r_required, r_and_r_pending, row_issue, encroachment,
   forest_clearance_pending, possession_pending, administrative_delay,
   notification_delay_days, award_delay_days)
VALUES
  -- Low risk: acquisition nearly complete, no litigation
  ('e0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', '2025-06-01 00:00:00+00',
   145.5000, 132.4000, 91.0000, 46000000.00, 11.1650, 540, 480,
   0, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, 42.00, 148.00),

  -- Critical risk: litigation + R&R + heavy pending compensation
  ('e0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000002', '2025-06-01 00:00:00+00',
   890.2500, 356.1000, 40.0000, 1235000000.00, 65.8667, 1980, 1750,
   1, TRUE, FALSE, FALSE, FALSE, TRUE, TRUE, FALSE, FALSE, FALSE, TRUE, FALSE, 96.00, 299.00),

  -- High risk: very early acquisition, forest clearance pending
  ('e0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000003', '2025-06-01 00:00:00+00',
   412.0000, 41.2000, 10.0000, 922000000.00, 94.0816, 1020, 940,
   0, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, TRUE, 120.00, NULL),

  -- Medium risk: mostly acquired, possession outstanding
  ('e0000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000004', '2025-06-01 00:00:00+00',
   76.8000, 70.9000, 92.3177, 23000000.00, 10.2679, 265, 240,
   0, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, 58.00, 164.00),

  -- Critical risk: title dispute, encroachment, project on hold
  ('e0000000-0000-4000-8000-000000000005', 'b0000000-0000-4000-8000-000000000005', '2025-06-01 00:00:00+00',
   233.4000, 98.6000, 42.2450, 421000000.00, 69.0164, 790, 700,
   1, TRUE, FALSE, TRUE, TRUE, TRUE, TRUE, FALSE, TRUE, FALSE, TRUE, TRUE, 134.00, 292.00),

  -- Historical snapshot on a now-completed project. Paired with an actual
  -- outcome below to demonstrate the training feedback loop.
  ('e0000000-0000-4000-8000-000000000006', 'b0000000-0000-4000-8000-000000000006', '2022-06-01 00:00:00+00',
   58.2000, 34.9000, 59.9656, 61000000.00, 42.6573, 175, 160,
   0, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, 45.00, 136.00)
ON CONFLICT (id) DO NOTHING;


-- --- Predictions ------------------------------------------------------------
-- DEMO values. These were NOT produced by a trained model — no model exists
-- yet. model_version_id points at the untrained placeholder registered above,
-- so these rows are traceable as non-model output rather than passed off as
-- genuine inference. The ML service replaces them in Phase 3+.
INSERT INTO public.predictions
  (id, project_id, feature_snapshot_id, model_version_id,
   predicted_delay_days, risk_level, prediction_status, created_at)
VALUES
  ('f0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
   'e0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
    34.00, 'LOW',      'SUCCESS', '2025-06-01 09:00:00+00'),
  ('f0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000002',
   'e0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001',
   287.00, 'CRITICAL', 'SUCCESS', '2025-06-01 09:00:00+00'),
  ('f0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000003',
   'e0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001',
   198.00, 'HIGH',     'SUCCESS', '2025-06-01 09:00:00+00'),
  ('f0000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000004',
   'e0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001',
    61.00, 'MEDIUM',   'SUCCESS', '2025-06-01 09:00:00+00'),
  ('f0000000-0000-4000-8000-000000000005', 'b0000000-0000-4000-8000-000000000005',
   'e0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000001',
   331.00, 'CRITICAL', 'SUCCESS', '2025-06-01 09:00:00+00')
ON CONFLICT (id) DO NOTHING;


-- --- Prediction explanations ------------------------------------------------
-- Illustrative attribution rows. These describe how a model weighted each
-- feature — they are NOT evidence that a factor caused a delay.
INSERT INTO public.prediction_explanations
  (prediction_id, feature_name, feature_value, contribution_score, contribution_direction, rank)
VALUES
  ('f0000000-0000-4000-8000-000000000002', 'compensation_pending_percentage', 65.8667,  74.500000, 'INCREASES_DELAY', 1),
  ('f0000000-0000-4000-8000-000000000002', 'litigation_flag',                  1.0000,  61.200000, 'INCREASES_DELAY', 2),
  ('f0000000-0000-4000-8000-000000000002', 'r_and_r_pending',                  1.0000,  48.900000, 'INCREASES_DELAY', 3),
  ('f0000000-0000-4000-8000-000000000002', 'acquisition_percentage',          40.0000,  39.400000, 'INCREASES_DELAY', 4),
  ('f0000000-0000-4000-8000-000000000002', 'affected_families',             1750.0000,  12.700000, 'INCREASES_DELAY', 5),

  ('f0000000-0000-4000-8000-000000000005', 'title_issue_flag',                 1.0000,  82.300000, 'INCREASES_DELAY', 1),
  ('f0000000-0000-4000-8000-000000000005', 'encroachment',                     1.0000,  57.100000, 'INCREASES_DELAY', 2),
  ('f0000000-0000-4000-8000-000000000005', 'acquisition_percentage',          42.2450,  44.600000, 'INCREASES_DELAY', 3),
  ('f0000000-0000-4000-8000-000000000005', 'award_delay_days',               292.0000,  31.800000, 'INCREASES_DELAY', 4),

  ('f0000000-0000-4000-8000-000000000001', 'acquisition_percentage',          91.0000, -28.400000, 'DECREASES_DELAY', 1),
  ('f0000000-0000-4000-8000-000000000001', 'litigation_flag',                  0.0000, -19.700000, 'DECREASES_DELAY', 2),
  ('f0000000-0000-4000-8000-000000000001', 'row_issue',                        1.0000,   9.300000, 'INCREASES_DELAY', 3),

  ('f0000000-0000-4000-8000-000000000003', 'forest_clearance_pending',         1.0000,  68.200000, 'INCREASES_DELAY', 1),
  ('f0000000-0000-4000-8000-000000000003', 'acquisition_percentage',          10.0000,  59.500000, 'INCREASES_DELAY', 2),
  ('f0000000-0000-4000-8000-000000000003', 'compensation_pending_percentage', 94.0816,  41.100000, 'INCREASES_DELAY', 3),

  ('f0000000-0000-4000-8000-000000000004', 'possession_pending',               1.0000,  22.400000, 'INCREASES_DELAY', 1),
  ('f0000000-0000-4000-8000-000000000004', 'acquisition_percentage',          92.3177, -18.100000, 'DECREASES_DELAY', 2),
  ('f0000000-0000-4000-8000-000000000004', 'court_cases_count',                0.0000,   0.000000, 'NEUTRAL',         3)
ON CONFLICT (prediction_id, rank) DO NOTHING;


-- --- Recommendations --------------------------------------------------------
INSERT INTO public.recommendations
  (id, prediction_id, title, description, priority, recommended_action, status)
VALUES
  ('a1000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000002',
   'Expedite pending compensation disbursal',
   'Roughly two-thirds of the compensation liability is unpaid, which the model weights as the largest contributor to the projected delay.',
   'CRITICAL', 'Convene a disbursal review and clear verified pending payments in tranches.', 'OPEN'),
  ('a1000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000002',
   'Accelerate resettlement readiness',
   'R&R obligations remain outstanding while possession is pending.',
   'HIGH', 'Fast-track resettlement site readiness and publish an allotment schedule.', 'OPEN'),
  ('a1000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-000000000005',
   'Prioritise resolution of the title dispute',
   'An unresolved title dispute is the largest single contributor for this project.',
   'CRITICAL', 'Refer the dispute to the competent authority and seek an early hearing date.', 'IN_PROGRESS'),
  ('a1000000-0000-4000-8000-000000000004', 'f0000000-0000-4000-8000-000000000005',
   'Initiate encroachment removal process',
   'Encroachments on the alignment are contributing to the projected delay.',
   'HIGH', 'Issue statutory notices and schedule a joint removal drive.', 'OPEN'),
  ('a1000000-0000-4000-8000-000000000005', 'f0000000-0000-4000-8000-000000000003',
   'Follow up on pending forest clearance',
   'Stage-II forest clearance is the dominant contributor for this project.',
   'CRITICAL', 'Assign a nodal officer to pursue the diversion proposal weekly.', 'OPEN'),
  ('a1000000-0000-4000-8000-000000000006', 'f0000000-0000-4000-8000-000000000001',
   'Maintain current acquisition pace',
   'Acquisition is well advanced and the projected delay is low.',
   'LOW', 'Continue monitoring; no escalation required this cycle.', 'OPEN')
ON CONFLICT (id) DO NOTHING;


-- --- Actual outcomes (ground truth) -----------------------------------------
-- Closes the feedback loop for the one completed demo project.
--
-- Note the dates: the snapshot was frozen 2022-06-01 and the outcome observed
-- 2024-09-30 — the outcome is strictly LATER than the features it labels.
-- The temporal guard trigger on this table enforces exactly that.
INSERT INTO public.actual_outcomes
  (id, project_id, feature_snapshot_id, actual_delay_days, outcome_date)
VALUES
  ('a2000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000006',
   'e0000000-0000-4000-8000-000000000006', 121.00, '2024-09-30')
ON CONFLICT (id) DO NOTHING;

COMMIT;


-- ============================================================================
-- PART B — user-dependent demo data (OPTIONAL)
-- ============================================================================
-- public.profiles.id is a foreign key to auth.users(id), which Supabase Auth
-- owns. Users cannot be invented in SQL, so this part is commented out.
--
-- To use it:
--   1. Supabase Dashboard > Authentication > Users > "Add user" — create the
--      demo accounts you want (use throwaway addresses; never real officials').
--   2. Copy each generated UUID.
--   3. Uncomment the block below, replace the placeholder UUIDs, and run it.
--
-- A profile row is normally created by your signup flow or an auth trigger;
-- this manual path exists purely for local demo seeding.
-- ----------------------------------------------------------------------------

-- BEGIN;
--
-- INSERT INTO public.profiles (id, full_name, role, department, state) VALUES
--   ('<PASTE-AUTH-USER-UUID-1>', '[DEMO] Admin User',   'ADMIN',   '[DEMO] Infrastructure Dept', 'Maharashtra'),
--   ('<PASTE-AUTH-USER-UUID-2>', '[DEMO] Field Officer','OFFICER', '[DEMO] Land Acquisition Cell','Rajasthan'),
--   ('<PASTE-AUTH-USER-UUID-3>', '[DEMO] Data Analyst', 'ANALYST', '[DEMO] Planning Cell',       'Odisha'),
--   ('<PASTE-AUTH-USER-UUID-4>', '[DEMO] Viewer',       'VIEWER',  '[DEMO] Monitoring Cell',     'Gujarat')
-- ON CONFLICT (id) DO NOTHING;
--
-- -- Assign the officer to two projects so OFFICER-scoped RLS can be tested:
-- -- they should see exactly these two and nothing else.
-- INSERT INTO public.project_assignments (project_id, user_id) VALUES
--   ('b0000000-0000-4000-8000-000000000002', '<PASTE-AUTH-USER-UUID-2>'),
--   ('b0000000-0000-4000-8000-000000000005', '<PASTE-AUTH-USER-UUID-2>')
-- ON CONFLICT (project_id, user_id) DO NOTHING;
--
-- COMMIT;
