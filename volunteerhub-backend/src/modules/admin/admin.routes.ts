import { Router } from 'express';
import type { AppDependencies } from '../../deps.js';
import { requireAdmin } from '../../middleware/auth.js';
import { createCategoriesAdminRouter } from '../categories/categories.routes.js';
import { createRequestsAdminRouter } from '../requests/requests.routes.js';
import { createUsersAdminRouter } from '../users/users.routes.js';

/** Everything under /api/admin requires the ADMIN role, checked on every request. */
export function createAdminRouter(deps: AppDependencies): Router {
  const router = Router();
  router.use(requireAdmin);

  router.use('/users', createUsersAdminRouter(deps));
  router.use('/categories', createCategoriesAdminRouter(deps));
  router.use('/requests', createRequestsAdminRouter(deps));

  return router;
}
