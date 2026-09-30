import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import {
  requireProjectAccess,
  requireRole,
} from '../middleware/authorize.middleware';
import { validate } from '../middleware/validation.middleware';
import * as projectController from '../controllers/project.controller';
import * as dataController from '../controllers/project-data.controller';
import * as snapshotController from '../controllers/snapshot.controller';
import * as predictionController from '../controllers/prediction.controller';
import {
  createProjectSchema,
  listProjectsQuery,
  updateProjectSchema,
} from '../validators/project.validator';
import { createPredictionSchema } from '../validators/prediction.validator';
import {
  createLegalIssueSchema,
  createRiskFactorSchema,
  updateCompensationSchema,
  updateLandAcquisitionSchema,
  updateLegalIssueSchema,
  updateRiskFactorSchema,
  upsertCompensationSchema,
  upsertLandAcquisitionSchema,
} from '../validators/project-data.validator';

/**
 * Project routes.
 *
 * The middleware order on every route is the same and is load-bearing:
 *
 *   requireAuth  ->  requireProjectAccess  ->  validate  ->  controller
 *
 * Authentication before authorization, because the guard needs a caller.
 * Authorization before validation, so an unauthorised request is refused
 * without the API first reporting whether its payload was well-formed —
 * validating first would turn error messages into an oracle about a project
 * the caller may not access.
 *
 * WRITE ROUTES CARRY `{ mode: 'write' }`. Omitting it would silently fall back
 * to a read check and let ANALYST and VIEWER modify data.
 */

const router = Router();

const read = () => requireProjectAccess({ mode: 'read' });
const write = () => requireProjectAccess({ mode: 'write' });


// --- public directory -------------------------------------------------------
// An unauthenticated endpoint used exclusively by the registration wizard
// to populate the project selection dropdown.
router.get('/projects/directory', projectController.listProjects);

// Every route below requires an authenticated caller.
router.use(requireAuth);


// --- reference data ---------------------------------------------------------
// Not project-scoped: the vocabulary is the same for everyone.
router.get('/reference/risk-factor-types', dataController.listRiskFactorTypes);

// --- projects ---------------------------------------------------------------
// The collection has no project id to guard, so read scoping is applied inside
// the service (an OFFICER is restricted to assigned projects there).
router.get('/projects', validate(listProjectsQuery, 'query'), projectController.listProjects);

// Creating a project is not project-scoped — there is nothing to be assigned
// to yet — so it is a role check. ADMIN only, matching the RLS policy.
router.post(
  '/projects',
  requireRole('ADMIN'),
  validate(createProjectSchema),
  projectController.createProject,
);

router.get('/projects/:projectId', read(), projectController.getProject);
router.get('/projects/:projectId/full', read(), projectController.getFullProject);

router.patch(
  '/projects/:projectId',
  write(),
  validate(updateProjectSchema),
  projectController.updateProject,
);

// Deletion is ADMIN-only even on an assigned project: an officer correcting
// operational data should not be able to remove the record entirely.
router.delete(
  '/projects/:projectId',
  requireRole('ADMIN'),
  read(),
  projectController.deleteProject,
);

// --- land acquisition (1:1) -------------------------------------------------
router.get('/projects/:projectId/land-acquisition', read(), dataController.getLandAcquisition);
router.post(
  '/projects/:projectId/land-acquisition',
  write(),
  validate(upsertLandAcquisitionSchema),
  dataController.createLandAcquisition,
);
router.patch(
  '/projects/:projectId/land-acquisition',
  write(),
  validate(updateLandAcquisitionSchema),
  dataController.updateLandAcquisition,
);

// --- compensation (1:1) -----------------------------------------------------
router.get('/projects/:projectId/compensation', read(), dataController.getCompensation);
router.post(
  '/projects/:projectId/compensation',
  write(),
  validate(upsertCompensationSchema),
  dataController.createCompensation,
);
router.patch(
  '/projects/:projectId/compensation',
  write(),
  validate(updateCompensationSchema),
  dataController.updateCompensation,
);

// --- legal issues (1:N) -----------------------------------------------------
router.get('/projects/:projectId/legal-issues', read(), dataController.listLegalIssues);
router.get('/projects/:projectId/legal-issues/:id', read(), dataController.getLegalIssue);
router.post(
  '/projects/:projectId/legal-issues',
  write(),
  validate(createLegalIssueSchema),
  dataController.createLegalIssue,
);
router.patch(
  '/projects/:projectId/legal-issues/:id',
  write(),
  validate(updateLegalIssueSchema),
  dataController.updateLegalIssue,
);
router.delete('/projects/:projectId/legal-issues/:id', write(), dataController.deleteLegalIssue);

// --- risk factors (1:N) -----------------------------------------------------
router.get('/projects/:projectId/risk-factors', read(), dataController.listRiskFactors);
router.get('/projects/:projectId/risk-factors/:id', read(), dataController.getRiskFactor);
router.post(
  '/projects/:projectId/risk-factors',
  write(),
  validate(createRiskFactorSchema),
  dataController.createRiskFactor,
);
router.patch(
  '/projects/:projectId/risk-factors/:id',
  write(),
  validate(updateRiskFactorSchema),
  dataController.updateRiskFactor,
);
router.delete('/projects/:projectId/risk-factors/:id', write(), dataController.deleteRiskFactor);

// --- feature snapshots ------------------------------------------------------
// Creating a snapshot is a WRITE: it produces a permanent record that a
// prediction will later be attributed to. Reading them follows project read
// access.
//
// There is deliberately no PATCH and no DELETE here. Snapshots are immutable —
// see snapshot.service.ts.
router.get('/projects/:projectId/snapshots', read(), snapshotController.listSnapshots);
router.get('/projects/:projectId/snapshots/preview', read(), snapshotController.previewSnapshot);
router.get('/projects/:projectId/snapshots/:id', read(), snapshotController.getSnapshot);
router.post('/projects/:projectId/snapshots', write(), snapshotController.createSnapshot);

// --- predictions and assessments -------------------------------------------
// Running a prediction is a WRITE: it creates a permanent record, may create a
// snapshot, and persists explanations and recommendations. Reading follows
// project read access, so ANALYST and VIEWER can see assessments they must not
// be able to generate.
//
// There is deliberately no PATCH or DELETE. A prediction records what was said
// about a project at a moment in time; editing it after the fact would destroy
// the only basis on which a past decision can be reviewed.
router.get('/projects/:projectId/predictions', read(), predictionController.listPredictions);
router.get(
  '/projects/:projectId/predictions/latest',
  read(),
  predictionController.getLatestPrediction,
);
router.get('/projects/:projectId/assessment', read(), predictionController.getAssessment);
router.post(
  '/projects/:projectId/predictions',
  write(),
  validate(createPredictionSchema),
  predictionController.createPrediction,
);

export default router;
