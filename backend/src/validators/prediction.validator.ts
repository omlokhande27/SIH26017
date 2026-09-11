import { z } from 'zod';

/**
 * Body for POST /api/projects/:projectId/predictions.
 *
 * Everything about the assessment is derived server-side from the stored
 * snapshot. The only thing a caller may choose is WHICH snapshot to assess,
 * and even that is validated against the project before use — so a caller
 * cannot supply feature values of their own, only point at a record the
 * database already holds.
 */
export const createPredictionSchema = z
  .object({
    snapshot_id: z.string().uuid('snapshot_id must be a valid UUID').optional(),
  })
  .strict();

export type CreatePredictionInput = z.infer<typeof createPredictionSchema>;
