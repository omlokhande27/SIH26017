import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';
import { sendSuccess } from '../utils/response';
import { AppError } from '../middleware/error.middleware';
import * as dashboardService from '../services/dashboard.service';
import { compareProjects } from '../services/comparison.service';
import { generateAiSummary } from '../services/ai-summary.service';
import { authorisedProjectId } from './project.controller';
import type { CompareQueryInput, HighRiskQueryInput } from '../validators/dashboard.validator';

/**
 * Dashboard, analytics, comparison and AI-summary controllers.
 *
 * Thin, like the rest. The one thing they all do is pass `req.user` to the
 * service so the aggregate is scoped — these endpoints have no project id for
 * `requireProjectAccess` to guard, so that argument IS the authorization.
 */

function callerOf(req: AuthenticatedRequest) {
  if (!req.user) {
    throw new AppError(500, 'Route misconfiguration: requireAuth did not run');
  }
  return req.user;
}

/**
 * Honesty metadata attached to every analytics response that reports a delay.
 *
 * Carried on the response rather than left to the client to remember: a
 * dashboard that renders "596 days" without it invites the reading this whole
 * architecture exists to prevent.
 */
const ML_DISCLOSURE = {
  primary_signal: 'RULE_ENGINE',
  delay_estimate_note:
    'Delay figures come from the ML service. While prediction_type is BASELINE_MEDIAN they are ' +
    'the historical median across past projects — not a model prediction, and carrying no ' +
    'project-specific signal. The rule-based risk score is the decision-support signal.',
  limitations: [
    'dataset_size_limited',
    'feature_variance_limited',
    'predictors_largely_imputed',
    'ml_outperforms_baseline_false',
  ],
} as const;

export async function getOverview(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const overview = await dashboardService.getDashboardOverview(callerOf(req));
    sendSuccess(res, { overview, disclosure: ML_DISCLOSURE });
  } catch (err) {
    next(err);
  }
}

export async function getRiskDistribution(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const distribution = await dashboardService.getRiskDistribution(callerOf(req));
    const total = distribution.reduce((sum, row) => sum + Number(row.project_count), 0);
    sendSuccess(res, { distribution, total_assessed: total });
  } catch (err) {
    next(err);
  }
}

export async function getHighRiskProjects(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const query = req.query as unknown as HighRiskQueryInput;
    const projects = await dashboardService.getHighRiskProjects(callerOf(req), query);
    sendSuccess(res, {
      projects,
      count: projects.length,
      filters: { limit: query.limit, state: query.state ?? null, risk_level: query.risk_level ?? null },
      disclosure: ML_DISCLOSURE,
    });
  } catch (err) {
    next(err);
  }
}

export async function getAnalyticsByState(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const states = await dashboardService.getAnalyticsByState(callerOf(req));
    sendSuccess(res, { states, count: states.length, disclosure: ML_DISCLOSURE });
  } catch (err) {
    next(err);
  }
}

export async function getLandAcquisitionAnalytics(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const analytics = await dashboardService.getLandAcquisitionAnalytics(callerOf(req));
    sendSuccess(res, {
      analytics,
      note:
        'Monetary and area totals are aggregated in PostgreSQL as NUMERIC and returned as ' +
        'strings, so exact decimal precision is preserved. Do not parse them to float for ' +
        'further arithmetic.',
    });
  } catch (err) {
    next(err);
  }
}

export async function getDelayAnalytics(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const analytics = await dashboardService.getDelayAnalytics(callerOf(req));
    sendSuccess(res, { analytics, disclosure: ML_DISCLOSURE });
  } catch (err) {
    next(err);
  }
}

export async function compare(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { ids } = req.query as unknown as CompareQueryInput;
    const result = await compareProjects(callerOf(req), ids);
    sendSuccess(res, { ...result, disclosure: ML_DISCLOSURE });
  } catch (err) {
    next(err);
  }
}

/**
 * AI summary for one project.
 *
 * Project-scoped, so it runs behind `requireProjectAccess` like any other
 * project read. A 503 here means AI summaries are not configured — every other
 * endpoint keeps working.
 */
export async function aiSummary(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await generateAiSummary(authorisedProjectId(req));
    sendSuccess(res, result, 200, 'AI-generated explanation of an existing assessment');
  } catch (err) {
    next(err);
  }
}
