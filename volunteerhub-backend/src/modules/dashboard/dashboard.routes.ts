import { Router } from 'express';
import { z } from 'zod';
import type { AppDependencies } from '../../deps.js';
import { pageMeta, paginationQuery, toSkipTake } from '../../lib/pagination.js';
import { currentUser, requireAuth } from '../../middleware/auth.js';
import { getMatches } from '../matches/matches.service.js';
import { publicUserSelect } from '../users/users.dto.js';
import { getAdminDashboard, getMyDashboard } from './dashboard.service.js';

export const auditLogQuery = paginationQuery.extend({
  action: z.string().trim().max(60).optional(),
  entityType: z.string().trim().max(40).optional(),
  entityId: z.uuid().optional(),
  actorId: z.uuid().optional(),
});

export function createMyDashboardRouter({ env, prisma }: AppDependencies): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/dashboard', async (req, res) => {
    res.json({ data: await getMyDashboard(prisma, currentUser(req).id) });
  });

  router.get('/matches', async (req, res) => {
    const { tasks, requests, ...meta } = await getMatches(
      prisma,
      currentUser(req).id,
      env.TIME_ZONE,
    );
    res.json({ data: { tasks, requests }, meta });
  });

  return router;
}

export function createDashboardAdminRouter({ prisma }: AppDependencies): Router {
  const router = Router();

  router.get('/dashboard', async (_req, res) => {
    res.json({ data: await getAdminDashboard(prisma) });
  });

  router.get('/audit-logs', async (req, res) => {
    const query = auditLogQuery.parse(req.query);
    const where = {
      ...(query.action && { action: query.action }),
      ...(query.entityType && { entityType: query.entityType }),
      ...(query.entityId && { entityId: query.entityId }),
      ...(query.actorId && { actorId: query.actorId }),
    };
    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        select: {
          id: true,
          action: true,
          entityType: true,
          entityId: true,
          metadata: true,
          createdAt: true,
          actor: { select: publicUserSelect },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        ...toSkipTake(query),
      }),
      prisma.auditLog.count({ where }),
    ]);
    res.json({ data: logs, meta: pageMeta(query, total) });
  });

  return router;
}
