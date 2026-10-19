import { Router } from 'express';
import type { AppDependencies } from './deps.js';
import type { LocalStorage } from './lib/storage.js';
import { createAdminRouter } from './modules/admin/admin.routes.js';
import { createAttachmentsRouter } from './modules/attachments/attachments.routes.js';
import { createAuthRouter } from './modules/auth/auth.routes.js';
import { createCategoriesRouter } from './modules/categories/categories.routes.js';
import { createHealthRouter } from './modules/health/health.routes.js';
import { createVolunteerProfileRouter } from './modules/profiles/profile.routes.js';
import {
  createMyRequestsRouter,
  createRequestsRouter,
} from './modules/requests/requests.routes.js';
import { createUsersRouter } from './modules/users/users.routes.js';

/** Root of the API, mounted at /api. Each feature module contributes its own router. */
export function createApiRouter(deps: AppDependencies, storage: LocalStorage): Router {
  const router = Router();

  router.use('/health', createHealthRouter(deps));
  router.use('/auth', createAuthRouter(deps));
  router.use('/users/me/volunteer-profile', createVolunteerProfileRouter(deps));
  router.use('/users/me/requests', createMyRequestsRouter(deps));
  router.use('/users', createUsersRouter(deps));
  router.use('/categories', createCategoriesRouter(deps));
  router.use('/requests', createRequestsRouter(deps));
  router.use(createAttachmentsRouter(deps, storage));
  router.use('/admin', createAdminRouter(deps));

  return router;
}
