import { Router } from 'express';
import type { AppDependencies } from './deps.js';
import { createAdminRouter } from './modules/admin/admin.routes.js';
import { createAttachmentsRouter } from './modules/attachments/attachments.routes.js';
import { createAuthRouter } from './modules/auth/auth.routes.js';
import { createCategoriesRouter } from './modules/categories/categories.routes.js';
import { createMyDashboardRouter } from './modules/dashboard/dashboard.routes.js';
import { createHealthRouter } from './modules/health/health.routes.js';
import { createNotificationsRouter } from './modules/notifications/notifications.routes.js';
import { createOffersRouter } from './modules/offers/offers.routes.js';
import { createVolunteerProfileRouter } from './modules/profiles/profile.routes.js';
import {
  createMyRequestsRouter,
  createRequestsRouter,
} from './modules/requests/requests.routes.js';
import { createMyTasksRouter, createTasksRouter } from './modules/tasks/tasks.routes.js';
import { createUsersRouter } from './modules/users/users.routes.js';

export function createApiRouter(deps: AppDependencies): Router {
  const router = Router();

  router.use('/health', createHealthRouter(deps));
  router.use('/auth', createAuthRouter(deps));
  router.use('/users/me/volunteer-profile', createVolunteerProfileRouter(deps));
  router.use('/users/me/requests', createMyRequestsRouter(deps));
  router.use('/users/me', createMyTasksRouter(deps));
  router.use('/users/me', createMyDashboardRouter(deps));
  router.use('/users', createUsersRouter(deps));
  router.use('/categories', createCategoriesRouter(deps));
  router.use('/requests', createRequestsRouter(deps));
  router.use(createAttachmentsRouter(deps));
  router.use(createOffersRouter(deps));
  router.use('/tasks', createTasksRouter(deps));
  router.use('/notifications', createNotificationsRouter(deps));
  router.use('/admin', createAdminRouter(deps));

  return router;
}
