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
import { loadVisibleRequest } from './requestAccess.js';
import {
  adminListRequestsQuery,
  createRequestBody,
  listRequestsQuery,
  myRequestsQuery,
  updateRequestBody,
} from './requests.schemas.js';
import {
  requestSummaryInclude,
  serializeRequestDetail,
  serializeRequestSummary,
} from './requests.serializer.js';
import {
  approveRequest,
  cancelRequest,
  completeRequest,
  createRequest,
  rejectRequest,
  requestOrderBy,
  textSearch,
  updateRequest,
} from './requests.service.js';

async function detail(prisma: Db, id: string, req: Request) {
  const { request, access } = await loadVisibleRequest(prisma, id, req.user);
  return serializeRequestDetail(request, access);
}

export function createRequestsRouter({ env, prisma }: AppDependencies): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const query = listRequestsQuery.parse(req.query);
    const where: Prisma.HelpRequestWhereInput = {
      moderationStatus: 'APPROVED',
      status: query.status,
      ...(query.categoryId && { categoryId: query.categoryId }),
      ...(query.region && { region: { contains: query.region, mode: 'insensitive' } }),
      ...textSearch(query.q),
    };
    const [rows, total] = await Promise.all([
      prisma.helpRequest.findMany({
        where,
        include: requestSummaryInclude,
        orderBy: requestOrderBy(query.sort),
        ...toSkipTake(query),
      }),
      prisma.helpRequest.count({ where }),
    ]);
    res.json({
      data: rows.map((row) => serializeRequestSummary(row)),
      meta: pageMeta(query, total),
    });
  });

  router.post('/', requireAuth, writeRateLimiter(env), async (req, res) => {
    const id = await createRequest(prisma, createRequestBody.parse(req.body), currentUser(req));
    res.status(201).json({ data: await detail(prisma, id, req) });
  });

  router.get('/:id', async (req, res) => {
    res.json({ data: await detail(prisma, parseId(req.params.id), req) });
  });

  router.patch('/:id', requireAuth, async (req, res) => {
    const id = parseId(req.params.id);
    const result = await updateRequest(
      prisma,
      id,
      updateRequestBody.parse(req.body),
      currentUser(req),
    );
    res.json({
      data: await detail(prisma, id, req),
      meta: { changedFields: result.changed, reModeration: result.reModeration },
    });
  });

  router.post('/:id/cancel', requireAuth, async (req, res) => {
    const id = parseId(req.params.id);
    await cancelRequest(prisma, id, cancelBody.parse(req.body ?? {}), currentUser(req));
    res.json({ data: await detail(prisma, id, req) });
  });

  router.post('/:id/complete', requireAuth, async (req, res) => {
    const id = parseId(req.params.id);
    await completeRequest(prisma, id, currentUser(req));
    res.json({ data: await detail(prisma, id, req) });
  });

  router.get('/:id/history', requireAuth, async (req, res) => {
    const id = parseId(req.params.id);
    const { access } = await loadVisibleRequest(prisma, id, req.user);
    if (!access.isOwner && !access.isAdmin) {
      throw errors.forbidden('Only the owner or an admin can see the history.');
    }
    const offerIds = (
      await prisma.helpOffer.findMany({ where: { requestId: id }, select: { id: true } })
    ).map((offer) => offer.id);
    const [requestHistory, offerHistory] = await Promise.all([
      listHistory(prisma, 'HELP_REQUEST', [id]),
      listHistory(prisma, 'HELP_OFFER', offerIds),
    ]);
    const merged = [...requestHistory, ...offerHistory].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );
    res.json({ data: merged });
  });

  return router;
}

export function createMyRequestsRouter({ prisma }: AppDependencies): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/', async (req, res) => {
    const query = myRequestsQuery.parse(req.query);
    const where: Prisma.HelpRequestWhereInput = {
      ownerId: currentUser(req).id,
      ...(query.status && { status: query.status }),
      ...(query.moderationStatus && { moderationStatus: query.moderationStatus }),
    };
    const [rows, total] = await Promise.all([
      prisma.helpRequest.findMany({
        where,
        include: requestSummaryInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        ...toSkipTake(query),
      }),
      prisma.helpRequest.count({ where }),
    ]);
    res.json({
      data: rows.map((row) => serializeRequestSummary(row, { own: true })),
      meta: pageMeta(query, total),
    });
  });

  return router;
}

export function createRequestsAdminRouter({ prisma }: AppDependencies): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const query = adminListRequestsQuery.parse(req.query);
    const where: Prisma.HelpRequestWhereInput = {
      ...(query.moderationStatus && { moderationStatus: query.moderationStatus }),
      ...(query.status && { status: query.status }),
      ...textSearch(query.q),
    };
    const [rows, total] = await Promise.all([
      prisma.helpRequest.findMany({
        where,
        include: requestSummaryInclude,
        orderBy: requestOrderBy(query.sort),
        ...toSkipTake(query),
      }),
      prisma.helpRequest.count({ where }),
    ]);
    res.json({
      data: rows.map((row) => serializeRequestSummary(row, { own: true })),
      meta: pageMeta(query, total),
    });
  });

  router.post('/:id/approve', async (req, res) => {
    const id = parseId(req.params.id);
    await approveRequest(prisma, id, approveBody.parse(req.body ?? {}), currentUser(req));
    res.json({ data: await detail(prisma, id, req) });
  });

  router.post('/:id/reject', async (req, res) => {
    const id = parseId(req.params.id);
    await rejectRequest(prisma, id, rejectBody.parse(req.body), currentUser(req));
    res.json({ data: await detail(prisma, id, req) });
  });

  return router;
}
