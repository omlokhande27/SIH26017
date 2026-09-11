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

Profiles are provisioned by a database trigger (`on_auth_user_created`,
migration 0003) with role `VIEWER` as a **hard-coded literal**. It is not read
from signup metadata, which is client-supplied and user-rewritable — sourcing
it there would make signup a self-service route to ADMIN.

#### Request pipeline (Phase 3)

Every `/api` route runs the same chain, and the order is load-bearing:

```
requireAuth  ->  requireProjectAccess  ->  validate(zod)  ->  controller  ->  service
```

Authentication first, because the guard needs a caller. **Authorization before
validation**, so an unauthorised request is refused without the API first
reporting whether its payload was well-formed — validating first would turn
error messages into an oracle about a project the caller cannot access.

Collection endpoints (`GET /api/projects`) have no project id for the guard to
check, so read scoping is applied inside the service. That is not optional
belt-and-braces: the backend holds the service-role key and bypasses RLS, so a
forgotten filter there would leak every project in the country through a route
that looks harmless.

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

### Supabase configuration (verified 2026-09-11)

Determined against the live project by `npm run audit:supabase`, not assumed:

| Property | Value |
|---|---|
| API key generation | **new format** (`sb_publishable_…` / `sb_secret_…`) |
| JWT signing | **ES256, asymmetric, via JWKS** |
| JWKS endpoint | `<SUPABASE_URL>/auth/v1/.well-known/jwks.json` |
| Issuer | `<SUPABASE_URL>/auth/v1` |
| `SUPABASE_JWT_MODE` | pinned to `jwks` |

Both key generations are accepted (`SUPABASE_PUBLISHABLE_KEY` falling back to
`SUPABASE_ANON_KEY`, `SUPABASE_SECRET_KEY` to `SUPABASE_SERVICE_ROLE_KEY`), so
a project can migrate without a coordinated deploy. The key **format** and the
**variable name** are independent — this project holds new-format keys under
the legacy variable names, which works and is reported accurately by the audit.

Migrating key formats changes nothing about trust: publishable/anon still
respects RLS, secret/service-role still bypasses it.

#### Why the mode is pinned rather than auto-detected

`auto` probes the JWKS endpoint and, historically, treated any failure as "no
JWKS" and fell back to HS256. That is a downgrade attack waiting to happen: a
transient outage would move verification onto `JWT_SECRET`, and a weak or
placeholder secret is then forgeable.

The verifier now distinguishes three outcomes — keys published, definitively
absent (200-with-no-keys, or 404), and **indeterminate** — and fails closed on
the third rather than downgrading. Pinning `SUPABASE_JWT_MODE=jwks` removes the
question entirely.

Algorithms are pinned per mode (`HS256` alone, or `ES256`/`RS256` alone) and
the two modes never share key material, which forecloses algorithm confusion:
a JWKS public key is never a candidate HMAC secret.

### Live database verification (Phase 2.3, 2026-09-11)

`npm run verify:live` (`backend/scripts/verify-live-db.ts`) verifies the
deployed schema against the real project: **52 checks, 0 failures**.

Everything is verified **behaviourally**, not by catalog introspection.
PostgREST exposes only the `public` schema, so `pg_policies`, `pg_trigger` and
`pg_indexes` are unreachable — which is a better constraint than it sounds. A
row in `pg_policies` proves a policy was created, not that it does anything; a
VIEWER being denied an UPDATE proves the policy works.

| Group | Verified |
|---|---|
| Structure | 14 tables, 3 RLS helper functions callable and non-recursive |
| Generated columns | computed, recomputed on input change, unspoofable (428C9) even with the secret key |
| Constraints | 7 violations rejected — CHECK, FK, UNIQUE, composite FK, prediction status/result rule |
| Triggers | `updated_at` fires; `on_auth_user_created` provisions VIEWER |
| RLS | anonymous sees nothing; role matrix enforced; OFFICER scoped to assignments |
| Escalation | self-promotion, cross-user role edits and vocabulary writes all refused |

> **RLS evidence comes only from publishable-key clients** carrying real ES256
> sessions. The service-role client bypasses RLS by design and is used solely
> to seed and tear down fixtures — never as proof that a policy works.

Two things this verification does **not** cover, stated rather than implied:

- **Indexes.** Not listable through PostgREST. They are verified against real
  PostgreSQL in `database/tests/schema.test.ts`; confirm on the live project
  with `SELECT indexname FROM pg_indexes WHERE schemaname='public';`
- **NUMERIC serialisation.** Reported on every run rather than asserted — see
  `docs/DATABASE.md` §5.

#### A trap worth remembering

The first run reported an RLS leak: an "anonymous" client could read projects.
It was the test that was wrong. `supabase-js` keeps a session on the client
instance even with `persistSession: false`, and the same client object had been
used to sign test users in. The tell was that "anonymous" saw exactly **one**
profile row — which is what a VIEWER sees, not an anonymous caller.

The script now proves the client is unauthenticated (`current_app_role()` is
NULL) *before* drawing any conclusion from what it can see, and refuses to run
the anonymous assertions otherwise. A test that fails in the direction of
"looks like a security hole" is the worst way to be wrong.

### Live API verification (Phase 3, 2026-09-11)

`npm run test:live` (`backend/tests/live/api.live.test.ts`) exercises all 27
endpoints against the real project over real HTTP with real ES256 sessions:
**61 tests, 0 failures**. It is excluded from `npm test` and refuses to run
without `LIVE_E2E=1`; every fixture is removed in `afterAll`.

#### Why these assertions carry the weight

Every service queries through `supabaseAdmin`, which **bypasses RLS**. For API
traffic the policies verified in Phase 2.3 are therefore *not* what protects
these routes — `requireProjectAccess` is, and a gap there has no backstop.
That is what the live role matrix actually tests.

The service-role client is used deliberately and in exactly three places:

| Use | Why privileged access is required |
|---|---|
| `profile.service.ts` | Resolves the caller's role before any authorization decision exists. Using the anon client would need the caller's token, creating a chicken-and-egg with the policy that decides whether they may read their own profile. |
| `authorization.service.ts` | Answers "may this user reach this project?" — it must see assignments the caller cannot. |
| Business services | The backend *is* the authorization layer for API traffic; RLS protects the direct-from-client path instead. |

`health.service.ts` is the one service that uses the RLS-respecting client.

#### A real bug the mocked suite could not find

`GET /api/projects/not-a-uuid` returned **503**. A non-UUID compared against a
`uuid` column raises SQLSTATE `22P02`, which `translateDbError` had no case for,
so it fell through to "database unavailable". Wrong twice: it tells operators
there is an outage when there is not, and invites the client to retry a request
that can never succeed. The in-memory fake returned `null` for unknown ids, so
no unit test could reach the code path.

Fixed at two layers — `requireProjectAccess` rejects a malformed id with 400
before any query, and `translateDbError` maps `22P02` / `22007` / `22003` to 400
as defence in depth — with regression tests added to the mocked suite.

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
├── backend/         Node.js + Express + TypeScript API   [Phase 3 — done]
│   ├── src/
│   │   ├── config/      env, Supabase clients, role definitions
│   │   ├── controllers/ thin request/response handlers
│   │   ├── middleware/  auth, authorization, validation, errors
│   │   ├── routes/      route definitions
│   │   ├── services/    business logic and persistence
│   │   └── validators/  Zod schemas
│   └── tests/       275 tests (vitest + supertest)
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
| 3 | Business APIs — projects, land, compensation, issues, risk factors, feature snapshots | done |
| 4 | ML service + prediction orchestration | not started |
| 5 | Frontend dashboard | not started |
