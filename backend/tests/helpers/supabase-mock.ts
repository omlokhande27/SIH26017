/**
 * A minimal in-memory stand-in for the Supabase client.
 *
 * The authorization layer only ever uses one query shape:
 *
 *     from(table).select(cols).eq(col, val)[.eq(col, val)].maybeSingle()
 *
 * so that is exactly what this reproduces — no more. A broader fake would
 * invite tests that pass against behaviour the real client does not have.
 *
 * What this deliberately does NOT simulate is Row Level Security, because the
 * code under test uses `supabaseAdmin`, which bypasses RLS on a real Supabase
 * project too. RLS itself is covered against a real PostgreSQL engine in
 * database/tests/rls.test.ts. These tests cover the *backend* authorization
 * layer, which is the one that actually runs for API traffic.
 */

export type Row = Record<string, unknown>;

interface QueryResult {
  data: Row | null;
  error: { message: string } | null;
}

export class SupabaseMock {
  private tables = new Map<string, Row[]>();
  private tableErrors = new Map<string, string>();

  /** Replace the contents of a table. */
  setTable(name: string, rows: Row[]): void {
    this.tables.set(name, rows);
  }

  /** Make every query against `name` fail, to exercise the lookup-failure path. */
  failTable(name: string, message = 'connection refused'): void {
    this.tableErrors.set(name, message);
  }

  reset(): void {
    this.tables.clear();
    this.tableErrors.clear();
  }

  from(table: string) {
    const filters: Array<[string, unknown]> = [];
    const rowsFor = () => this.tables.get(table) ?? [];
    const errorFor = () => this.tableErrors.get(table);

    const builder = {
      select: (_columns?: string) => builder,
      eq: (column: string, value: unknown) => {
        filters.push([column, value]);
        return builder;
      },
      maybeSingle: async (): Promise<QueryResult> => {
        const failure = errorFor();
        if (failure) return { data: null, error: { message: failure } };

        const match = rowsFor().find((row) =>
          filters.every(([column, value]) => row[column] === value),
        );
        return { data: match ?? null, error: null };
      },
    };

    return builder;
  }
}

/** Shared instance the module mock points at. */
export const supabaseMock = new SupabaseMock();
