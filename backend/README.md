# LandGuard AI — Backend

Express + TypeScript backend for the **Predictive Analytics System for Early Detection of Land Acquisition Delays**.

Product flow: **PREDICT → EXPLAIN → PRIORITIZE → ACT**

> Status: foundation only. Database schema and business APIs are not implemented yet.

## Stack

Node.js · Express 4 · TypeScript 5 · Supabase (PostgreSQL) · Zod · Axios · JWT

## Setup

```bash
cd backend
npm install
cp .env.example .env    # then fill in real values
npm run dev
```

The server refuses to start if any required environment variable is missing or
malformed — it prints the offending fields and exits with code 1.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Dev server with hot reload (ts-node-dev) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the compiled production build |
| `npm run type-check` | Type check without emitting files |

## Environment Variables

All credentials come from the environment; nothing is hardcoded. See `.env.example`.

| Variable | Required | Default | Notes |
|---|---|---|---|
| `PORT` | no | `5000` | On macOS, port 5000 may be taken by AirPlay Receiver |
| `NODE_ENV` | no | `development` | `development` \| `production` \| `test` |
| `SUPABASE_URL` | **yes** | — | Must be a valid URL |
| `SUPABASE_ANON_KEY` | **yes** | — | Public client, respects RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | **yes** | — | Bypasses RLS — server-side only, never expose |
| `JWT_SECRET` | **yes** | — | Supabase JWT secret, used to verify tokens |
| `ML_SERVICE_URL` | no | `http://localhost:8000` | FastAPI ML service |
| `ALLOWED_ORIGINS` | no | localhost 3000/5173 | Comma-separated CORS allowlist |

`.env` is gitignored. Never commit real credentials.

## Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | none | Liveness + database connectivity |

### Health check behaviour

`/health` returns **200 whenever the process is serving**. Database state is
reported in the body, not in the HTTP status:

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

`services.database.status`:

| Value | Meaning |
|---|---|
| `ok` | Supabase answered the probe |
| `schema_missing` | Database answered, but `database/schema.sql` has not been applied |
| `unreachable` | No response, or the 2s probe budget expired (`error` explains) |

Liveness is independent of database health on purpose: restarting the API
because Postgres blipped turns a database incident into an API outage, and a
health endpoint that goes dark is useless when you most need it. **Judge the
database by `services.database.status`, not the HTTP code.**

The probe reads one column of one row from `projects` under a 2s timeout, so the
endpoint cannot hang. It is implemented in `src/services/health.service.ts`.

> `schema_missing` on a fresh project is expected until you apply
> `database/schema.sql` — see [`../docs/DATABASE.md`](../docs/DATABASE.md).

## Database

Schema, seed data and migration conventions live in [`../database/`](../database).
Design rationale — derived fields, money precision, feature snapshots, data
leakage prevention, RLS — is documented in
[`../docs/DATABASE.md`](../docs/DATABASE.md).
