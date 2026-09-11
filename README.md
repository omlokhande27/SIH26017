# LandGuard AI

**Predictive Analytics System for Early Detection of Land Acquisition Delays**

A decision-support system for infrastructure projects in India. It tracks land
acquisition progress, compensation, legal disputes and operational risk
factors, and turns that record into early warnings about projects likely to
slip.

---

## Where the project stands

| Phase | Scope | Status |
|---|---|---|
| 1 | Backend foundation — TypeScript, Express, config, middleware, `/health` | ✅ done |
| 2 | Database schema, RLS, seed data, regression suite | ✅ done |
| 2.2 | Version control, authorization fix, reusable guards, env hardening | ✅ done |
| 2.3 | Live schema, RLS and auth verification against the real Supabase project | ✅ done |
| 3 | Business APIs — projects, land, compensation, issues, risk factors, snapshots | ✅ done |
| 3.1 | All 27 endpoints verified end-to-end against the live database | ✅ done |
| 4 | FastAPI ML service — rule engine, baseline-first training | ✅ done |
| 5 | Prediction orchestration, persistence, assessment APIs | ✅ done |
| 6 | Dashboard, analytics, comparison, optional AI summaries | ✅ done |

**Test coverage today: 444 backend (mocked) + 179 database (PGlite) + 97 Python
+ 61 live Supabase E2E + 15 live prediction E2E + 12 live ML integration + 64
live database checks — all passing.** Phase 6's own live suite (13 tests) is
written and gated, pending migration 0005 on the live project.

**39 endpoints.**

The three layers prove different things and are never conflated: the mocked and
PGlite suites prove logic, and only the live suites prove the real project
works.

---

## Layout

```
landguard-ai/
├── backend/          Node.js + Express + TypeScript API
│   ├── src/
│   │   ├── config/          env validation, Supabase clients, roles
│   │   ├── controllers/     thin request/response handlers
│   │   ├── middleware/      auth, authorization, validation, errors
│   │   ├── routes/          route definitions
│   │   ├── services/        business logic and persistence
│   │   ├── validators/      Zod schemas
│   │   └── utils/           responses, error mapping
│   └── tests/
│       ├── *.test.ts        334 mocked tests (vitest + supertest)
│       └── live/            61 live E2E tests — real Supabase, LIVE_E2E=1 only
│
├── database/         PostgreSQL schema, seed, migrations
│   ├── schema.sql           canonical baseline — 14 tables, 42 RLS policies
│   ├── seed.sql             fictional [DEMO] data
│   ├── migrations/          numbered changes after the baseline
│   └── tests/               179 tests against real PostgreSQL (PGlite)
│
└── docs/
    ├── ARCHITECTURE.md      components, security model, prediction flow
    ├── DATABASE.md          schema design, leakage prevention, RLS
    └── API.md               endpoint reference
```

```
ml-service/          FastAPI — rule engine (primary) + experimental ML
├── app/
│   ├── services/    rule_engine, feature_mapper, recommendations, explanation
│   ├── models/      train, predict, model_loader
│   ├── schemas/     request/response contracts (the leakage boundary)
│   └── api/         routes
├── scripts/         audit_dataset.py
├── data/            datasets with provenance (see data/README.md)
└── tests/           97 tests
```

---

## Getting started

### 1. Database

Create a Supabase project, then run `database/schema.sql` in the SQL Editor. It
is idempotent — re-running is safe.

```bash
psql "$DATABASE_URL" -f database/schema.sql
psql "$DATABASE_URL" -f database/seed.sql   # optional demo data
```

> `seed.sql` inserts fictional `[DEMO]`-prefixed rows. Never run it against a
> production database.

### 2. Backend

```bash
cd backend
npm install
cp .env.example .env     # then fill in real values
npm run dev              # http://localhost:5000
```

| Script | Purpose |
|---|---|
| `npm run dev` | Development server with reload |
| `npm run build` | Compile to `dist/` |
| `npm start` | Run the compiled server |
| `npm test` | Mocked suite — fast, no network, no real data |
| `npm run type-check` | Type-check source and tests |
| `npm run audit:supabase` | Live connection + auth audit against the real project |
| `npm run verify:live` | Live schema, constraint, trigger and RLS verification |
| `npm run test:live` | **Writes to the real database.** All 27 endpoints end-to-end |

> The live scripts act on the real Supabase project. `test:live` refuses to run
> without `LIVE_E2E=1` and removes every fixture it creates.

### 3. Verify

```bash
curl http://localhost:5000/health
```

`services.database.status` reports `ok`, `schema_missing` or `unreachable`.
Liveness is deliberately independent of database health — see
`docs/ARCHITECTURE.md` §6.

### Database tests

```bash
cd database && npm install && npm test
```

These run against a real PostgreSQL engine (PGlite, in-process). No server,
Docker or network required.

---

## Principles this codebase holds to

**The database enforces its own invariants.** Derived values are generated
columns, vocabularies are CHECK constraints or lookup tables, and cross-table
relationships are composite foreign keys. A rule enforced only in the API holds
for exactly one caller; a CHECK constraint holds for direct SQL, admin edits
and every future service.

**Authorization is resolved server-side.** The JWT proves who the caller is;
`public.profiles` decides what they may do. The role is never read from the
token — Supabase `user_metadata` is user-writable, so a correctly-signed token
can carry any role its holder chose.

**Nothing is invented to fill a gap.** A failed prediction stores `NULL`, not
`0`. A missing feature is `null`, not a substitute. A snapshot is refused
rather than assembled from guesses. A fabricated zero is indistinguishable from
a real measurement and gets learned as fact.

**Categories are never mixed.** Verified project data, imputed values, demo
data, rule-based warnings, ML estimates and actual outcomes are distinct things
and are labelled as such.

**The ML claim matches the evidence.** No trained model beat a median baseline
on this dataset — 130 rows, 22 distinct feature vectors, 83% of them identical,
every R² negative. So the rule engine is the primary signal and the delay figure
ships labelled `BASELINE_MEDIAN` with `confidence: LOW` and a note saying it is
not a model prediction. See [`ml-service/README.md`](ml-service/README.md).

---

## Documentation

| Document | Contents |
|---|---|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Components, responsibilities, prediction flow, security model |
| [`docs/DATABASE.md`](docs/DATABASE.md) | Schema design, derived fields, leakage prevention, RLS policy |
| [`docs/API.md`](docs/API.md) | Endpoint reference, auth, roles, snapshot workflow |
| [`database/tests/README.md`](database/tests/README.md) | What the database suite covers and how to run it |
