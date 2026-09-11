import { z } from 'zod';
import { PROJECT_STATUSES } from './common.validator';

/**
 * Dashboard and analytics query validation.
 *
 * Every schema is `.strict()`, and every sortable or filterable field is an
 * explicit enum. A user-supplied column name must never reach a query — that
 * is how an ORDER BY becomes an injection point.
 */

const RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

export const highRiskQuery = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(10),
    state: z.string().trim().min(1).max(100).optional(),
    risk_level: z.enum(RISK_LEVELS).optional(),
  })
  .strict();

export type HighRiskQueryInput = z.infer<typeof highRiskQuery>;

/**
 * Comparison ids.
 *
 * Capped at 10: a comparison view is for a handful of projects, and an
 * unbounded list would let one request assemble the whole portfolio through an
 * endpoint that returns far more per project than the list endpoint does.
 * Duplicates are rejected rather than silently deduplicated, so a caller
 * building the list programmatically learns their input was wrong.
 */
export const compareQuery = z
  .object({
    ids: z
      .string()
      .min(1, 'ids is required')
      .transform((raw) => raw.split(',').map((s) => s.trim()).filter(Boolean))
      .pipe(
        z
          .array(z.string().uuid('Each id must be a valid UUID'))
          .min(2, 'Comparison needs at least 2 projects')
          .max(10, 'Comparison is limited to 10 projects'),
      )
      .refine((ids) => new Set(ids).size === ids.length, {
        message: 'Duplicate project ids are not allowed',
      }),
  })
  .strict();

export type CompareQueryInput = z.infer<typeof compareQuery>;

/** Extra filters for the project list, beyond those already supported. */
export const analyticsFilterQuery = z
  .object({
    state: z.string().trim().min(1).max(100).optional(),
    sector: z.string().trim().min(1).max(100).optional(),
    implementing_agency: z.string().trim().min(1).max(200).optional(),
    project_status: z.enum(PROJECT_STATUSES).optional(),
  })
  .strict();
