import { Router, Request, Response } from 'express';
import { env } from '../config/env';
import { checkDatabase } from '../services/health.service';

const router = Router();

/**
 * GET /health
 *
 * Liveness is independent of database health by design: the endpoint returns
 * 200 whenever the process is serving requests, and reports database state in
 * the body. An orchestrator restarting the API because Postgres blipped would
 * make an outage worse, and a health check that goes dark during an incident
 * is exactly the moment you need it to answer.
 *
 * Read `services.database.status` — not the HTTP code — to judge the database.
 */
router.get('/', async (_req: Request, res: Response) => {
  const database = await checkDatabase();

  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
    uptime: process.uptime(),
    services: { database },
  });
});

export default router;
