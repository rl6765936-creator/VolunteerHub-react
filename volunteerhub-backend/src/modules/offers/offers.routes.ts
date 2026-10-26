import { Router } from 'express';
import type { AppDependencies } from '../../deps.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { parseId } from '../../lib/http.js';
import { pageMeta, toSkipTake } from '../../lib/pagination.js';
import type { Db } from '../../lib/prisma.js';
import { currentUser, requireAuth, type AuthUser } from '../../middleware/auth.js';
import { writeRateLimiter } from '../../middleware/security.js';
import { loadVisibleRequest } from '../requests/requestAccess.js';
import { createOfferBody, myOffersQuery } from './offers.schemas.js';
import {
  acceptOffer,
  createOffer,
  declineOffer,
  offerSelect,
  serializeOffer,
  withdrawOffer,
} from './offers.service.js';

async function offerView(prisma: Db, id: string, user: AuthUser) {
  const offer = await prisma.helpOffer.findUniqueOrThrow({ where: { id }, select: offerSelect });
  const { access } = await loadVisibleRequest(prisma, offer.requestId, user);
  return serializeOffer(offer, { showContact: access.isOwner || access.isAdmin });
}

export function createOffersRouter({ env, prisma }: AppDependencies): Router {
  const router = Router();

  router.post('/requests/:id/offers', requireAuth, writeRateLimiter(env), async (req, res) => {
    const user = currentUser(req);
    const id = await createOffer(
      prisma,
      parseId(req.params.id),
      createOfferBody.parse(req.body),
      user,
    );
    res.status(201).json({ data: await offerView(prisma, id, user) });
  });

  router.get('/requests/:id/offers', requireAuth, async (req, res) => {
    const user = currentUser(req);
    const requestId = parseId(req.params.id);
    const { access } = await loadVisibleRequest(prisma, requestId, user);
    const ownerView = access.isOwner || access.isAdmin;
    const offers = await prisma.helpOffer.findMany({
      where: { requestId, ...(!ownerView && { volunteerId: user.id }) },
      select: offerSelect,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    res.json({ data: offers.map((offer) => serializeOffer(offer, { showContact: ownerView })) });
  });

  router.post('/offers/:id/accept', requireAuth, async (req, res) => {
    const id = parseId(req.params.id);
    await acceptOffer(prisma, id, currentUser(req));
    res.json({ data: await offerView(prisma, id, currentUser(req)) });
  });

  router.post('/offers/:id/decline', requireAuth, async (req, res) => {
    const id = parseId(req.params.id);
    await declineOffer(prisma, id, currentUser(req));
    res.json({ data: await offerView(prisma, id, currentUser(req)) });
  });

  router.post('/offers/:id/withdraw', requireAuth, async (req, res) => {
    const id = parseId(req.params.id);
    await withdrawOffer(prisma, id, currentUser(req));
    res.json({ data: await offerView(prisma, id, currentUser(req)) });
  });

  router.get('/users/me/offers', requireAuth, async (req, res) => {
    const query = myOffersQuery.parse(req.query);
    const where: Prisma.HelpOfferWhereInput = {
      volunteerId: currentUser(req).id,
      ...(query.status && { status: query.status }),
    };
    const [offers, total] = await Promise.all([
      prisma.helpOffer.findMany({
        where,
        select: {
          ...offerSelect,
          request: {
            select: {
              id: true,
              title: true,
              region: true,
              status: true,
              moderationStatus: true,
              neededBy: true,
            },
          },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        ...toSkipTake(query),
      }),
      prisma.helpOffer.count({ where }),
    ]);
    res.json({
      data: offers.map(({ request, ...offer }) => ({
        ...serializeOffer(offer, { showContact: false }),
        request,
      })),
      meta: pageMeta(query, total),
    });
  });

  return router;
}
