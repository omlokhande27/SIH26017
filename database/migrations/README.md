# Migrations

## Convention

`database/schema.sql` is the **canonical baseline**. It is the complete, current
schema and the file you run on a fresh Supabase project. It is deliberately not
duplicated here — one authoritative copy avoids the two drifting apart.

Every change *after* the baseline gets a new numbered file in this directory:

```
0002_add_something.sql
0003_alter_something_else.sql
```

## Rules

1. **Never edit an applied migration.** Once a migration has run on any shared
   environment, it is immutable. Fix it with a new migration.
2. **Number sequentially,** zero-padded to four digits, with a descriptive
   snake_case suffix.
3. **Make migrations idempotent** where practical (`IF NOT EXISTS`,
   `DROP ... IF EXISTS`) so a partial failure can be retried.
4. **Wrap multi-statement migrations in a transaction** (`BEGIN; ... COMMIT;`)
   so a failure rolls back cleanly. Note that some statements — `CREATE INDEX
   CONCURRENTLY`, `ALTER TYPE ... ADD VALUE` on older PostgreSQL — cannot run
   inside a transaction block.
5. **Keep `schema.sql` in step.** When you add a migration, apply the same
   change to `schema.sql` so a fresh install and a migrated install end up
   identical.
6. **Adding a risk factor type is not a migration.** `risk_factor_types` is a
   reference table; insert a row instead.

## Applying

Supabase SQL Editor: paste and run the migration file.

Supabase CLI:

```bash
supabase db push
```

psql:

```bash
psql "$DATABASE_URL" -f database/migrations/0002_add_something.sql
```

## Baseline

| # | File | Description |
|---|---|---|
| 0001 | `../schema.sql` | Initial schema: 14 tables, RLS policies, indexes, triggers |
| 0002 | `0002_prediction_result_matches_status.sql` | `predictions`: result columns nullable, `predictions_result_matches_status` CHECK ties them to `prediction_status` |
| 0003 | `0003_auto_provision_profiles.sql` | `on_auth_user_created` trigger provisions a VIEWER profile for every new auth user; backfills existing users |
| 0004 | `0004_prediction_assessment_fields.sql` | Combined-assessment fields on `predictions`; `explanation_source` on `prediction_explanations`; `source_rule_id` on `recommendations` |

A fresh install runs `schema.sql` alone and already includes every migration
listed above; the numbered files exist for databases created before the change.
