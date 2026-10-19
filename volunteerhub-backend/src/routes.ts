import { Router } from 'express';
import type { AppDependencies } from './deps.js';
import { createHealthRouter } from './modules/health/health.routes.js';

/** Root of the API, mounted at /api. Each feature module contributes its own router. */
export function createApiRouter(deps: AppDependencies): Router {
  const router = Router();

  router.use('/health', createHealthRouter(deps));

  return router;
}
