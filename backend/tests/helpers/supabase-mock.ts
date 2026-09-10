/**
 * An in-memory stand-in for the Supabase client.
 *
 * It implements the subset of the PostgREST query builder this backend
 * actually uses — select/insert/update/delete with eq, in, or, order, range,
 * count, single and maybeSingle — and nothing more. A broader fake would
 * invite tests that pass against behaviour the real client does not have.
 *
 * ###########################################################################
 * # WHAT THIS FAKE DOES *NOT* DO, AND WHY THAT IS FINE                      #
 * #                                                                        #
 * # No RLS.       The code under test uses supabaseAdmin, which bypasses    #
 * #               RLS on a real project too. Policies are verified against  #
 * #               real PostgreSQL in database/tests/rls.test.ts.            #
 * #                                                                        #
 * # No CHECK      Constraint enforcement is PostgreSQL's job and is         #
 * # constraints.  covered in database/tests/constraints.test.ts. Where a    #
 * #               backend test needs to see a constraint rejection, it      #
 * #               injects the error with `failWith` rather than pretending  #
 * #               to evaluate the constraint.                               #
 * #                                                                        #
 * # No generated  Generated columns are simulated only where a test asserts #
 * # columns.      the API returns the DATABASE's value rather than the      #
 * #               client's — see `setGeneratedColumn`.                      #
 * #                                                                        #
 * # These tests cover routing, authorization wiring, validation and error   #
 * # mapping. The database tests cover the database.                        #
 * ###########################################################################
 */

export type Row = Record<string, unknown>;

interface Result<T = Row | Row[] | null> {
  data: T;
  error: { code?: string; message: string; details?: string } | null;
  count?: number | null;
}

type Filter = (row: Row) => boolean;

/** A generated column: name -> function computing it from the row. */
type GeneratedColumn = (row: Row) => unknown;

let idCounter = 0;
const nextId = (): string =>
  `00000000-0000-4000-8000-${String(++idCounter).padStart(12, '0')}`;

export class SupabaseMock {
  private tables = new Map<string, Row[]>();
  private tableErrors = new Map<string, { code?: string; message: string }>();
  private generated = new Map<string, Map<string, GeneratedColumn>>();

  setTable(name: string, rows: Row[]): void {
    this.tables.set(name, rows.map((r) => ({ ...r })));
  }

  getTable(name: string): Row[] {
    return this.tables.get(name) ?? [];
  }

  /** Make every query against `name` fail with the given database error. */
  failTable(name: string, message = 'connection refused', code?: string): void {
    this.tableErrors.set(name, { message, code });
  }

  /** Alias that reads better when the point is the SQLSTATE. */
  failWith(name: string, code: string, message: string): void {
    this.tableErrors.set(name, { code, message });
  }

  clearFailure(name: string): void {
    this.tableErrors.delete(name);
  }

  /**
   * Register a column PostgreSQL would compute on write.
   *
   * Used to prove the API returns the database's value rather than echoing
   * whatever the client sent.
   */
  setGeneratedColumn(table: string, column: string, compute: GeneratedColumn): void {
    if (!this.generated.has(table)) this.generated.set(table, new Map());
    this.generated.get(table)!.set(column, compute);
  }

  reset(): void {
    this.tables.clear();
    this.tableErrors.clear();
    this.generated.clear();
  }

  private applyGenerated(table: string, row: Row): Row {
    const columns = this.generated.get(table);
    if (!columns) return row;
    const out = { ...row };
    for (const [name, compute] of columns) out[name] = compute(out);
    return out;
  }

  from(table: string) {
    const self = this;
    const filters: Filter[] = [];
    let pendingRows: Row[] | null = null;
    let operation: 'select' | 'insert' | 'update' | 'delete' = 'select';
    let payload: Row | null = null;
    let wantCount = false;
    let selectedColumns: string[] | null = null;
    let orderBy: { column: string; ascending: boolean } | null = null;
    let rangeSpec: { from: number; to: number } | null = null;

    const failure = () => self.tableErrors.get(table);

    const matching = (): Row[] =>
      self.getTable(table).filter((row) => filters.every((f) => f(row)));

    /** Narrow a row to the columns the caller selected. */
    const project = (row: Row): Row => {
      if (!selectedColumns) return row;
      const out: Row = {};
      for (const column of selectedColumns) {
        if (column in row) out[column] = row[column];
      }
      return out;
    };

    /** Run the pending operation and return the affected rows. */
    const execute = (): Row[] => {
      const all = self.getTable(table);

      switch (operation) {
        case 'insert': {
          const inserted = self.applyGenerated(table, {
            id: nextId(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            ...payload,
          });
          self.tables.set(table, [...all, inserted]);
          return [inserted];
        }

        case 'update': {
          const touched: Row[] = [];
          const updated = all.map((row) => {
            if (!filters.every((f) => f(row))) return row;
            const merged = self.applyGenerated(table, {
              ...row,
              ...payload,
              updated_at: new Date().toISOString(),
            });
            touched.push(merged);
            return merged;
          });
          self.tables.set(table, updated);
          return touched;
        }

        case 'delete': {
          const removed = matching();
          self.tables.set(
            table,
            all.filter((row) => !filters.every((f) => f(row))),
          );
          return removed;
        }

        default: {
          let rows = matching();
          if (orderBy) {
            const { column, ascending } = orderBy;
            rows = [...rows].sort((a, b) => {
              const av = a[column];
              const bv = b[column];
              if (av === bv) return 0;
              const less = (av as never) < (bv as never);
              return (less ? -1 : 1) * (ascending ? 1 : -1);
            });
          }
          pendingRows = rows;
          if (rangeSpec) rows = rows.slice(rangeSpec.from, rangeSpec.to + 1);
          return rows;
        }
      }
    };

    const builder = {
      select(columns?: string, options?: { count?: 'exact' }) {
        if (options?.count === 'exact') wantCount = true;
        // Honour the requested column list. The real client returns only the
        // selected columns, and tests that assert on a response shape are only
        // meaningful if the fake does the same — otherwise a column the API
        // never selects (an invented updated_at on an immutable table, say)
        // silently appears in the result.
        if (columns && columns.trim() !== '*') {
          selectedColumns = columns
            .split(',')
            .map((c) => c.trim())
            .filter(Boolean);
        }
        return builder;
      },
      insert(values: Row) {
        operation = 'insert';
        payload = values;
        return builder;
      },
      update(values: Row) {
        operation = 'update';
        payload = values;
        return builder;
      },
      delete() {
        operation = 'delete';
        return builder;
      },
      eq(column: string, value: unknown) {
        filters.push((row) => row[column] === value);
        return builder;
      },
      in(column: string, values: unknown[]) {
        filters.push((row) => values.includes(row[column]));
        return builder;
      },
      or(expression: string) {
        // Supports only the `col.ilike.*term*,col2.ilike.*term*` form used by
        // the project search filter.
        const clauses = expression.split(',').map((clause) => {
          const [column, op, raw] = clause.split('.');
          const term = (raw ?? '').replace(/\*/g, '').toLowerCase();
          return (row: Row) =>
            op === 'ilike' && String(row[column ?? ''] ?? '').toLowerCase().includes(term);
        });
        filters.push((row) => clauses.some((c) => c(row)));
        return builder;
      },
      order(column: string, options?: { ascending?: boolean }) {
        orderBy = { column, ascending: options?.ascending !== false };
        return builder;
      },
      range(from: number, to: number) {
        rangeSpec = { from, to };
        return builder;
      },
      async single(): Promise<Result<Row | null>> {
        const failed = failure();
        if (failed) return { data: null, error: failed };
        const rows = execute();
        if (rows.length === 0) {
          return { data: null, error: { code: 'PGRST116', message: 'No rows found' } };
        }
        return { data: project(rows[0] as Row), error: null };
      },
      async maybeSingle(): Promise<Result<Row | null>> {
        const failed = failure();
        if (failed) return { data: null, error: failed };
        const rows = execute();
        return { data: rows[0] ? project(rows[0]) : null, error: null };
      },
      /** Awaiting the builder directly runs it and returns all rows. */
      then<TResult1 = Result<Row[]>, TResult2 = never>(
        onfulfilled?: ((value: Result<Row[]>) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
      ): Promise<TResult1 | TResult2> {
        const failed = failure();
        const result: Result<Row[]> = failed
          ? { data: [], error: failed, count: null }
          : (() => {
              const rows = execute().map(project);
              return {
                data: rows,
                error: null,
                count: wantCount ? (pendingRows ?? rows).length : null,
              };
            })();
        return Promise.resolve(result).then(onfulfilled, onrejected);
      },
    };

    return builder;
  }
}

export const supabaseMock = new SupabaseMock();
