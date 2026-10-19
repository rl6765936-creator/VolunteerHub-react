import { Router } from 'express';

/** Liveness check. A database readiness check (/health/ready) is added with the database (Phase 2). */
export function createHealthRouter(): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json({
      data: {
        status: 'ok',
        service: 'volunteerhub-backend',
        uptimeSeconds: Math.round(process.uptime()),
        timestamp: new Date().toISOString(),
      },
    });
  });

  return router;
}
