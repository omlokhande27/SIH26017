# Database Design — LandGuard AI

Predictive Analytics System for Early Detection of Land Acquisition Delays.

PostgreSQL 15+ on Supabase. Canonical schema: [`database/schema.sql`](../database/schema.sql).
Demo data: [`database/seed.sql`](../database/seed.sql). Migration convention:
[`database/migrations/README.md`](../database/migrations/README.md).

---

## 1. Design principles

1. **Normalized, not one wide table.** A project's land, compensation, legal and
   risk data live in their own tables. A wide table would force NULL-padding for
   every project missing a dimension, make constraints unenforceable, and turn
   every write into a lock on one hot row.
2. **The database enforces its own invariants.** Derived values are computed by
   PostgreSQL, not trusted from a request body. Every enum-like column has a
   CHECK constraint. Cross-table relationships that must line up are enforced by
   composite foreign keys, not by application discipline.
3. **The ML audit trail is immutable.** Feature snapshots and predictions are
   written once and never updated. A prediction that cannot be reproduced cannot
   be explained to the official who acted on it.
4. **Features and labels are physically separate.** See §7.

---

## 2. Entity relationship diagram

```
                          auth.users  (managed by Supabase Auth)
                               │ 1:1
                               ▼
                          ┌──────────┐
                          │ profiles │  role: ADMIN|OFFICER|ANALYST|VIEWER
                          └────┬─────┘
                    created_by │        │ user_id
                               ▼        └──────────────┐
                          ┌──────────┐                 │
              ┌───────────┤ projects ├──────────┐      │
              │           └────┬─────┘          │      │
              │                │                │      ▼
      1:1 ────┤                ├──── 1:N        │  ┌─────────────────────┐
              │                │                │  │ project_assignments │
   ┌──────────▼──────┐   ┌─────▼────────┐       │  └─────────────────────┘
   │ land_acquisition│   │ legal_issues │       │     UNIQUE(project_id,user_id)
   └─────────────────┘   └──────────────┘       │
   ┌─────────────────┐   ┌──────────────┐       │
   │  compensation   │   │ risk_factors ├───────┼──► risk_factor_types
   └─────────────────┘   └──────────────┘       │      (lookup / extensible)
        1:1                    1:N              │
                                                │ 1:N
                                                ▼
                              ┌──────────────────────────────┐
                              │  project_feature_snapshots   │  IMMUTABLE
                              │  ── ML INPUT, frozen in time │  no target columns
                              └───────┬──────────────────┬───┘
                                      │ 1:N              │ 1:1
                                      ▼                  ▼
     model_versions ──────────► ┌─────────────┐   ┌──────────────────┐
       (NULL metrics until      │ predictions │   │ actual_outcomes  │  GROUND TRUTH
        really evaluated)       │ result NULL │   │  (label, later)  │  separate table
                                │ unless      │   └──────────────────┘
                                │ SUCCESS     │
                                └──────┬──────┘
                                       │
                        ┌──────────────┴───────────────┐
                        │ 1:N                      1:N │
                        ▼                              ▼
          ┌────────────────────────┐        ┌─────────────────┐
          │ prediction_explanations│        │ recommendations │
          │  (model attribution,   │        │  (the ACT step) │
          │   NOT causal proof)    │        └─────────────────┘
          └────────────────────────┘
```

Product flow mapped onto tables:

| Stage | Table(s) |
|---|---|
| DATA COLLECTION | `projects`, `land_acquisition`, `compensation` |
| PROJECT MONITORING | `projects`, `project_assignments` |
| EARLY WARNING INDICATORS | `legal_issues`, `risk_factors` |
| ML FEATURE SNAPSHOT | `project_feature_snapshots` |
| DELAY PREDICTION | `predictions`, `model_versions` |
| EXPLAINABILITY | `prediction_explanations` |
| RISK PRIORITIZATION | `predictions.risk_level`, `predicted_delay_days` |
| RECOMMENDATIONS | `recommendations` |
| ACTUAL OUTCOME FEEDBACK | `actual_outcomes` |

---

## 3. Tables

### `profiles`
One row per authenticated user, keyed 1:1 to `auth.users(id)` with
`ON DELETE CASCADE`.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | FK → `auth.users(id)` |
| `full_name` | TEXT | |
| `role` | TEXT NOT NULL | CHECK ∈ ADMIN, OFFICER, ANALYST, VIEWER; defaults VIEWER |
| `department`, `state` | TEXT | nullable |
| `created_at`, `updated_at` | TIMESTAMPTZ | `updated_at` trigger-maintained |

**Role is never accepted from a client.** It is stored server-side, and the RLS
policy `profiles_update_own_no_role_change` blocks a user from changing their
own role by comparing the new row against their stored role. Role changes are an
ADMIN operation. The backend must apply the same rule (§9).

### `projects`
The central entity.

Key constraints: `project_code` UNIQUE; `project_status` ∈ PLANNED, ACTIVE,
ON_HOLD, COMPLETED, CANCELLED; latitude ∈ [-90, 90] and longitude ∈ [-180, 180];
planned and actual date pairs must be correctly ordered.

`created_by` → `profiles(id)` `ON DELETE SET NULL`, so removing a user never
destroys project history.

**No outcome columns are used as ML features.** `actual_completion_date` exists
for operational record-keeping but is deliberately *not* copied into feature
snapshots — see §7.

### `land_acquisition` — 1:1 with project
`project_id` is UNIQUE, which enforces the 1:1 relationship.

| Constraint | Rule |
|---|---|
| `land_required_ha > 0` | a project must need land to have an acquisition record |
| `land_acquired_ha >= 0` | |
| `land_acquired_not_over_required` | `land_acquired_ha <= land_required_ha` |
| `land_parcels_acquired_not_over_total` | only when both counts are present |
| `land_award_after_notification` | `award_date >= notification_date` |
| `land_possession_after_award` | `possession_date >= award_date` |

The last two encode the statutory sequence notification → award → possession.

### `compensation` — 1:1 with project
`payment_status` ∈ NOT_STARTED, IN_PROGRESS, PARTIAL, COMPLETED, DISPUTED.
`total_compensation_paid <= total_compensation_required` is enforced.
`last_updated` is maintained by its own trigger.

### `legal_issues` — 1:N
`issue_type` ∈ LITIGATION, LAND_DISPUTE, TITLE_DISPUTE, LAND_RECORD_ISSUE,
COMPENSATION_DISPUTE. `severity` ∈ LOW, MEDIUM, HIGH, CRITICAL.
`status` ∈ OPEN, IN_PROGRESS, RESOLVED, CLOSED.
`resolved_date >= reported_date`, and `case_reference` may only be set when
`court_case = TRUE`.

### `risk_factors` — 1:N
`factor_type` is a **foreign key to `risk_factor_types(code)`**, not a CHECK
constraint. The brief requires new factor types without destructive schema
changes: with a lookup table, adding one is a single INSERT rather than a
constraint rebuild that has to revalidate the whole table.

Seeded types: `R_AND_R_PENDING`, `ROW_ISSUE`, `ENCROACHMENT`,
`FOREST_CLEARANCE_PENDING`, `POSSESSION_PENDING`, `ADMINISTRATIVE_DELAY`,
`LANDOWNER_OBJECTION`.

Closed lifecycle vocabularies elsewhere (`status`, `severity`, `role`) stay as
CHECK constraints — they are not expected to grow, and a constraint keeps the
value visible in the table definition.

### `project_feature_snapshots` — the ML input record
See §6 and §7. No `updated_at` column: snapshots are immutable by design.

Integrity constraints beyond the leakage rule:
- `snapshot_rr_pending_requires_rr` — pending R&R implies R&R was required.
- `snapshot_litigation_matches_case_count` — `litigation_flag` is true exactly
  when `court_cases_count > 0`, so the two can never contradict each other.
- `snapshot_acquired_not_over_required`.

### `model_versions`
`version` UNIQUE. `status` ∈ TRAINING, STAGING, ACTIVE, ARCHIVED, FAILED.

A **partial unique index** allows at most one `ACTIVE` model at a time, so the
serving model is unambiguous.

`mae`, `rmse`, `r2_score` are **NULLable on purpose**: NULL means "not yet
measured". Never substitute a plausible-looking number for an unmeasured metric.
`r2_score` is capped at 1 but has no lower bound, because R² is genuinely
unbounded below for a bad model.

### `predictions`
`risk_level` ∈ LOW, MEDIUM, HIGH, CRITICAL.
`prediction_status` ∈ PENDING, SUCCESS, FAILED.
`predicted_delay_days >= 0`.

**`predicted_delay_days` and `risk_level` are nullable, and that is the point.**
A row here records an *inference attempt*, and an attempt does not always
produce a result. The constraint `predictions_result_matches_status` makes the
two representable states exhaustive:

| `prediction_status` | `predicted_delay_days` | `risk_level` |
|---|---|---|
| `SUCCESS` | **required** | **required** |
| `FAILED` | **must be NULL** | **must be NULL** |
| `PENDING` | **must be NULL** | **must be NULL** |

There is no way to record a successful prediction with no value, and no way to
record a failure carrying one. See §4a for why this replaced a `NOT NULL`
column.

The composite FK `(feature_snapshot_id, project_id)` → `project_feature_snapshots(id, project_id)`
makes it **structurally impossible** to attach a prediction to a snapshot
belonging to a different project.

`ON DELETE RESTRICT` on the snapshot FK prevents deleting a snapshot that a
prediction depends on — the audit trail cannot be silently broken.

### `prediction_explanations`
Per-feature attribution (e.g. SHAP values) for one prediction.
`contribution_direction` ∈ INCREASES_DELAY, DECREASES_DELAY, NEUTRAL.
`contribution_score` is signed and may be negative.
UNIQUE on `(prediction_id, rank)` and on `(prediction_id, feature_name)`.

> **Interpretation warning.** These values describe how the model weighted each
> feature in producing *its own output*. They are **not** evidence of a causal
> relationship in the real world. A high contribution for `title_issue_flag`
> means the model leaned on that feature — not that the title issue provably
> caused the delay. UI copy and reports must not present them as proven cause.

### `recommendations`
`priority` ∈ CRITICAL, HIGH, MEDIUM, LOW.
`status` ∈ OPEN, IN_PROGRESS, COMPLETED, DISMISSED.
`completed_at` may only be set when status is COMPLETED or DISMISSED.

### `actual_outcomes` — ground truth
The ML target. Separate table by design (§7). UNIQUE on `feature_snapshot_id`:
one label per snapshot. Carries the same composite FK as `predictions`, plus a
temporal guard trigger (§7).

### `project_assignments`
UNIQUE `(project_id, user_id)` prevents duplicates. Drives OFFICER scoping in
RLS.

### `risk_factor_types`
Reference vocabulary for `risk_factors.factor_type`.

---

## 4. Derived fields

Three columns are derived. All three are **`GENERATED ALWAYS AS ... STORED`** —
Option B in the brief.

| Table | Column | Expression |
|---|---|---|
| `land_acquisition` | `land_acquisition_percentage` | `land_acquired_ha / land_required_ha * 100` |
| `compensation` | `compensation_pending` | `total_compensation_required - total_compensation_paid` |
| `compensation` | `compensation_pending_percentage` | `compensation_pending / total_compensation_required * 100` |

### Why generated columns rather than server-side calculation

PostgreSQL recomputes the value on every write, and an INSERT or UPDATE that
*targets* the column is rejected outright. A client therefore cannot supply or
spoof a derived value — and neither can a future service, a direct SQL session,
or an admin editing rows in the Supabase dashboard. Computing in the Node layer
would only protect the one path that happens to go through Node.

This is verified: attempts to write these columns are rejected, and the computed
values are correct (25.0000% from 50/200 ha; 750000.00 pending from
1000000.00 − 250000.00).

### Division-by-zero

`compensation_pending_percentage` wraps the division in
`CASE WHEN total_compensation_required > 0 ... ELSE 0 END`, because a required
total of 0 is legitimate. `land_acquisition_percentage` carries the same guard
defensively even though `land_required_ha > 0` is already enforced.

### Deviation from the brief

The brief specified these columns as `NOT NULL DEFAULT 0`. A generated column
cannot declare a DEFAULT — the value is never client-supplied, so a default has
nothing to apply to. The columns are non-null in practice because their inputs
are NOT NULL and the expressions are total. This is strictly stronger than the
requested behaviour, not weaker.

---

## 4a. A failed prediction stores no value

The baseline schema declared `predictions.predicted_delay_days` as `NOT NULL`
while `prediction_status` allowed `'FAILED'`. Those two rules contradict each
other: a failed ML inference produces no delay estimate, so the `NOT NULL`
forced every caller to invent one.

### Why `0` is the worst available placeholder

The obvious placeholder is `0`, and it is precisely the wrong choice. `0` is a
**valid, plausible reading** — "this project is not expected to slip" — so a
failure stored as `0` is indistinguishable from a genuine forecast. It does not
announce itself anywhere:

- a dashboard renders it as a green, low-risk project;
- `AVG(predicted_delay_days)` silently pulls the fleet-wide average down, and
  the more inference failures there are, the healthier the portfolio looks;
- a training query that filters on `prediction_status` correctly is fine, and
  one that forgets to learns from fabricated zeros.

A sentinel like `-1` fails differently but no better: it violates the
`>= 0` CHECK, and any sentinel has to be remembered by every consumer forever.

`NULL` is the only representation that means "no value" to the database, to
SQL aggregates (which skip it), and to every client library — without anyone
having to agree on a convention.

### The constraint

```sql
CONSTRAINT predictions_result_matches_status CHECK (
  CASE prediction_status
    WHEN 'SUCCESS' THEN predicted_delay_days IS NOT NULL AND risk_level IS NOT NULL
    WHEN 'FAILED'  THEN predicted_delay_days IS NULL     AND risk_level IS NULL
    WHEN 'PENDING' THEN predicted_delay_days IS NULL     AND risk_level IS NULL
  END
)
```

Both directions are enforced. A `SUCCESS` row with no value is rejected just as
firmly as a `FAILED` row carrying one, so dropping `NOT NULL` costs nothing:
successful predictions are still guaranteed to have a value.

Three details worth noting:

1. **`risk_level` is included.** A failed inference has no risk band either, and
   writing `'LOW'` would be the same fabrication in a different column. Leaving
   `risk_level NOT NULL` would have re-created the problem one column over.
2. **`PENDING` is treated like `FAILED`.** An inference that has not finished
   has no result yet, for exactly the same reason.
3. **It is written as a `CASE` over the status**, not as a chain of `OR`s. A
   `CASE` with no `ELSE` returns NULL for an unhandled status, and a CHECK
   constraint that evaluates to NULL passes. So if a fourth status is ever added
   to the status CHECK without a decision about its result semantics, rows in
   that status would slip past unvalidated. Keeping every status listed here
   means adding one requires touching this constraint — the reminder is the
   point.

### Consequences for the application

`predicted_delay_days` and `risk_level` are now nullable in every generated
type, so consumers must handle the null case. That is the intended outcome:
a UI that cannot render "prediction unavailable" was previously rendering
"0 days delay, low risk" instead.

Aggregate queries need no change — SQL aggregates already skip NULL, so
`AVG(predicted_delay_days)` now averages real predictions only, which is what
it was always meant to do.

Existing databases: apply
`migrations/0002_prediction_result_matches_status.sql`. It deliberately does
**not** rewrite pre-existing rows — it cannot distinguish a fabricated `0` from
a genuine 0-day forecast filed under the wrong status, so the migration aborts
and the file documents the query for finding and clearing them by hand.

---

## 5. Money precision

Financial columns are **`NUMERIC(18, 2)`** — exact decimal, never floating
point. `FLOAT`/`DOUBLE PRECISION` cannot represent 0.10 exactly and accumulates
error across sums; for compensation figures that is unacceptable.

- **Unit:** Indian Rupees, two decimal places (paise).
- **Range:** up to 9,999,999,999,999,999.99 (≈1.0 × 10¹⁶), far above any single
  project's compensation outlay.
- **Percentages:** `NUMERIC(7, 4)` — four decimal places, enough for 100.0000.
- **Areas:** `NUMERIC(14, 4)` hectares.
- **Day counts:** `NUMERIC(10, 2)` — fractional days are permitted because model
  output is continuous.

In JavaScript, `NUMERIC` arrives from `@supabase/supabase-js` as a **string**,
because IEEE-754 doubles cannot hold every NUMERIC value. Do not coerce money to
`Number` for arithmetic. Use a decimal library, or do the arithmetic in SQL.

---

## 6. The feature snapshot concept

A project mutates continuously — land gets acquired, compensation gets paid,
disputes open and close. A prediction made today points at values that will be
different next week.

If `predictions` referenced live project rows, then re-opening a prediction six
months later would show today's values, not the ones the model actually saw. The
prediction would be unexplainable and unauditable — and for a system advising
government officials, "we cannot reconstruct why the model said 287 days" is not
an acceptable answer.

`project_feature_snapshots` solves this by freezing the exact feature vector at
prediction time. Every prediction references a snapshot; the snapshot never
changes.

**How immutability is enforced:**

1. No `updated_at` column and no UPDATE trigger.
2. No UPDATE policy is granted to any role in RLS — only ADMIN's blanket policy.
   Verified: an OFFICER's UPDATE against a snapshot affects 0 rows.
3. `ON DELETE RESTRICT` on referencing FKs — a snapshot cannot be deleted while
   a prediction or outcome depends on it. Verified.

**Consequence:** historical ML data cannot change. Re-running a stored
prediction against its stored snapshot reproduces the same input vector
regardless of how much the live project has moved on.

---

## 7. Data leakage prevention

Target leakage — letting information about the outcome into the training
features — is the most common way an ML project produces excellent offline
metrics and useless real-world predictions. The schema defends against it in
four independent ways.

### 7.1 Physical separation

Features live in `project_feature_snapshots`. The label lives in
`actual_outcomes`. They are different tables, so a training query must perform
an explicit, reviewable JOIN to reach the target. A careless `SELECT *` over the
feature table cannot pull the label in by accident.

### 7.2 A documented column boundary

`project_feature_snapshots` carries a prominent header in `schema.sql` listing
what must never be added: `delay_days_target`, `delay_months_target`, actual
delay, actual completion date, realised cost overrun, or any other post-hoc
value.

Verified automatically: no column in the table matches an outcome/target naming
pattern, and `actual_delay_days` exists in `actual_outcomes` and nowhere else.

### 7.3 Elapsed-time features are inputs, not targets

`notification_delay_days` and `award_delay_days` measure delay **already
observed** as of `snapshot_date` — e.g. days elapsed between notification and
award, both of which are past events. They are legitimate inputs. They must
never be computed against a future or projected date.

### 7.4 A temporal guard in the database

The trigger `trg_actual_outcomes_temporal_guard` rejects any outcome whose
`outcome_date` precedes the `snapshot_date` of the snapshot it labels. A CHECK
constraint cannot express this, as it spans two tables.

This makes "label an old snapshot with an outcome observed before it" a database
error rather than a silent modelling bug. Verified: an outcome dated before its
snapshot is rejected; one dated after is accepted.

### 7.5 Cross-project contamination

Composite foreign keys `(feature_snapshot_id, project_id)` on both `predictions`
and `actual_outcomes` guarantee a snapshot can only be linked within its own
project. Verified: linking project B's prediction to project A's snapshot is
rejected.

---

## 8. Index strategy

47 indexes exist, most of them created automatically by PRIMARY KEY and UNIQUE
constraints. Explicit indexes were added only where a real access path needs
them.

| Access path | Index |
|---|---|
| Dashboard filters | `projects(state)`, `(district)`, `(sector)`, `(project_status)`, `(created_by)` |
| Issue triage | `legal_issues(project_id/status/severity)`, `risk_factors(project_id/status/severity)` |
| Latest snapshot for a project | `project_feature_snapshots(project_id, snapshot_date DESC)` |
| Latest prediction for a project | `predictions(project_id, created_at DESC)` |
| Risk prioritisation queue | `predictions(risk_level)`, `predictions(created_at DESC)` |
| Explanation fetch, ordered | `prediction_explanations(prediction_id, rank)` |
| Action queue | `recommendations(prediction_id)`, `recommendations(status)` |
| Feedback loop | `actual_outcomes(project_id)` |
| "My projects" | `project_assignments(user_id)` |

**Deliberately not created.** Every index costs write throughput, so these were
skipped because a unique index already covers the column:

- `land_acquisition(project_id)` — already UNIQUE
- `compensation(project_id)` — already UNIQUE
- `actual_outcomes(feature_snapshot_id)` — already UNIQUE
- `project_assignments(project_id)` — leading column of the UNIQUE pair

The composite `(project_id, snapshot_date DESC)` and `(project_id, created_at DESC)`
indexes serve both the plain `project_id` lookup and the ordered "latest"
query, so no separate single-column index was added.

---

## 9. Row Level Security

RLS is enabled on **all 14 tables**, with 42 policies. Default-deny: with RLS on
and no matching policy, access is refused.

### Role visibility policy (SIH prototype)

This is the access model as implemented, stated in full. It is the prototype
policy: deliberate, documented, and replaceable — not a placeholder.

#### ADMIN
- Full access to all projects and all project data.
- System management: profiles and role assignment, the model registry, and the
  risk-factor reference vocabulary.
- The only role that may create or delete projects.

#### ANALYST
- **Read** access to all projects and their operational data.
- Access to analytics: predictions, prediction explanations, recommendations,
  feature snapshots and ground-truth outcomes — both halves of a training pair,
  which is what model evaluation requires.
- Reads the model registry.
- **No write access to anything.** An oversight role must not mutate
  operational records.

#### OFFICER
- Access limited to **assigned projects only**, resolved through
  `project_assignments` (or having created the project).
- May **modify authorised project information** on those projects: land
  acquisition, compensation, legal issues and risk factors; and may advance a
  recommendation through its lifecycle (the ACT stage of the product flow).
- May **not** create or delete projects.
- May **not** update feature snapshots, predictions or actual outcomes. These
  are the audit trail of what the model saw and what actually happened; an
  officer who could revise them could rewrite the record after the fact.
- May **not** assign themselves to further projects — otherwise
  assignment-based scoping would be self-service.

#### VIEWER
- **Read-only.** No write access to any table, anywhere.
- For this prototype, **national visibility is temporarily allowed**: a VIEWER
  reads all projects regardless of state or department.

### The VIEWER/ANALYST national scope is a prototype decision

> **This is an interim position, adopted deliberately and recorded here so it
> can be revisited — not an oversight.**

The brief specifies "read-only access according to allowed project visibility"
without defining what bounds that visibility. State? Implementing department?
An explicit per-project grant list? Each produces a different schema and a
different set of policies, and picking one now would hard-code a guess into the
security model — the most expensive place to guess wrong. The honest position
is national read access plus this note.

**What the relaxation does and does not touch.** It widens *read* for two roles
that are already read-only. It changes no write authorisation anywhere:

| Protection | Status under the prototype policy |
|---|---|
| VIEWER write access | none, on any table |
| ANALYST write access | none, on any table |
| OFFICER writes | still confined to assigned projects |
| Project create / delete | ADMIN only |
| Role self-promotion | blocked by `profiles_update_own_no_role_change` |
| Snapshots / predictions / outcomes | no UPDATE policy for any non-admin role |
| Reference vocabulary, model registry | ADMIN write only |
| Unauthenticated access | none |

**Replacing it later is a contained change.** Every affected policy is a
`SELECT` policy containing the literal `'ANALYST', 'VIEWER'` in its role list.
`profiles.state` and `profiles.department` already exist to carry the boundary.
A future migration narrows those clauses:

```sql
public.current_app_role() = 'ADMIN'
OR (public.current_app_role() IN ('ANALYST', 'VIEWER')
    AND state = public.current_user_state())
```

No table, no column and no write policy has to change to make that switch. The
RLS tests assert the national scope as the current *intended* behaviour, so
narrowing it will fail those tests loudly — which is exactly the signal you
want when changing a security boundary.

### Policy matrix

| Role | Projects & child data | Predictions / explanations / recommendations | Snapshots & outcomes | Profiles | Admin data |
|---|---|---|---|---|---|
| **ADMIN** | full | full | full | full | full |
| **ANALYST** | read all | read all | read all | own | none |
| **OFFICER** | read + update **assigned only** | read assigned; update recommendations on assigned | read assigned; insert; **no update** | own | none |
| **VIEWER** | read all | read all | read all | own | none |
| *unauthenticated* | none | none | none | none | none |

Verified by `database/tests/rls.test.ts`, which exercises every cell of this
matrix as each role. See §12.

### Why these choices

- **OFFICER is scoped to assignments** because a field officer's authority is
  project-specific. They may correct operational data on their own projects but
  cannot create or delete projects.
- **ANALYST and VIEWER are read-only** — oversight roles that must not mutate
  operational records.
- **Snapshots, predictions and outcomes have no OFFICER update policy**, because
  they are the audit trail (§6).
- **`model_versions` is readable by all, writable only by ADMIN** — model
  provenance is not sensitive, but the registry decides which model serves
  traffic.
- **Self-promotion is blocked.** `profiles_update_own_no_role_change` compares
  the submitted role against the caller's stored role. Verified: an OFFICER
  cannot set their own role to ADMIN.

### Avoiding infinite recursion

The helper functions `current_app_role()`, `is_admin()` and
`is_assigned_to_project()` are **`SECURITY DEFINER`**. They read
`public.profiles`, which is itself under RLS — without DEFINER, the policy on
`profiles` would re-enter itself and recurse until PostgreSQL aborts. This is the
single most common way a Supabase RLS setup breaks. `search_path` is pinned to
`public, pg_temp` so the functions cannot be hijacked by a caller-set path.

These functions are defined **after** the tables they read, because a
SQL-language function body is validated at CREATE time.

### RLS is not sufficient on its own

> The Node backend connects with the **service role key, which bypasses RLS
> entirely.** Every policy above is invisible to backend queries.

RLS protects the direct-from-client path (anon key → PostgREST) and is a second
line of defence. It is **not** the authorization layer for the API.

The backend must therefore enforce the same rules itself:

1. Resolve the caller's role from `profiles` server-side — never from the
   request body or a client-supplied claim.
2. Check project assignment before any OFFICER write.
3. Reject role changes from non-ADMIN callers.
4. Use the **anon** client for user-scoped reads where practical, so RLS applies
   as defence in depth. Reserve the service-role client for operations that
   genuinely need to bypass it (ML writes, cross-project analytics, admin jobs).

The two layers complement each other: RLS is the backstop that holds even if an
API handler forgets a check; the backend layer is what actually runs for API
traffic.

### Before production

- [ ] **Define the visibility boundary for VIEWER/ANALYST** and replace the
      prototype national read scope. This is the one deliberate relaxation in
      the model; see "The VIEWER/ANALYST national scope is a prototype
      decision" above for what has to change (SELECT policies only) and what
      does not (everything else).
- [ ] Confirm the OFFICER-narrower-than-VIEWER asymmetry is intended (§10).
- [ ] Add an `auth.users` → `profiles` trigger so a profile is created on signup
      with role VIEWER; never let the client choose its initial role.
- [ ] Audit every backend route that uses the service-role client.
- [ ] Re-test the policy matrix against real Supabase Auth JWTs. The suite in
      `database/tests/` shims `auth.uid()`, so it exercises the policy logic
      but not the JWT plumbing.

---

## 10. Assumptions and deviations

Recorded rather than silently invented:

1. **OFFICER sees fewer projects than VIEWER.** The brief scopes OFFICER to
   assigned projects while VIEWER gets "read-only access according to allowed
   project visibility". Implemented literally. This is unusual — confirm it
   matches the intended hierarchy.
2. **VIEWER/ANALYST visibility is national — a documented prototype policy.**
   "Allowed project visibility" was not defined further, and the
   state/department/project scoping rules are not yet settled, so read access
   spans all projects for now. This widens *read* for two already read-only
   roles and weakens no write protection. `profiles.state` and
   `profiles.department` exist to carry the boundary when it is defined; the
   change is confined to SELECT policies. Full rationale and blast radius in
   §9.
3. **Generated columns cannot carry `NOT NULL DEFAULT 0`** (§4). Stricter than
   requested.
4. **`predictions.predicted_delay_days` deviates from the brief: it is
   nullable, governed by a CHECK constraint.** The brief specified `NOT NULL`,
   which contradicted `prediction_status = 'FAILED'` and would have forced a
   fabricated value — most likely `0`, which is indistinguishable from a
   genuine "no delay expected" forecast. `predictions_result_matches_status`
   now requires a value on SUCCESS and forbids one on FAILED/PENDING, so
   successful predictions are still guaranteed to carry a value. `risk_level`
   is nullable on the same terms, since `'LOW'` would be the same fabrication
   one column over. Rationale in §4a; migration `0002`.
5. **`risk_factors.factor_type` uses a lookup table**, not a CHECK constraint,
   to satisfy the extensibility requirement (§3).
6. **Extra statuses added** beyond the brief's examples: `payment_status`
   (NOT_STARTED, IN_PROGRESS, PARTIAL, COMPLETED, DISPUTED), `model_versions.status`
   (TRAINING, STAGING, ACTIVE, ARCHIVED, FAILED), `prediction_status` gains PENDING.
7. **`migrations/` holds no copy of the baseline.** `schema.sql` is the single
   source of truth; duplicating ~1000 lines would guarantee drift. Numbered
   migrations start at 0002.
8. **Demo predictions were not produced by a model.** No model exists yet. Seed
   predictions point at a placeholder `model_versions` row explicitly named
   `demo-0.1.0-untrained`, and all evaluation metrics are NULL.
9. **`profiles` cannot be seeded in SQL** because `auth.users` is Supabase-managed.
   Seed PART B is commented out with instructions.

---

## 11. Applying the schema

### Supabase SQL Editor

1. Open your project → **SQL Editor** → **New query**.
2. Paste the entire contents of `database/schema.sql` and **Run**.
   It is idempotent — re-running is safe.
3. Optionally paste `database/seed.sql` and **Run** for demo data.
4. Verify: **Table Editor** should list 14 tables.

### psql

```bash
psql "$DATABASE_URL" -f database/schema.sql
psql "$DATABASE_URL" -f database/seed.sql   # demo data only
```

> `seed.sql` inserts fictional `[DEMO]`-prefixed rows. Never run it against a
> production database.

### Migrations

`schema.sql` is the canonical baseline and already contains every migration, so
a **fresh install runs `schema.sql` alone**. The numbered files in
`migrations/` exist for databases created before a change:

```bash
psql "$DATABASE_URL" -f database/migrations/0002_prediction_result_matches_status.sql
```

See `database/migrations/README.md` for the conventions.

### Before applying a change

Run the regression suite (§12) — it applies `schema.sql`, `seed.sql` and every
migration against a real PostgreSQL engine locally, with no server required:

```bash
cd database && npm test
```

---

## 12. Verification performed

The schema, seed and migrations are covered by an automated regression suite in
[`database/tests/`](../database/tests/README.md), run against a **real
PostgreSQL engine** (PGlite — PostgreSQL compiled to WebAssembly, same planner,
same constraint machinery, same SQLSTATE codes) rather than reviewed by eye or
checked against a mock.

```bash
cd database
npm install
npm test
```

No PostgreSQL server, Docker, network connection or Supabase project is
required.

**157 tests across 5 suites, all passing.**

| Suite | Tests | Covers |
|---|---|---|
| `schema.test.ts` | 14 | apply, idempotency (×3), table set, RLS enabled everywhere, policy count, SECURITY DEFINER helpers with pinned `search_path`, `updated_at` triggers, index set, single-ACTIVE-model index, migration convergence |
| `constraints.test.ts` | 52 | generated columns and anti-spoofing, `predictions_result_matches_status` in both directions and on UPDATE, domain CHECKs, FKs, cascade/restrict, `updated_at` triggers, explanations, recommendations |
| `leakage.test.ts` | 22 | feature/target separation, automated outcome-column audit, temporal guard on INSERT and UPDATE, cross-project composite FK, snapshot immutability |
| `seed.test.ts` | 18 | seed load, re-load idempotency, `[DEMO]` labelling of names/codes/agencies/case references, no fabricated model metrics, referential and derived-value integrity |
| `rls.test.ts` | 51 | the full role matrix as each role, plus privilege-escalation attempts from every angle |

Findings from building this suite:

- An **ordering bug** was caught: the RLS helper functions were defined before
  `public.profiles` existed, so a fresh apply failed at CREATE time. It would
  have broken the very first paste into the Supabase SQL Editor.
- Self-promotion is rejected by the policy's `WITH CHECK`, which raises
  SQLSTATE **`42501`**, not a CHECK-constraint violation — the block is real,
  but the error code is not the one you would guess.
- Two `updated_at` assertions were **flaky by construction**: they compared two
  wall-clock readings, and PGlite's clock has millisecond resolution, so two
  fast statements can share a tick. They now backdate the row with the trigger
  disabled and assert the trigger moved it forward — deterministic, and a
  stricter test of the trigger besides.

### What the suite does not cover

- **Real Supabase Auth JWTs.** `auth.uid()` is shimmed to read a session
  setting, so the policy *logic* is exercised but the JWT plumbing is not.
- **The backend authorization layer.** The Node backend uses the service role
  key and bypasses RLS entirely (§9), so nothing in `rls.test.ts` constrains
  API traffic.
- **Performance.** Indexes are asserted to exist, not to be used or to help.
