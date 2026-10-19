import { Router } from 'express';
import type { AppDependencies } from '../../deps.js';
import { requireAdmin } from '../../middleware/auth.js';
import { createCategoriesAdminRouter } from '../categories/categories.routes.js';
import { createDashboardAdminRouter } from '../dashboard/dashboard.routes.js';
import { createRequestsAdminRouter } from '../requests/requests.routes.js';
import { createTasksAdminRouter } from '../tasks/tasks.routes.js';
import { createUsersAdminRouter } from '../users/users.routes.js';

/** Everything under /api/admin requires the ADMIN role, checked on every request. */
export function createAdminRouter(deps: AppDependencies): Router {
  const router = Router();
  router.use(requireAdmin);

  router.use('/users', createUsersAdminRouter(deps));
  router.use('/categories', createCategoriesAdminRouter(deps));
  router.use('/requests', createRequestsAdminRouter(deps));
  router.use('/tasks', createTasksAdminRouter(deps));
  router.use(createDashboardAdminRouter(deps));

  return router;
}
