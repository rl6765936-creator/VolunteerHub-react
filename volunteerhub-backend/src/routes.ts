import { Router } from 'express';
import type { AppDependencies } from './deps.js';
import { createAdminRouter } from './modules/admin/admin.routes.js';
import { createAuthRouter } from './modules/auth/auth.routes.js';
import { createHealthRouter } from './modules/health/health.routes.js';
import { createUsersRouter } from './modules/users/users.routes.js';

/** Root of the API, mounted at /api. Each feature module contributes its own router. */
export function createApiRouter(deps: AppDependencies): Router {
  const router = Router();

  router.use('/health', createHealthRouter(deps));
  router.use('/auth', createAuthRouter(deps));
  router.use('/users', createUsersRouter(deps));
  router.use('/admin', createAdminRouter(deps));

  return router;
}
