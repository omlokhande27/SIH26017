# System Architecture — LandGuard AI

Predictive Analytics System for Early Detection of Land Acquisition Delays.

Product flow: **PREDICT → EXPLAIN → PRIORITIZE → ACT**

---

## 1. Component overview

```
   ┌──────────────────────────────────────────────────────────────┐
   │  FRONTEND  (React + TypeScript)                              │
   │  Dashboards, project views, risk queue, recommendations      │
   │                                                              │
   │  Holds: Supabase ANON key + the user's JWT                   │
   │  NEVER holds: the service-role key                           │
   └───────────────────────────┬──────────────────────────────────┘
                               │  HTTPS / REST + Bearer JWT
                               ▼
   ┌──────────────────────────────────────────────────────────────┐
   │  NODE.JS EXPRESS BACKEND  (TypeScript)                       │
   │                                                              │
   │  • Verifies the JWT, resolves role from profiles             │
   │  • Enforces authorization (RLS is bypassed here — see §4)    │
   │  • Validates every request body with Zod                     │
   │  • Builds feature snapshots                                  │
   │  • Orchestrates the ML call and persists the results         │
   │                                                              │
   │  Holds: SUPABASE_SERVICE_ROLE_KEY (server-side only)         │
   └──────────┬───────────────────────────────────┬───────────────┘
              │                                   │
              │ @supabase/supabase-js             │ Axios (HTTP, internal)
              ▼                                   ▼
   ┌────────────────────────────┐   ┌──────────────────────────────┐
   │  SUPABASE POSTGRESQL       │   │  PYTHON FASTAPI ML SERVICE   │
   │                            │   │                              │
   │  • Application data        │   │  • Loads the trained model   │
   │  • Historical snapshots    │   │  • Predicts delay days       │
   │  • Predictions + outcomes  │   │  • Produces explanations     │
   │  • RLS policies            │   │  • STATELESS — owns no data  │
   │  • Supabase Auth           │   │                              │
   └────────────────────────────┘   └──────────────────────────────┘
```

---

## 2. Responsibilities

### Frontend (React + TypeScript)
Renders dashboards and collects officer input. Talks only to the Express
backend for business operations, and to Supabase Auth for login.

**It never receives the service-role key.** That key bypasses every Row Level
Security policy; shipping it to a browser would hand any visitor full read/write
access to every project in the database. It lives only in the backend's
environment. The frontend gets the anon key, which is safe to expose precisely
because RLS constrains it.

### Node.js Express backend
The orchestrator and the only component that talks to both the database and the
ML service. It:

1. Verifies the Supabase JWT and resolves the caller's role from `profiles`
   server-side — never from the request body.
2. Enforces authorization: role checks, and project-assignment checks for
   OFFICER writes.
3. Validates every request body, query and param with Zod before it reaches a
   service.
4. Assembles a **feature snapshot** from current project data and persists it.
5. Calls the ML service with that snapshot, then stores the prediction,
   explanations and recommendations against it.
6. Never returns service-role credentials, raw SQL errors, or internal stack
   traces to a client.

### Supabase PostgreSQL
Stores application and historical data, and enforces its own invariants:
derived values are generated columns, vocabularies are CHECK constraints, and
cross-table relationships are composite foreign keys. RLS policies protect the
direct-from-client path. Supabase Auth owns `auth.users`; `profiles` extends it
with application role.

The invariants live in the database rather than in the API on purpose: a rule
enforced only in the Node layer holds for exactly one caller, while a CHECK
constraint also holds for direct SQL, admin edits in the Supabase dashboard,
and the ML service when it starts writing predictions in Phase 4.

One such invariant shapes the prediction contract: `predictions` stores
`predicted_delay_days` and `risk_level` **only** when
`prediction_status = 'SUCCESS'`, and NULL when the inference is PENDING or
FAILED. A failed inference has no result, and storing a placeholder `0` would
be indistinguishable from a genuine "no delay expected" forecast. Consumers must
handle the null case.

The schema, seed and migrations are covered by an automated regression suite
(`database/tests/`, 157 tests) that runs against a real PostgreSQL engine
locally with no server required.

Full detail: [`DATABASE.md`](./DATABASE.md).

### Python FastAPI ML service
Loads the trained model and returns a predicted delay plus per-feature
attributions. It is **stateless and owns no data**: it receives a feature vector
and returns numbers. It has no database credentials and never writes to
Postgres — the backend persists everything.

Keeping it stateless means the model can be retrained, redeployed or rolled back
without touching application data, and a failure there degrades prediction only,
not the rest of the system.

---

## 3. The prediction flow

```
  Officer requests a prediction
            │
            ▼
  1. Backend authorizes the caller (role + project assignment)
            │
            ▼
  2. Backend reads live project data
     projects + land_acquisition + compensation + legal_issues + risk_factors
            │
            ▼
  3. Backend writes a project_feature_snapshots row
     ── the feature vector is now FROZEN and immutable ──
            │
            ▼
  4. Backend POSTs that snapshot to the FastAPI ML service (Axios)
            │
            ▼
  5. ML service returns predicted_delay_days + per-feature contributions
            │
            ▼
  6. Backend persists:
       predictions             (referencing the snapshot + model_version)
       prediction_explanations (ranked contributions)
       recommendations         (derived from the top drivers)
            │
            ▼
  7. Frontend renders prediction, explanation and the action queue
            │
            ▼
  8. Later — the real outcome is recorded in actual_outcomes,
     joined to the snapshot only at training time
```

Step 3 is what makes step 7 defensible months later: the prediction is tied to
the exact inputs the model saw, not to project data that has since moved on.

**When step 5 fails** — the ML service is down, times out, or returns an error
— step 6 still writes a `predictions` row, with `prediction_status = 'FAILED'`
and `predicted_delay_days` / `risk_level` left NULL. The attempt is recorded
against its snapshot, so the failure is visible and countable, but no number is
invented. The schema enforces this: a FAILED row carrying a value is rejected
outright (DATABASE.md §4a).

The snapshot from step 3 is kept in that case. It is a valid record of the
project's state at that moment and can be re-scored once the ML service
recovers, without re-reading project data that may have changed in the interim.

Step 7 must therefore render three states, not one: a prediction, "prediction
in progress", and "prediction unavailable". A UI that assumes a number is
always present will display a failed inference as a healthy project.

---

## 4. Security model

### Two enforcement layers

| Layer | Protects | Limitation |
|---|---|---|
| **Row Level Security** (Postgres) | Direct client → PostgREST access using the anon key | **Bypassed entirely by the service-role key** |
| **Backend authorization** (Express) | All API traffic | Only applies to requests that go through the API |

Because the backend uses the service-role key, **RLS does not constrain backend
queries**. Backend authorization is therefore mandatory, not optional. RLS is
the backstop that still holds if an API handler forgets a check, and the primary
control for anything the frontend reads directly from Supabase.

#### The backend authorization layer (Phase 2.2)

Three modules, so no controller re-derives a policy decision:

| Module | Responsibility |
|---|---|
| `middleware/auth.middleware.ts` | `requireAuth` — verify the JWT, then resolve the role from `profiles` |
| `middleware/authorize.middleware.ts` | `requireRole`, `requireProjectAccess` / `requireProjectRead` / `requireProjectWrite` |
| `services/authorization.service.ts` | `canAccessProject`, `isAssignedToProject` — mirrors `is_assigned_to_project()` in the schema |

`config/roles.ts` holds the four role constants and the capability sets, so the
policy is stated once and the uppercase/lowercase mismatch that previously
existed cannot recur.

> **Identity and role come from different sources, deliberately.** The JWT
> proves *who* the caller is; `public.profiles` decides *what they may do*. The
> role is never read from the token. Supabase's `user_metadata` is writable by
> the user — `supabase.auth.updateUser({ data: { role: 'ADMIN' } })` yields a
> genuine, correctly-signed token carrying an attacker-chosen claim. Verifying
> the signature does not make the claim inside it true.

Two failure modes are handled explicitly rather than defaulted:

- **No profile row** → `403`, never a fallback to VIEWER. Under the prototype
  visibility policy VIEWER reads every project nationally, so "default to the
  least role" would grant national read access to any valid token holder.
- **Lookup failure** → `503`, not `403`. A database outage is not an
  authorization decision, and reporting it as one misleads whoever debugs it.

Neither layer is sufficient alone. See DATABASE.md §9 for the policy matrix and
the pre-production checklist.

### Role visibility policy (SIH prototype)

| Role | Scope |
|---|---|
| **ADMIN** | Full access to all projects, plus system management (profiles, roles, model registry, reference data). |
| **ANALYST** | Read access to all projects; access to analytics and predictions. No writes. |
| **OFFICER** | Assigned projects only. May modify authorised project information on those projects; cannot create or delete projects, or alter the prediction audit trail. |
| **VIEWER** | Read-only. National visibility **temporarily allowed for this prototype**, because the state/department/project visibility scope is not yet defined. |

The VIEWER/ANALYST national read scope is a **documented prototype decision**,
not an oversight: the brief does not define what bounds "allowed project
visibility", and guessing a boundary would hard-code it into the security
model. It widens read access for two roles that are already read-only and
weakens no write protection anywhere — OFFICER writes stay confined to assigned
projects, role self-promotion stays blocked, and the snapshot/prediction audit
trail stays immutable.

It is replaceable without structural change: every affected policy is a SELECT
policy, and `profiles.state` / `profiles.department` already exist to carry the
boundary. DATABASE.md §9 records the full rationale and blast radius.

### Credential boundaries

| Secret | Frontend | Backend | ML service |
|---|---|---|---|
| `SUPABASE_ANON_KEY` | yes | yes | no |
| `SUPABASE_SERVICE_ROLE_KEY` | **never** | yes | no |
| `JWT_SECRET` | **never** | yes | no |
| Database connection | no | via Supabase client | **no** |

All values come from environment variables. Nothing is hardcoded, and `.env` is
gitignored.

---

## 5. Monorepo layout

```
landguard-ai/
├── frontend/        React + TypeScript dashboard
├── backend/         Node.js + Express + TypeScript API   [Phase 1 — done]
│   └── tests/       auth / authorization / env (84 tests)
├── ml-service/      Python FastAPI prediction service
├── database/        schema.sql, seed.sql, migrations/    [Phase 2 — done]
│   ├── schema.sql
│   ├── seed.sql
│   ├── migrations/
│   └── tests/       PGlite regression suite (npm test)
├── docs/
│   ├── ARCHITECTURE.md
│   └── DATABASE.md
└── README.md
```

---

## 6. Health and observability

`GET /health` on the backend returns **200 whenever the process is serving**,
with database state reported in the body rather than in the HTTP status.

```json
{
  "status": "ok",
  "timestamp": "2026-09-09T10:30:00.000Z",
  "environment": "development",
  "uptime": 12.4,
  "services": {
    "database": { "status": "ok", "latency_ms": 28 }
  }
}
```

`services.database.status` is one of:

| Value | Meaning |
|---|---|
| `ok` | Supabase answered the probe |
| `schema_missing` | Database answered, but `database/schema.sql` has not been applied |
| `unreachable` | No response, or the 2s probe budget expired |

**Liveness is deliberately independent of database health.** An orchestrator
that restarts the API because Postgres blipped turns a database incident into an
API outage too, and a health endpoint that goes dark is useless at exactly the
moment you need it. Judge the database by the body field, not the status code.

The probe is a single-row, single-column read of `projects` bounded by a 2s
timeout, so the endpoint cannot hang behind a stalled database. It intentionally
avoids a `head: true` request: with head, the client discards the response body
and a "table not found" error is indistinguishable from success.

---

## 7. Build phases

| Phase | Scope | Status |
|---|---|---|
| 1 | Backend foundation — TypeScript, Express, config, middleware, `/health` | done |
| 2 | Database schema, RLS, seed data, regression suite, docs, health-check upgrade | done |
| 2.2 | Git at project root, JWT/role authorization fix, reusable guards, env hardening, backend tests | done |
| 3 | Business APIs — projects, land, compensation, issues, risk factors | not started |
| 4 | ML service + prediction orchestration | not started |
| 5 | Frontend dashboard | not started |
