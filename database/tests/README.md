# Database regression tests

Automated checks that `database/schema.sql`, `database/seed.sql` and
`database/migrations/` behave the way `docs/DATABASE.md` says they do.

Every test runs against a **real PostgreSQL engine**, not a mock.

---

## Running them

From `database/`:

```bash
npm install     # first time only
npm test        # run the whole suite
```

No PostgreSQL server, no Docker, no network connection and no Supabase project
are required — see [Why PGlite](#why-pglite) below.

### Individual suites

```bash
npm run test:schema        # schema applies, is idempotent, has the right shape
npm run test:constraints   # generated columns, CHECKs, FKs, triggers
npm run test:leakage       # ML data-leakage defences
npm run test:seed          # demo seed loads, re-loads, and is honestly labelled
npm run test:rls           # row level security policy matrix
```

### While editing

```bash
npm run test:watch         # re-runs affected suites on save
npm run typecheck          # tsc --noEmit over the test sources
```

### Filtering

Standard Vitest flags work:

```bash
npx vitest run -t "FAILED"          # only tests whose name matches
npx vitest run tests/rls.test.ts    # one file
```

---

## Why PGlite

[PGlite](https://pglite.dev) is PostgreSQL itself compiled to WebAssembly: the
same query planner, the same constraint machinery, the same SQLSTATE codes.
Generated columns, CHECK constraints, foreign keys, triggers and row level
security all behave exactly as they do on a Supabase instance.

That matters because almost everything asserted here is enforced *by the
database*. A hand-written mock would happily accept SQL that PostgreSQL
rejects, so a suite built on one would pass while proving nothing. Running the
real engine is what makes a green suite meaningful.

It also installs as an ordinary npm dependency and starts in about a second, so
the suite needs no local PostgreSQL install and runs unchanged in CI.

**Version note:** PGlite currently bundles PostgreSQL 16. Supabase runs 15+.
Nothing in this schema depends on a version-specific feature, but the gap is
worth remembering if you ever add one.

### What the harness adds

`schema.sql` references two things Supabase owns rather than creates:
`auth.users` and `auth.uid()`. `tests/helpers/db.ts` supplies a minimal shim
for both, plus the `authenticated` and `anon` roles and the table GRANTs a
Supabase project issues during setup.

The shim lives in the harness, never in `schema.sql`, so **the file under test
stays byte-for-byte the file you paste into the Supabase SQL Editor.**

`auth.uid()` reads a session setting instead of a JWT claim, which is what lets
the RLS tests switch identity. Same signature, same return type.

---

## Layout

```
tests/
├── README.md            this file
├── helpers/
│   ├── db.ts            PGlite fixtures, the Supabase shim, error assertions
│   ├── identity.ts      test users, SET ROLE wrappers for RLS
│   └── fixtures.ts      minimal valid rows to hang tests off
├── schema.test.ts       application, idempotency, structure, migrations
├── constraints.test.ts  generated columns, CHECKs, FKs, triggers
├── leakage.test.ts      ML data-leakage defences
├── seed.test.ts         demo seed integrity and labelling
└── rls.test.ts          row level security policy matrix
```

---

## What each suite covers

### `schema.test.ts`

- The schema applies to a fresh database.
- **It is idempotent** — applied twice, and a third time, with the same result.
  This is the single most valuable test in the file: `schema.sql` gets pasted
  into the Supabase SQL Editor by hand, and a half-applied run gets pasted
  again. An earlier version of the schema declared the RLS helper functions
  before `public.profiles` existed and failed on first apply; that class of bug
  is what this catches.
- All 14 tables exist, and RLS is enabled on every one of them.
- The three RLS helper functions are `SECURITY DEFINER` with a pinned
  `search_path`. Without `SECURITY DEFINER` the policy on `profiles` re-enters
  itself and recurses until PostgreSQL aborts.
- `updated_at` triggers exist on the six mutable tables and **not** on
  `project_feature_snapshots`.
- The documented indexes exist, including the partial unique index that limits
  the registry to one `ACTIVE` model.
- Every numbered migration applies cleanly on top of the baseline and converges
  to the same state.

### `constraints.test.ts`

- **Generated columns** compute correctly, recompute on update, and return 0
  rather than dividing by zero.
- **Generated columns cannot be spoofed.** An INSERT or UPDATE that supplies
  `land_acquisition_percentage`, `compensation_pending` or
  `compensation_pending_percentage` is rejected by the server. This is the
  whole reason those values are `GENERATED` rather than computed in the Node
  layer: a caller who could write the derived value directly could report 100%
  acquisition on a project that has acquired nothing.
- **`predictions_result_matches_status`** — the rule that
  `SUCCESS` carries a result and `FAILED`/`PENDING` carry NULL, tested from
  both directions and on UPDATE as well as INSERT. The specific thing being
  prevented is a fabricated `0`: zero is a valid, plausible "no delay expected"
  forecast, so a failed inference stored as 0 is indistinguishable from a real
  one and would be absorbed silently by dashboards, averages and training data.
- Domain CHECKs: land not over-acquired, compensation not over-paid, the
  statutory notification → award → possession ordering, date ordering,
  coordinate ranges, `case_reference` only on real court cases.
- Foreign keys, uniqueness, `ON DELETE CASCADE` and the `ON DELETE RESTRICT`
  that stops a snapshot being deleted out from under a prediction.
- `updated_at` triggers fire, override a client-supplied value, and leave
  unrelated rows alone.
- Prediction explanations: unique rank, unique feature, positive rank, signed
  contribution scores.

### `leakage.test.ts`

The defences against training a model on its own answer. Leakage is silent —
nothing crashes, the metrics just look great and the model is worthless — so
the schema fights it structurally and these tests check the structure holds.

- **Physical separation.** The target lives in `actual_outcomes` and appears
  nowhere on `project_feature_snapshots`, so a training query must perform an
  explicit JOIN to reach it and cannot pull it in via `SELECT *`.
- **An automated column audit.** The snapshot table is scanned for
  outcome-shaped column names (`actual_*`, `*_target`, `outcome*`,
  `*completion_date`, `*overrun`, `*_label`). If someone later adds
  `delay_days_target` for convenience, this fails on the next run instead of six
  months later in production. The audit is also checked *not* to be so broad
  that it forbids the legitimate elapsed-time features.
- **A temporal guard.** An outcome cannot be dated before the snapshot it
  labels, on INSERT or UPDATE, and each snapshot may carry only one label.
- **Cross-project protection.** The composite FK makes attaching project A's
  prediction to project B's snapshot unrepresentable, not merely discouraged —
  enforced on UPDATE too.
- **Snapshot immutability** (structural half): no `updated_at` column, no
  triggers, and no UPDATE policy for any role.

### `seed.test.ts`

- The seed loads, and **re-running it does not duplicate rows**.
- Every relationship in the chain is populated.
- **Every seeded row is unmistakably fictional**: `[DEMO]` project names,
  `DEMO-` codes, `[DEMO]` agencies and `[DEMO]` case references. This is
  asserted rather than trusted, because the naming convention is the only thing
  stopping a screenshot of the dashboard being mistaken for real land
  acquisition figures.
- **No fabricated model results.** Every evaluation metric is still NULL, the
  placeholder model is named `untrained`, and every seeded prediction traces
  back to it — so a demo number can never be passed off as genuine inference.
- Generated columns are derived rather than seeded; predictions match their own
  project's snapshot; the demo outcome post-dates its snapshot.

### `rls.test.ts`

The full policy matrix, exercised as each role.

| Role | Projects & child data | Analytics | Snapshots & outcomes | Profiles |
|---|---|---|---|---|
| ADMIN | full | full | full | full |
| ANALYST | read all | read all | read all | own |
| OFFICER | read + update **assigned only** | read assigned; update recommendations on assigned | read assigned; insert; **no update** | own |
| VIEWER | read all | read all | read all | own |
| *unauthenticated* | none | none | none | none |

Also covered: privilege escalation is blocked from every angle — no role
self-promotion (rejected by the policy's `WITH CHECK`, which raises `42501`,
not a CHECK violation), no editing another user's role, no self-assignment to
a project, no non-admin writes to the risk-factor vocabulary or the model
registry, and no OFFICER edits to the snapshot/prediction audit trail.

> **The `SET ROLE` detail matters more than it looks.** PGlite connects as a
> superuser, and PostgreSQL exempts superusers and table owners from RLS
> entirely. A policy test that forgot to switch role would pass
> unconditionally while proving nothing. Every assertion therefore runs through
> `actingAs` / `actingAsAnon` in `helpers/identity.ts`.

> **VIEWER/ANALYST national read scope** is asserted as the current *intended*
> prototype behaviour, documented in `schema.sql` §19 and `docs/DATABASE.md`
> §9. If it is later narrowed to state or department, these are the tests that
> must change — which is exactly the signal you want.

---

## Conventions

**Assert on SQLSTATE, not on message text.** Error codes are stable across
PostgreSQL versions and locales; messages are not. `SQLSTATE` in
`helpers/db.ts` names the codes used. Where a specific constraint is the point
of the test, assert on `err.constraint` too.

**Negative tests go through `expectSqlError`.** It throws if the statement
unexpectedly *succeeds*, so a guard that stops working fails loudly rather than
passing quietly. A bare `try/catch` cannot tell those two apart.

**Never assert that one wall-clock reading is later than another.** `NOW()`
returns the transaction timestamp and PGlite's clock has millisecond
resolution, so two fast statements can share a tick. The `updated_at` tests
backdate the row first (with the trigger temporarily disabled) and then assert
the trigger moved it forward — deterministic, and a stricter test of the
trigger besides.

**Each file builds its own database.** No shared state, so files run in
parallel and a failure in one cannot cascade.

---

## Adding a test

1. Pick the suite by what the test is *about*, not by which table it touches.
2. Use `helpers/fixtures.ts` for parent rows — insert the smallest legal row,
   so a constraint test fails because of the constraint being probed and not
   because an unrelated column was left empty.
3. For anything RLS-related, wrap it in `actingAs`.
4. Say *why* the rule exists in a comment. The rule itself is visible in the
   assertion; the reason it is worth enforcing is not.

## What this suite does not cover

- **Real Supabase Auth JWTs.** `auth.uid()` is shimmed. The policy logic is
  exercised; the JWT plumbing is not.
- **The backend authorization layer.** The Node backend connects with the
  service role key and **bypasses RLS entirely**, so nothing here constrains
  API traffic. See `docs/DATABASE.md` §9, "RLS is not sufficient on its own".
- **Performance.** Indexes are asserted to exist, not to be used or to help.
