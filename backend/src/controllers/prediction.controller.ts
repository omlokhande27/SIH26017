import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';
import { sendSuccess } from '../utils/response';
import * as predictionService from '../services/prediction.service';
import { authorisedProjectId } from './project.controller';

/**
 * Prediction controllers.
 *
 * Thin, like the others: read the request, call the service, send a standard
 * response. The orchestration lives in the service so it can be tested without
 * an HTTP layer, and so no future route re-implements part of it.
 */

export async function createPrediction(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = req.body as { snapshot_id?: string } | undefined;
    const assessment = await predictionService.runPrediction(authorisedProjectId(req), {
      ...(body?.snapshot_id && { snapshotId: body.snapshot_id }),
    });
    sendSuccess(res, assessment, 201, 'Assessment created');
  } catch (err) {
    next(err);
  }
}

export async function listPredictions(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const predictions = await predictionService.listPredictions(authorisedProjectId(req));
    sendSuccess(res, { predictions, count: predictions.length });
  } catch (err) {
    next(err);
  }
}

export async function getLatestPrediction(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const prediction = await predictionService.getLatestPrediction(authorisedProjectId(req));
    sendSuccess(res, { prediction });
  } catch (err) {
    next(err);
  }
}

/**
 * The stored assessment behind the latest prediction.
 *
 * Read back from the database, never recomputed — re-running the rules against
 * today's project data would answer a different question from the one this
 * endpoint is asked.
 */
export async function getAssessment(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const assessment = await predictionService.getStoredAssessment(authorisedProjectId(req));
    sendSuccess(res, assessment);
  } catch (err) {
    next(err);
  }
}
