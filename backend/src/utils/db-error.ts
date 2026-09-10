import { AppError } from '../middleware/error.middleware';
import {
  ConflictError,
  DependencyUnavailableError,
  NotFoundError,
  UnprocessableError,
} from './errors';

/**
 * Translate a PostgreSQL / PostgREST error into an HTTP-shaped `AppError`.
 *
 * Two rules govern everything here.
 *
 * FIRST: raw database errors never reach the client. A PostgREST message can
 * name tables, columns, constraints and sometimes the offending values — an
 * accurate map of the schema, handed to whoever asked. Callers get a stable,
 * general sentence; the detail goes to the server log.
 *
 * SECOND: the status code reflects what the caller can do about it. A
 * constraint violation is 422 (the request was understood and refused on its
 * merits), a duplicate is 409, and a connectivity failure is 503 — not 500,
 * because the request itself was fine and retrying may well work.
 */

/** The PostgreSQL error shape surfaced through supabase-js. */
export interface PostgresErrorLike {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
}

const SQLSTATE = {
  UNIQUE_VIOLATION: '23505',
  FOREIGN_KEY_VIOLATION: '23503',
  NOT_NULL_VIOLATION: '23502',
  CHECK_VIOLATION: '23514',
  GENERATED_ALWAYS: '428C9',
  UNDEFINED_TABLE: '42P01',
  INSUFFICIENT_PRIVILEGE: '42501',
} as const;

/** PostgREST codes that mean "the schema is not deployed". */
const SCHEMA_MISSING_CODES = new Set([SQLSTATE.UNDEFINED_TABLE, 'PGRST205']);

/** PostgREST code for "expected exactly one row, got none". */
const NO_ROWS_CODES = new Set(['PGRST116']);

/**
 * Human-readable explanations for the named constraints in schema.sql.
 *
 * Mapping a constraint name to a sentence is what turns an opaque database
 * rejection into something a frontend can display. Anything unmapped falls
 * back to a generic message rather than echoing the database text.
 */
const CONSTRAINT_MESSAGES: Record<string, string> = {
  land_acquired_not_over_required:
    'Land acquired cannot exceed land required.',
  land_parcels_acquired_not_over_total:
    'Acquired parcels cannot exceed total parcels.',
  land_award_after_notification:
    'Award date cannot be earlier than the notification date.',
  land_possession_after_award:
    'Possession date cannot be earlier than the award date.',
  compensation_paid_not_over_required:
    'Compensation paid cannot exceed compensation required.',
  projects_planned_dates_ordered:
    'Planned completion date cannot be earlier than the planned start date.',
  projects_actual_dates_ordered:
    'Actual completion date cannot be earlier than the actual start date.',
  legal_resolved_after_reported:
    'Resolved date cannot be earlier than the reported date.',
  legal_case_reference_requires_court_case:
    'A case reference can only be recorded when the issue is a court case.',
  risk_resolved_after_reported:
    'Resolved date cannot be earlier than the reported date.',
  snapshot_acquired_not_over_required:
    'Snapshot rejected: land acquired exceeds land required.',
  snapshot_rr_pending_requires_rr:
    'Snapshot rejected: R&R cannot be pending unless R&R is required.',
  snapshot_litigation_matches_case_count:
    'Snapshot rejected: the litigation flag and the court case count disagree.',
  predictions_result_matches_status:
    'A prediction must carry a result when SUCCESS, and none when FAILED or PENDING.',
};

/** Foreign keys whose violation is better explained than echoed. */
const FOREIGN_KEY_MESSAGES: Record<string, string> = {
  risk_factors_factor_type_fkey:
    'Unknown risk factor type. Use one of the codes from /api/reference/risk-factor-types.',
};

export interface TranslateOptions {
  /** Resource name used in a 404, e.g. "Project". */
  resource?: string;
  /** Extra context for the server-side log. */
  context?: Record<string, unknown>;
}

export function translateDbError(
  error: PostgresErrorLike | null | undefined,
  options: TranslateOptions = {},
): AppError {
  const { resource = 'Resource', context = {} } = options;
  const code = error?.code ?? '';

  // Full detail to the log, never to the caller.
  console.error('[db] query failed', {
    ...context,
    code,
    message: error?.message,
    details: error?.details,
  });

  if (NO_ROWS_CODES.has(code)) {
    return new NotFoundError(resource);
  }

  if (SCHEMA_MISSING_CODES.has(code)) {
    return new DependencyUnavailableError(
      'The database schema is not available. Apply database/schema.sql.',
    );
  }

  switch (code) {
    case SQLSTATE.UNIQUE_VIOLATION:
      return new ConflictError(
        constraintName(error) === 'projects_project_code_key'
          ? 'A project with this project code already exists.'
          : 'This record already exists.',
      );

    case SQLSTATE.FOREIGN_KEY_VIOLATION: {
      const name = constraintName(error);
      return new UnprocessableError(
        (name && FOREIGN_KEY_MESSAGES[name]) ??
          'A referenced record does not exist.',
      );
    }

    case SQLSTATE.CHECK_VIOLATION: {
      const name = constraintName(error);
      return new UnprocessableError(
        (name && CONSTRAINT_MESSAGES[name]) ??
          'The request violates a data integrity rule.',
      );
    }

    case SQLSTATE.NOT_NULL_VIOLATION:
      return new UnprocessableError('A required field is missing.');

    case SQLSTATE.GENERATED_ALWAYS:
      // Should be unreachable: validators strip generated columns before the
      // query is built. Reaching it means a validator was bypassed.
      return new UnprocessableError(
        'This value is calculated by the database and cannot be supplied.',
      );

    case SQLSTATE.INSUFFICIENT_PRIVILEGE:
      return new AppError(403, 'Insufficient permissions');

    default:
      // Unknown database failure, or the database is unreachable. Not the
      // caller's fault, and possibly transient.
      return new DependencyUnavailableError('The database is currently unavailable.');
  }
}

/**
 * Recover the constraint name.
 *
 * supabase-js does not surface PostgreSQL's `constraint` field, so the name is
 * read out of the message text. That is why an unrecognised name falls back to
 * a generic sentence instead of interpolating whatever was found.
 */
function constraintName(error: PostgresErrorLike | null | undefined): string | null {
  const haystack = `${error?.message ?? ''} ${error?.details ?? ''}`;
  const match = haystack.match(/constraint "([^"]+)"/i);
  return match?.[1] ?? null;
}
