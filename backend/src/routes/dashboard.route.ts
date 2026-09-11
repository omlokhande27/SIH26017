import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { requireProjectAccess } from '../middleware/authorize.middleware';
import { validate } from '../middleware/validation.middleware';
import * as dashboardController from '../controllers/dashboard.controller';
import { compareQuery, highRiskQuery } from '../validators/dashboard.validator';

/**
 * Dashboard, analytics and AI routes.
 *
 * ###########################################################################
 * # THESE ENDPOINTS HAVE NO PROJECT ID TO GUARD.                            #
 * #                                                                        #
 * # `requireProjectAccess` cannot protect an aggregate over the whole       #
 * # table, and the backend queries with the service-role key, which         #
 * # bypasses RLS. Scoping therefore happens inside each service via         #
 * # `visibleProjectIds(user)` — an OFFICER's totals cover only assigned     #
 * # projects. Every route here is read-only; none writes anything.          #
 * ###########################################################################
 *
 * ADMIN, ANALYST and VIEWER see portfolio-wide figures under the documented
 * prototype visibility policy. OFFICER sees only their own.
 */

const router = Router();

router.use(requireAuth);

// --- dashboard --------------------------------------------------------------
router.get('/dashboard/overview', dashboardController.getOverview);
router.get('/dashboard/risk-distribution', dashboardController.getRiskDistribution);
router.get(
  '/dashboard/high-risk-projects',
  validate(highRiskQuery, 'query'),
  dashboardController.getHighRiskProjects,
);

// --- analytics --------------------------------------------------------------
router.get('/analytics/by-state', dashboardController.getAnalyticsByState);
router.get('/analytics/land-acquisition', dashboardController.getLandAcquisitionAnalytics);
router.get('/analytics/delay', dashboardController.getDelayAnalytics);

// --- comparison -------------------------------------------------------------
// Registered before the `/projects/:projectId` routes in project.route.ts would
// be reached, and on a distinct path segment, so "compare" is never parsed as
// a project id.
router.get('/projects/compare', validate(compareQuery, 'query'), dashboardController.compare);

// --- AI summary -------------------------------------------------------------
// Project-scoped, so it runs behind the same read guard as any project read.
// A read: it creates nothing and persists nothing.
router.post(
  '/projects/:projectId/ai-summary',
  requireProjectAccess({ mode: 'read' }),
  dashboardController.aiSummary,
);

export default router;
