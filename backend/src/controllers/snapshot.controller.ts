import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';
import { sendSuccess } from '../utils/response';
import * as snapshotService from '../services/snapshot.service';
import { authorisedProjectId } from './project.controller';

/**
 * Feature snapshot controllers.
 *
 * There is no update handler and no delete handler in this file, and that is a
 * design decision rather than an omission: a snapshot records what the model
 * was shown at a moment in time, and a revisable record cannot serve that
 * purpose. The absence of the routes is the enforcement at this layer; the
 * database enforces it independently.
 */

export async function createSnapshot(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    // The snapshot moment is the server's clock, never a client-supplied
    // timestamp. Letting a caller choose it would allow backdating a snapshot
    // to before an inconvenient event — the temporal integrity of the whole
    // training set rests on this instant being trustworthy.
    const result = await snapshotService.createSnapshot(authorisedProjectId(req), new Date());

    sendSuccess(
      res,
      {
        snapshot: result.snapshot,
        data_quality: result.dataQuality,
      },
      201,
      'Feature snapshot created',
    );
  } catch (err) {
    next(err);
  }
}

/**
 * Dry run: what would a snapshot contain, and would it be accepted?
 *
 * Read-only. Lets a frontend show "this project is not ready, and here is why"
 * before the user commits to an immutable record.
 */
export async function previewSnapshot(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const preview = await snapshotService.previewSnapshot(authorisedProjectId(req), new Date());
    sendSuccess(res, {
      would_succeed: preview.wouldSucceed,
      features: preview.features,
      data_quality: preview.dataQuality,
      persisted: false,
    });
  } catch (err) {
    next(err);
  }
}

export async function listSnapshots(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const snapshots = await snapshotService.listSnapshots(authorisedProjectId(req));
    sendSuccess(res, { snapshots, count: snapshots.length });
  } catch (err) {
    next(err);
  }
}

export async function getSnapshot(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const snapshot = await snapshotService.getSnapshot(
      authorisedProjectId(req),
      req.params.id as string,
    );
    sendSuccess(res, { snapshot });
  } catch (err) {
    next(err);
  }
}
