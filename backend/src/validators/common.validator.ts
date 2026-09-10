import { z } from 'zod';

/**
 * Shared validation primitives.
 *
 * Two conventions run through every schema in this directory.
 *
 * `.strict()` EVERYWHERE. An unknown key is rejected rather than ignored. This
 * is what keeps generated columns out of write payloads by construction: a
 * body carrying `land_acquisition_percentage` fails validation before any
 * query is built, so the API never has to remember to strip it. Silently
 * dropping unknown keys would also let a client believe a field was saved
 * when it was discarded.
 *
 * NUMERIC VALUES STAY STRINGS. PostgreSQL NUMERIC is exact decimal and
 * supabase-js returns it as a string, because an IEEE-754 double cannot hold
 * every NUMERIC value. Money and areas are therefore validated as decimal
 * strings and passed through untouched — parsing them to `number` in the
 * backend would introduce exactly the rounding error the column type exists
 * to prevent.
 */

/** A UUID path parameter. */
export const uuidParam = z.string().uuid('Must be a valid UUID');

/**
 * A non-negative exact decimal, kept as a string.
 *
 * Accepts a JSON number too, for client convenience, but converts it to its
 * string form immediately so nothing downstream does float arithmetic on it.
 */
export const decimalString = (label: string, opts: { allowZero?: boolean } = {}) =>
  z
    .union([z.string(), z.number()])
    .transform((v) => (typeof v === 'number' ? String(v) : v.trim()))
    .refine((v) => /^\d+(\.\d+)?$/.test(v), {
      message: `${label} must be a non-negative decimal number`,
    })
    .refine((v) => (opts.allowZero === false ? Number(v) > 0 : true), {
      message: `${label} must be greater than zero`,
    });

/** A non-negative integer count. */
export const nonNegativeInt = (label: string) =>
  z
    .number()
    .int(`${label} must be a whole number`)
    .min(0, `${label} cannot be negative`);

/** An ISO calendar date (YYYY-MM-DD), validated as a real date. */
export const isoDate = (label: string) =>
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${label} must be in YYYY-MM-DD format`)
    .refine((v) => {
      const parsed = new Date(`${v}T00:00:00Z`);
      // Round-trips only if the calendar date is real: 2025-02-30 does not.
      return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(v);
    }, `${label} is not a real calendar date`);

/** A short free-text field. */
export const shortText = (label: string, max = 300) =>
  z.string().trim().min(1, `${label} is required`).max(max, `${label} is too long`);

/** An optional longer free-text field. */
export const longText = (label: string, max = 5000) =>
  z.string().trim().max(max, `${label} is too long`);

// --- database vocabularies --------------------------------------------------
// These mirror the CHECK constraints in schema.sql. Where the database uses a
// lookup table instead (risk_factors.factor_type), no enum is declared here —
// the whole point of that table is that new codes are an INSERT, so hard-coding
// the list in the API would defeat it.

export const PROJECT_STATUSES = [
  'PLANNED',
  'ACTIVE',
  'ON_HOLD',
  'COMPLETED',
  'CANCELLED',
] as const;

export const PAYMENT_STATUSES = [
  'NOT_STARTED',
  'IN_PROGRESS',
  'PARTIAL',
  'COMPLETED',
  'DISPUTED',
] as const;

export const LEGAL_ISSUE_TYPES = [
  'LITIGATION',
  'LAND_DISPUTE',
  'TITLE_DISPUTE',
  'LAND_RECORD_ISSUE',
  'COMPENSATION_DISPUTE',
] as const;

export const ISSUE_STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const;

export const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

/**
 * Statuses that mean the issue or risk factor is still live.
 *
 * Used when deriving snapshot flags: a resolved dispute is part of the
 * project's history, not its current risk profile.
 */
export const ACTIVE_STATUSES: readonly string[] = ['OPEN', 'IN_PROGRESS'];

/** Pagination, with real limits rather than decorative ones. */
export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type Pagination = z.infer<typeof paginationQuery>;
