import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';
import { sendSuccess } from '../utils/response';
import { NotFoundError } from '../utils/errors';
import * as dataService from '../services/project-data.service';
import { authorisedProjectId } from './project.controller';

/**
 * Controllers for the project-owned resources.
 *
 * Every handler takes the project id from `req.projectId`, which only exists
 * once a `requireProjectAccess` guard has allowed the request through.
 *
 * A note on the generated columns: nothing in this file strips them from the
 * request body, because nothing needs to. The validators reject an unknown key
 * outright, and PostgreSQL refuses a write to a generated column regardless.
 * What these handlers do is return the values the database computed, so the
 * client always sees the authoritative figure rather than its own arithmetic.
 */

// ---------------------------------------------------------------------------
// Land acquisition
// ---------------------------------------------------------------------------

export async function getLandAcquisition(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const record = await dataService.getLandAcquisition(authorisedProjectId(req));
    if (!record) throw new NotFoundError('Land acquisition record');
    sendSuccess(res, { land_acquisition: record });
  } catch (err) {
    next(err);
  }
}

export async function createLandAcquisition(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const record = await dataService.createLandAcquisition(authorisedProjectId(req), req.body);
    sendSuccess(res, { land_acquisition: record }, 201, 'Land acquisition record created');
  } catch (err) {
    next(err);
  }
}

export async function updateLandAcquisition(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const record = await dataService.updateLandAcquisition(authorisedProjectId(req), req.body);
    sendSuccess(res, { land_acquisition: record }, 200, 'Land acquisition record updated');
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Compensation
// ---------------------------------------------------------------------------

export async function getCompensation(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const record = await dataService.getCompensation(authorisedProjectId(req));
    if (!record) throw new NotFoundError('Compensation record');
    sendSuccess(res, { compensation: record });
  } catch (err) {
    next(err);
  }
}

export async function createCompensation(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const record = await dataService.createCompensation(authorisedProjectId(req), req.body);
    sendSuccess(res, { compensation: record }, 201, 'Compensation record created');
  } catch (err) {
    next(err);
  }
}

export async function updateCompensation(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const record = await dataService.updateCompensation(authorisedProjectId(req), req.body);
    sendSuccess(res, { compensation: record }, 200, 'Compensation record updated');
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Legal issues
// ---------------------------------------------------------------------------

export async function listLegalIssues(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const issues = await dataService.listLegalIssues(authorisedProjectId(req));
    sendSuccess(res, { legal_issues: issues, count: issues.length });
  } catch (err) {
    next(err);
  }
}

export async function getLegalIssue(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const issue = await dataService.getLegalIssue(authorisedProjectId(req), req.params.id as string);
    sendSuccess(res, { legal_issue: issue });
  } catch (err) {
    next(err);
  }
}

export async function createLegalIssue(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const issue = await dataService.createLegalIssue(authorisedProjectId(req), req.body);
    sendSuccess(res, { legal_issue: issue }, 201, 'Legal issue recorded');
  } catch (err) {
    next(err);
  }
}

export async function updateLegalIssue(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const issue = await dataService.updateLegalIssue(
      authorisedProjectId(req),
      req.params.id as string,
      req.body,
    );
    sendSuccess(res, { legal_issue: issue }, 200, 'Legal issue updated');
  } catch (err) {
    next(err);
  }
}

export async function deleteLegalIssue(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await dataService.deleteLegalIssue(authorisedProjectId(req), req.params.id as string);
    sendSuccess(res, { deleted: true }, 200, 'Legal issue deleted');
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Risk factors
// ---------------------------------------------------------------------------

export async function listRiskFactors(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const factors = await dataService.listRiskFactors(authorisedProjectId(req));
    sendSuccess(res, { risk_factors: factors, count: factors.length });
  } catch (err) {
    next(err);
  }
}

export async function getRiskFactor(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const factor = await dataService.getRiskFactor(
      authorisedProjectId(req),
      req.params.id as string,
    );
    sendSuccess(res, { risk_factor: factor });
  } catch (err) {
    next(err);
  }
}

export async function createRiskFactor(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const factor = await dataService.createRiskFactor(authorisedProjectId(req), req.body);
    sendSuccess(res, { risk_factor: factor }, 201, 'Risk factor recorded');
  } catch (err) {
    next(err);
  }
}

export async function updateRiskFactor(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const factor = await dataService.updateRiskFactor(
      authorisedProjectId(req),
      req.params.id as string,
      req.body,
    );
    sendSuccess(res, { risk_factor: factor }, 200, 'Risk factor updated');
  } catch (err) {
    next(err);
  }
}

export async function deleteRiskFactor(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await dataService.deleteRiskFactor(authorisedProjectId(req), req.params.id as string);
    sendSuccess(res, { deleted: true }, 200, 'Risk factor deleted');
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------------------

/**
 * The risk factor vocabulary.
 *
 * Exposed so a frontend can populate its dropdown from the database rather
 * than from a hard-coded list that would go stale the moment a new factor type
 * is added — which is an INSERT, by design.
 */
export async function listRiskFactorTypes(
  _req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const types = await dataService.listRiskFactorTypes();
    sendSuccess(res, { risk_factor_types: types, count: types.length });
  } catch (err) {
    next(err);
  }
}
