import type { Prisma } from '../../generated/prisma/client.js';
import { errors } from '../../lib/errors.js';
import type { DbClient } from '../../lib/prisma.js';
import type { AuthUser } from '../../middleware/auth.js';
import { contactUserSelect } from '../users/users.dto.js';

export const requestDetailInclude = {
  category: { select: { id: true, name: true, slug: true } },
  owner: { select: contactUserSelect },
  offers: {
    where: { status: { in: ['PENDING', 'ACCEPTED'] } },
    select: { id: true, status: true, volunteer: { select: contactUserSelect } },
  },
  _count: { select: { attachments: true } },
} satisfies Prisma.HelpRequestInclude;

export type RequestDetail = Prisma.HelpRequestGetPayload<{ include: typeof requestDetailInclude }>;

export interface RequestAccess {
  isOwner: boolean;
  isAdmin: boolean;
  myOffer: { id: string; status: string } | null;
  isAcceptedVolunteer: boolean;
}

export async function loadVisibleRequest(
  db: DbClient,
  id: string,
  user: AuthUser | undefined,
): Promise<{ request: RequestDetail; access: RequestAccess }> {
  const request = await db.helpRequest.findUnique({ where: { id }, include: requestDetailInclude });
  if (!request) throw errors.notFound('Help request');

  const myOffer = user
    ? await db.helpOffer.findFirst({
        where: { requestId: id, volunteerId: user.id },
        select: { id: true, status: true },
        orderBy: { createdAt: 'desc' },
      })
    : null;
  const access: RequestAccess = {
    isOwner: user?.id === request.ownerId,
    isAdmin: user?.role === 'ADMIN',
    myOffer,
    isAcceptedVolunteer: request.offers.some(
      (offer) => offer.status === 'ACCEPTED' && offer.volunteer.id === user?.id,
    ),
  };
  const visible =
    request.moderationStatus === 'APPROVED' || access.isOwner || access.isAdmin || myOffer !== null;
  if (!visible) throw errors.notFound('Help request');
  return { request, access };
}

export async function loadOwnRequest(db: DbClient, id: string, user: AuthUser) {
  const { request, access } = await loadVisibleRequest(db, id, user);
  if (!access.isOwner) throw errors.forbidden('Only the owner of this request can do that.');
  return request;
}
