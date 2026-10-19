import { Router, type Request } from 'express';
import type { AppDependencies } from '../../deps.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { errors } from '../../lib/errors.js';
import { parseId } from '../../lib/http.js';
import { pageMeta, toSkipTake } from '../../lib/pagination.js';
import type { Db } from '../../lib/prisma.js';
import { currentUser, requireAuth } from '../../middleware/auth.js';
import { writeRateLimiter } from '../../middleware/security.js';
import { listHistory } from '../history/history.service.js';
import { approveBody, cancelBody, rejectBody } from '../moderation/moderation.schemas.js';
import { cancelRegistration, register } from '../registrations/registrations.service.js';
import { loadVisibleTask, taskDetailInclude } from './taskAccess.js';
import {
  adminListTasksQuery,
  createTaskBody,
  listTasksQuery,
  myRegistrationsQuery,
  myTasksQuery,
  registrationsQuery,
  updateTaskBody,
} from './tasks.schemas.js';
import { serializeTask } from './tasks.serializer.js';
import {
  approveTask,
  cancelTask,
  completeTask,
  createTask,
  fullTaskIds,
  rejectTask,
  taskOrderBy,
  taskTextSearch,
  updateTask,
} from './tasks.service.js';

async function detail(prisma: Db, id: string, req: Request) {
  const { task, access } = await loadVisibleTask(prisma, id, req.user);
  return serializeTask(task, { access });
}

/** /api/tasks: public search of approved tasks, creator actions and registration. */
export function createTasksRouter({ env, prisma }: AppDependencies): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const query = listTasksQuery.parse(req.query);
    const full = query.availableOnly ? await fullTaskIds(prisma) : [];
    const startsAt: Prisma.DateTimeFilter = {
      ...(!query.includePast && { gt: new Date() }),
      ...(query.from && { gte: query.from }),
      ...(query.to && { lte: query.to }),
    };
    const where: Prisma.VolunteerTaskWhereInput = {
      moderationStatus: 'APPROVED',
      status: query.status,
      ...(Object.keys(startsAt).length > 0 && { startsAt }),
      ...(query.categoryId && { categoryId: query.categoryId }),
      ...(query.region && { region: { contains: query.region, mode: 'insensitive' } }),
      ...(full.length > 0 && { id: { notIn: full } }),
      ...taskTextSearch(query.q),
    };
    const [rows, total] = await Promise.all([
      prisma.volunteerTask.findMany({
        where,
        include: taskDetailInclude,
        orderBy: taskOrderBy(query.sort),
        ...toSkipTake(query),
      }),
      prisma.volunteerTask.count({ where }),
    ]);
    res.json({ data: rows.map((row) => serializeTask(row)), meta: pageMeta(query, total) });
  });

  router.post('/', requireAuth, writeRateLimiter(env), async (req, res) => {
    const id = await createTask(prisma, createTaskBody.parse(req.body), currentUser(req));
    res.status(201).json({ data: await detail(prisma, id, req) });
  });

  router.get('/:id', async (req, res) => {
    res.json({ data: await detail(prisma, parseId(req.params.id), req) });
  });

  router.patch('/:id', requireAuth, async (req, res) => {
    const id = parseId(req.params.id);
    const result = await updateTask(prisma, id, updateTaskBody.parse(req.body), currentUser(req));
    res.json({
      data: await detail(prisma, id, req),
      meta: { changedFields: result.changedFields, reModeration: result.reModeration },
    });
  });

  router.post('/:id/cancel', requireAuth, async (req, res) => {
    const id = parseId(req.params.id);
    await cancelTask(prisma, id, cancelBody.parse(req.body ?? {}), currentUser(req));
    res.json({ data: await detail(prisma, id, req) });
  });

  router.post('/:id/complete', requireAuth, async (req, res) => {
    const id = parseId(req.params.id);
    await completeTask(prisma, id, currentUser(req));
    res.json({ data: await detail(prisma, id, req) });
  });

  router.get('/:id/history', requireAuth, async (req, res) => {
    const id = parseId(req.params.id);
    const { access } = await loadVisibleTask(prisma, id, req.user);
    if (!access.isOwner && !access.isAdmin) {
      throw errors.forbidden('Only the creator or an admin can see the history.');
    }
    const registrationIds = (
      await prisma.taskRegistration.findMany({ where: { taskId: id }, select: { id: true } })
    ).map((registration) => registration.id);
    const [taskHistory, registrationHistory] = await Promise.all([
      listHistory(prisma, 'VOLUNTEER_TASK', [id]),
      listHistory(prisma, 'TASK_REGISTRATION', registrationIds),
    ]);
    res.json({
      data: [...taskHistory, ...registrationHistory].sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
      ),
    });
  });

  // Registrations

  router.post('/:id/registrations', requireAuth, async (req, res) => {
    const registration = await register(prisma, parseId(req.params.id), currentUser(req));
    res.status(201).json({ data: registration });
  });

  router.delete('/:id/registrations/me', requireAuth, async (req, res) => {
    const registration = await cancelRegistration(prisma, parseId(req.params.id), currentUser(req));
    res.json({ data: registration });
  });

  /** The creator and admins see who registered: name and email only, never availability. */
  router.get('/:id/registrations', requireAuth, async (req, res) => {
    const id = parseId(req.params.id);
    const { status } = registrationsQuery.parse(req.query);
    const { access } = await loadVisibleTask(prisma, id, req.user);
    if (!access.isOwner && !access.isAdmin) {
      throw errors.forbidden('Only the creator or an admin can see the registrations.');
    }
    const registrations = await prisma.taskRegistration.findMany({
      where: { taskId: id, ...(status && { status }) },
      select: {
        id: true,
        status: true,
        createdAt: true,
        cancelledAt: true,
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    res.json({ data: registrations });
  });

  return router;
}

/** /api/users/me/tasks and /api/users/me/registrations. */
export function createMyTasksRouter({ prisma }: AppDependencies): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/tasks', async (req, res) => {
    const query = myTasksQuery.parse(req.query);
    const where: Prisma.VolunteerTaskWhereInput = {
      createdById: currentUser(req).id,
      ...(query.status && { status: query.status }),
      ...(query.moderationStatus && { moderationStatus: query.moderationStatus }),
    };
    const [rows, total] = await Promise.all([
      prisma.volunteerTask.findMany({
        where,
        include: taskDetailInclude,
        orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
        ...toSkipTake(query),
      }),
      prisma.volunteerTask.count({ where }),
    ]);
    res.json({
      data: rows.map((row) => serializeTask(row, { own: true })),
      meta: pageMeta(query, total),
    });
  });

  router.get('/registrations', async (req, res) => {
    const query = myRegistrationsQuery.parse(req.query);
    const where: Prisma.TaskRegistrationWhereInput = {
      userId: currentUser(req).id,
      ...(query.status && { status: query.status }),
      ...(query.upcomingOnly && { task: { startsAt: { gt: new Date() } } }),
    };
    const [rows, total] = await Promise.all([
      prisma.taskRegistration.findMany({
        where,
        select: {
          id: true,
          status: true,
          createdAt: true,
          cancelledAt: true,
          task: {
            select: {
              id: true,
              title: true,
              region: true,
              location: true,
              startsAt: true,
              endsAt: true,
              status: true,
              moderationStatus: true,
              publishedAt: true,
            },
          },
        },
        orderBy: [{ task: { startsAt: 'asc' } }, { id: 'asc' }],
        ...toSkipTake(query),
      }),
      prisma.taskRegistration.count({ where }),
    ]);
    res.json({ data: rows, meta: pageMeta(query, total) });
  });

  return router;
}

/** /api/admin/tasks: the moderation queue and decisions. */
export function createTasksAdminRouter({ prisma }: AppDependencies): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const query = adminListTasksQuery.parse(req.query);
    const where: Prisma.VolunteerTaskWhereInput = {
      ...(query.moderationStatus && { moderationStatus: query.moderationStatus }),
      ...(query.status && { status: query.status }),
      ...taskTextSearch(query.q),
    };
    const [rows, total] = await Promise.all([
      prisma.volunteerTask.findMany({
        where,
        include: taskDetailInclude,
        orderBy: taskOrderBy(query.sort),
        ...toSkipTake(query),
      }),
      prisma.volunteerTask.count({ where }),
    ]);
    res.json({
      data: rows.map((row) => serializeTask(row, { own: true })),
      meta: pageMeta(query, total),
    });
  });

  router.post('/:id/approve', async (req, res) => {
    const id = parseId(req.params.id);
    await approveTask(prisma, id, approveBody.parse(req.body ?? {}), currentUser(req));
    res.json({ data: await detail(prisma, id, req) });
  });

  router.post('/:id/reject', async (req, res) => {
    const id = parseId(req.params.id);
    await rejectTask(prisma, id, rejectBody.parse(req.body), currentUser(req));
    res.json({ data: await detail(prisma, id, req) });
  });

  return router;
}
