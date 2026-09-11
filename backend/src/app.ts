import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import { env } from './config/env';
import { errorMiddleware } from './middleware/error.middleware';
import healthRouter from './routes/health.route';
import projectRouter from './routes/project.route';
import dashboardRouter from './routes/dashboard.route';

const app: Application = express();

// CORS — restrict origins in production
app.use(
  cors({
    origin: env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()),
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/health', healthRouter);

// Business API. Everything under /api requires authentication — the router
// applies requireAuth to all of its routes.
// Dashboard/analytics first: `/projects/compare` must match before
// project.route.ts's `/projects/:projectId` would capture "compare" as an id.
app.use('/api', dashboardRouter);
app.use('/api', projectRouter);

// 404 handler for unregistered routes
app.use((_req: Request, res: Response) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

// Global error handler (must be last)
app.use(errorMiddleware);

export default app;
