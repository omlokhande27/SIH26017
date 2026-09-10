import { supabase } from '../config/supabase';

/**
 * Database connectivity states.
 *
 * `schema_missing` is separated from `unreachable` on purpose: they have very
 * different causes. The first means the database answered but schema.sql was
 * never applied; the second means it did not answer at all.
 */
export type DatabaseStatus = 'ok' | 'schema_missing' | 'unreachable';

export interface DatabaseHealth {
  status: DatabaseStatus;
  latency_ms: number;
  error?: string;
}

/** Probe budget. Bounds the check so /health cannot hang behind a stalled database. */
const DB_PROBE_TIMEOUT_MS = 2000;

/**
 * Table probed for connectivity. `projects` is a real application table, so a
 * successful probe proves the schema is actually deployed — unlike the earlier
 * undefined-table probe, which could not tell a live database from an empty one.
 *
 * The probe is a normal GET of a single id, capped at one row. It is
 * deliberately NOT a `head: true` request: with head the client discards the
 * response body, so a 404 "table not found" comes back as status 204 with a
 * null error and the check would report a schema-less database as healthy.
 * One id column and one row is cheap enough to poll.
 *
 * Row Level Security is not an obstacle: the anon key sees zero rows under the
 * policies in schema.sql, and zero rows is a successful response. We are
 * testing reachability, not reading data.
 */
const PROBE_TABLE = 'projects';

/** PostgREST/PostgreSQL codes meaning "the relation is not there". */
const UNDEFINED_TABLE_CODES = new Set(['42P01', 'PGRST205']);

export async function checkDatabase(): Promise<DatabaseHealth> {
  const startedAt = Date.now();

  try {
    const { error } = await supabase
      .from(PROBE_TABLE)
      .select('id')
      .limit(1)
      .abortSignal(AbortSignal.timeout(DB_PROBE_TIMEOUT_MS));

    const latency_ms = Date.now() - startedAt;

    if (!error) return { status: 'ok', latency_ms };

    if (UNDEFINED_TABLE_CODES.has(error.code ?? '')) {
      return {
        status: 'schema_missing',
        latency_ms,
        error: `Table "${PROBE_TABLE}" not found — apply database/schema.sql`,
      };
    }

    return { status: 'unreachable', latency_ms, error: error.message };
  } catch (err) {
    // Network failure, DNS failure, or the abort signal firing.
    return {
      status: 'unreachable',
      latency_ms: Date.now() - startedAt,
      error: err instanceof Error ? err.message : 'Unknown database error',
    };
  }
}
