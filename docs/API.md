# API Reference — LandGuard AI

Phase 3 business API. **Only endpoints that exist are documented here.** ML
prediction, SHAP explanation and LLM summaries are not implemented yet and have
no routes.

Base path: `/api` · All responses are JSON.

---

## 1. Authentication

Every `/api` route requires a Supabase JWT:

```
Authorization: Bearer <supabase-access-token>
```

Identity and authority come from **different sources, deliberately**:

| Question | Source |
|---|---|
| Who is the caller? | The JWT's `sub` claim (signature-verified) |
| What may they do? | `public.profiles.role`, read server-side |

The role is **never** read from the token. `user_metadata` is writable by the
user, so a correctly-signed token can carry any role its holder chose. See
`docs/ARCHITECTURE.md` §4.

Tokens must be signed **HS256**, carry `aud: "authenticated"`, be unexpired,
and have a UUID `sub`.

### Provisioning

A `profiles` row is created automatically on signup with role **`VIEWER`**
(database trigger `on_auth_user_created`). Role is a hard-coded literal — it is
never taken from signup metadata. Promotion is an ADMIN action.

An authenticated user with **no** profile row gets **403**, not a default role.

---

## 2. Response format

Success:

```json
{ "success": true, "data": { }, "message": "optional" }
```

Error:

```json
{ "success": false, "error": "Human-readable message", "details": { } }
```

`details` appears on validation failures and on business-rule refusals. Raw
database text is never returned.

### Status codes

| Code | Meaning |
|---|---|
| `200` | OK |
| `201` | Created |
| `400` | Malformed request — failed schema validation |
| `401` | Missing, malformed, expired or invalid token |
| `403` | Authenticated, but not permitted (or no profile provisioned) |
| `404` | Resource does not exist, or is not reachable through this project |
| `409` | Conflict — duplicate project code, or a 1:1 record that already exists |
| `422` | Valid request refused on its merits — business rule or DB invariant |
| `500` | Unexpected server fault |
| `503` | A dependency (the database) was unavailable |

**400 vs 422:** 400 means "this is not shaped like a request". 422 means "this
is a valid request the domain refuses" — land acquired exceeding land required,
or project data too incomplete for a snapshot.

---

## 3. Role permissions

| Capability | ADMIN | ANALYST | OFFICER | VIEWER |
|---|:--:|:--:|:--:|:--:|
| List / read projects | all | all | **assigned only** | all |
| Create project | ✅ | ❌ | ❌ | ❌ |
| Update project | ✅ | ❌ | assigned only | ❌ |
| Delete project | ✅ | ❌ | ❌ | ❌ |
| Read land / compensation / issues / factors | all | all | assigned only | all |
| Write land / compensation / issues / factors | ✅ | ❌ | assigned only | ❌ |
| Read snapshots | all | all | assigned only | all |
| Create snapshot | ✅ | ❌ | assigned only | ❌ |
| Update / delete snapshot | ❌ | ❌ | ❌ | ❌ |

> **Prototype visibility.** ANALYST and VIEWER read **nationally** — all
> projects, regardless of state or department. This is a documented interim
> decision, not an oversight: the brief does not define what bounds "allowed
> project visibility". It widens *read* for two already read-only roles and
> weakens no write protection. See `docs/DATABASE.md` §9.

"Assigned" means an explicit `project_assignments` row **or** having created
the project (mirrors `is_assigned_to_project()` in the schema).

---

## 4. Projects

### `GET /api/projects`

Paginated, filtered list. Scoped by role — an OFFICER receives only assigned
projects.

**Query parameters** (unknown parameters are rejected with 400):

| Name | Type | Default |
|---|---|---|
| `page` | integer ≥ 1 | `1` |
| `limit` | integer 1–100 | `20` |
| `state`, `district`, `sector`, `implementing_agency` | string | — |
| `project_status` | `PLANNED` \| `ACTIVE` \| `ON_HOLD` \| `COMPLETED` \| `CANCELLED` | — |
| `search` | string — partial match on name or code | — |
| `sort` | `created_at` \| `updated_at` \| `project_name` \| `project_code` | `created_at` |
| `order` | `asc` \| `desc` | `desc` |

```json
{
  "success": true,
  "data": {
    "projects": [ { "id": "…", "project_name": "…", "project_code": "…" } ],
    "pagination": {
      "page": 1, "limit": 20, "total": 42, "totalPages": 3,
      "hasNext": true, "hasPrevious": false
    }
  }
}
```

### `POST /api/projects` — ADMIN only

```json
{
  "project_name": "Northern Bypass Corridor — Package A",
  "project_code": "RD-001",
  "state": "Maharashtra",
  "district": "Pune",
  "sector": "ROAD",
  "implementing_agency": "State Highways Agency",
  "planned_start_date": "2024-01-15",
  "planned_completion_date": "2026-06-30",
  "project_status": "ACTIVE",
  "latitude": 19.075,
  "longitude": 72.8776
}
```

Required: `project_name`, `project_code`, `state`, `district`, `sector`,
`implementing_agency`. Everything else is optional.

`created_by` is set from the authenticated caller and **rejected if supplied** —
authorship grants project access, so accepting it from input would let a caller
hand access to someone else.

→ `201`. Duplicate `project_code` → `409`.

### `GET /api/projects/:projectId`
### `PATCH /api/projects/:projectId`

Any subset of the create fields. An empty body → `400`. Nullable fields accept
`null` to clear them. `updated_at` is maintained by a database trigger and
ignored if supplied.

### `DELETE /api/projects/:projectId` — ADMIN only

Cascades to land, compensation, legal issues, risk factors and snapshots.
Refused with `409` if a prediction references one of its snapshots — the audit
trail of what was predicted must not be erasable.

---

## 5. Land acquisition — 1:1 with project

`GET` · `POST` · `PATCH` `/api/projects/:projectId/land-acquisition`

```json
{
  "land_required_ha": "145.5000",
  "land_acquired_ha": "132.4000",
  "land_parcels_total": 620,
  "land_parcels_acquired": 561,
  "affected_landowners": 540,
  "affected_families": 480,
  "possession_obtained": false,
  "notification_date": "2023-08-10",
  "award_date": "2024-01-05",
  "possession_date": null
}
```

> ### `land_acquisition_percentage` is calculated by the database
>
> It is `GENERATED ALWAYS ... STORED`. **Supplying it returns `400`.** Send
> `land_required_ha` and `land_acquired_ha`; the response carries the
> percentage PostgreSQL computed.
>
> This is why the column is generated rather than computed in the API: a client
> that could write it could report 100% acquisition on a project that has
> acquired nothing.

**Amounts and areas are strings.** PostgreSQL `NUMERIC` is exact decimal and an
IEEE-754 double cannot hold every value. Send strings, receive strings, and do
not parse them to `Number` for arithmetic.

Rules (violations → `400`): acquired ≤ required · parcels acquired ≤ total ·
`notification_date` ≤ `award_date` ≤ `possession_date` · no negatives ·
`land_required_ha > 0`.

`POST` when a record already exists → `409` (use `PATCH`). `GET` with no record
→ `404`.

---

## 6. Compensation — 1:1 with project

`GET` · `POST` · `PATCH` `/api/projects/:projectId/compensation`

```json
{
  "total_compensation_required": "412000000.00",
  "total_compensation_paid": "366000000.00",
  "payment_status": "IN_PROGRESS"
}
```

`payment_status` ∈ `NOT_STARTED`, `IN_PROGRESS`, `PARTIAL`, `COMPLETED`,
`DISPUTED`.

> **`compensation_pending` and `compensation_pending_percentage` are calculated
> by the database.** Supplying either returns `400`. Send the two source
> amounts; the response carries both derived values.

Rule: paid ≤ required (→ `400`).

---

## 7. Legal issues — many per project

`GET` · `POST` `/api/projects/:projectId/legal-issues`
`GET` · `PATCH` · `DELETE` `/api/projects/:projectId/legal-issues/:id`

```json
{
  "issue_type": "LITIGATION",
  "court_case": true,
  "case_reference": "WP/1234/2024",
  "status": "OPEN",
  "severity": "CRITICAL",
  "description": "Writ petition contesting the award.",
  "reported_date": "2024-03-12",
  "resolved_date": null
}
```

| Field | Values |
|---|---|
| `issue_type` | `LITIGATION`, `LAND_DISPUTE`, `TITLE_DISPUTE`, `LAND_RECORD_ISSUE`, `COMPENSATION_DISPUTE` |
| `status` | `OPEN`, `IN_PROGRESS`, `RESOLVED`, `CLOSED` |
| `severity` | `LOW`, `MEDIUM`, `HIGH`, `CRITICAL` |

Required: `issue_type`, `severity`.

Rules: `case_reference` only when `court_case` is `true` · `resolved_date` ≥
`reported_date`.

A child resource is addressed as `(projectId, id)`. Requesting one through a
different project returns `404` — knowing its UUID is not enough to reach it.

---

## 8. Risk factors — many per project

`GET` · `POST` `/api/projects/:projectId/risk-factors`
`GET` · `PATCH` · `DELETE` `/api/projects/:projectId/risk-factors/:id`

```json
{
  "factor_type": "FOREST_CLEARANCE_PENDING",
  "factor_name": "Stage-II forest clearance awaited",
  "status": "OPEN",
  "severity": "CRITICAL",
  "description": "Diversion proposal under review.",
  "reported_date": "2024-03-01"
}
```

Required: `factor_type`, `factor_name`, `severity`.

`factor_type` is a foreign key into `risk_factor_types`, **not** a fixed enum —
new factor types are an INSERT, not a schema change. An unknown code returns
`422` pointing at the reference endpoint.

### `GET /api/reference/risk-factor-types`

The current vocabulary. Populate frontend dropdowns from this rather than
hard-coding a list that will go stale.

Seeded codes: `R_AND_R_PENDING`, `ROW_ISSUE`, `ENCROACHMENT`,
`FOREST_CLEARANCE_PENDING`, `POSSESSION_PENDING`, `ADMINISTRATIVE_DELAY`,
`LANDOWNER_OBJECTION`.

---

## 9. Complete project view

### `GET /api/projects/:projectId/full`

Everything about one project in a single round trip. The six underlying reads
run concurrently — one query per table regardless of how many child rows exist,
never one per row.

```json
{
  "success": true,
  "data": {
    "project": { },
    "land_acquisition": { },
    "compensation": { },
    "legal_issues": [ ],
    "risk_factors": [ ],
    "snapshots": { "count": 3, "latest": { "id": "…", "snapshot_date": "…" } },
    "summary": {
      "open_legal_issues": 2,
      "open_risk_factors": 3,
      "active_court_cases": 1,
      "acquisition_percentage": "91.0000",
      "compensation_pending": "46000000.00"
    }
  }
}
```

Snapshots are **summarised**, not returned in full — a project accumulates one
per prediction point, each with 21 feature columns. Use the snapshot endpoints
for the vectors themselves.

`summary` counts **live** issues only (`OPEN` / `IN_PROGRESS`); a resolved
dispute is history, not current risk.

---

## 10. Feature snapshots

The hand-off from the operational system to the ML system.

A snapshot is a **frozen copy of exactly the feature values a model would be
shown**, taken at an intentional moment. It exists so a prediction made today
remains explainable next year, when the project data has moved on.

### `POST /api/projects/:projectId/snapshots`

No request body — features are derived from current project data. The snapshot
timestamp is the **server clock**; a client-supplied timestamp is ignored,
because backdating would corrupt the temporal integrity of the training set.

```json
{
  "success": true,
  "data": {
    "snapshot": {
      "id": "…", "project_id": "…", "snapshot_date": "2026-09-10T…Z",
      "land_required_ha": "145.5000", "acquisition_percentage": "91.0000",
      "court_cases_count": 1, "litigation_flag": true,
      "notification_delay_days": 42, "award_delay_days": 148
    },
    "data_quality": {
      "issues": [ { "severity": "warning", "field": "compensation", "message": "…" } ],
      "missingFeatures": ["compensation_pending"],
      "sources": { "land_acquisition": true, "compensation": false,
                   "legal_issues": 2, "risk_factors": 3 },
      "completeness": 0.9048,
      "computedAt": "2026-09-10T…Z",
      "persisted": false
    }
  }
}
```

> `data_quality` is **computed and returned, not stored.**
> `project_feature_snapshots` has no provenance column and Phase 3 does not add
> one. Persist the response if you need to keep it.

### The 21 features

| Group | Columns |
|---|---|
| Land | `land_required_ha`, `land_acquired_ha`, `acquisition_percentage` |
| Compensation | `compensation_pending`, `compensation_pending_percentage` |
| Social scale | `affected_landowners`, `affected_families` |
| Legal | `court_cases_count`, `litigation_flag`, `land_dispute_flag`, `title_issue_flag`, `land_record_issue_flag` |
| Risk factors | `r_and_r_required`, `r_and_r_pending`, `row_issue`, `encroachment`, `forest_clearance_pending`, `possession_pending`, `administrative_delay` |
| Elapsed time | `notification_delay_days`, `award_delay_days` |

**How they are derived**

- **Derived numerics are copied, never recomputed.** `acquisition_percentage`
  and both compensation figures are read from the generated columns PostgreSQL
  already calculated. Recomputing in JavaScript would risk float drift and let
  the snapshot disagree with the row it came from.
- **Legal and risk flags count `OPEN` / `IN_PROGRESS` records only.** A
  resolved dispute is history.
- `litigation_flag` is derived *from* `court_cases_count`, so the two cannot
  disagree.
- `r_and_r_required` is true if an R&R factor was ever recorded;
  `r_and_r_pending` only while it is open — so pending always implies required.
- `possession_pending` is true when an award was passed but possession not
  obtained, **or** a `POSSESSION_PENDING` factor is open.
- `award_delay_days` = days from `notification_date` to the award (or to now,
  while outstanding).
- `notification_delay_days` = days from `planned_start_date` to the
  notification. **Null** when the notification predates the planned start —
  which happens in real records — because the measure is not meaningful there
  and a clamp to `0` would assert something the data does not say.

> ### Missing inputs produce `null`, never a substitute
>
> A fabricated `0` is indistinguishable from a genuine measurement of zero and
> would be learned as fact. If compensation was never recorded, both
> compensation features are `null` — "not recorded" is not "nothing
> outstanding".

> ### Leakage boundary
>
> Every feature is observable at the snapshot instant. Snapshots never contain
> `actual_delay_days`, `delay_days_target`, `delay_months_target`, actual
> completion dates, realised cost overruns or any other outcome. Ground truth
> lives in `actual_outcomes` and is joined only at training time.

### Refusal (`422`)

Creation is refused when the data cannot support an honest feature vector:

```json
{
  "success": false,
  "error": "The project data cannot support a feature snapshot. …",
  "details": {
    "issues": [ { "severity": "blocking", "field": "land_acquisition",
                  "message": "No land acquisition record exists…" } ],
    "warnings": [ ]
  }
}
```

**Blocking:** no land record · missing `land_required_ha` / `land_acquired_ha` ·
acquired > required · percentage outside 0–100 · a date in the future.
**Warnings** (returned with a successful snapshot): no compensation record · no
notification date · no planned start date · unrecorded landowner/family counts.

### `GET /api/projects/:projectId/snapshots/preview`

Dry run. Returns the features that *would* be recorded plus `would_succeed`,
and writes nothing. Read access is enough.

### `GET /api/projects/:projectId/snapshots` · `GET …/snapshots/:id`

### Immutability

**There is no `PATCH` and no `DELETE` for snapshots — by design, at every
layer.** No route exists (→ `404`), the service exposes no such method, and the
database grants no UPDATE policy to any non-admin role, has no `updated_at`
column, and restricts deletion of any snapshot a prediction references.

Snapshots are also **never created as a side effect** of editing project data.
Auto-snapshotting on every update would make "which snapshot did this
prediction use" meaningless.

---

## 11. Not implemented in Phase 3

No routes exist for any of the following. They arrive in later phases:

- ML prediction (`predictions`), risk scoring, SHAP explanations
- Rule-based early-warning engine
- Recommendations
- LLM natural-language summaries
- Actual outcomes / feedback loop
- Dashboard aggregation and analytics
