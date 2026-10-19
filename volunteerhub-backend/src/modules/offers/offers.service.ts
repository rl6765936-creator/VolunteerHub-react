import type { z } from 'zod';
import type { Prisma } from '../../generated/prisma/client.js';
import { AppError, ErrorCodes, errors } from '../../lib/errors.js';
import { lockHelpRequest } from '../../lib/locks.js';
import { isUniqueViolation, type Db, type DbClient } from '../../lib/prisma.js';
import type { AuthUser } from '../../middleware/auth.js';
import { recordStatusChange } from '../history/history.service.js';
import { notify, quote } from '../notifications/notifications.service.js';
import { loadVisibleRequest } from '../requests/requestAccess.js';
import { declineOffers } from '../requests/requests.service.js';
import type { createOfferBody } from './offers.schemas.js';

export const offerSelect = {
  id: true,
  requestId: true,
  status: true,
  message: true,
  createdAt: true,
  decidedAt: true,
  withdrawnAt: true,
  volunteer: {
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      // Skills and region help the owner choose. Availability is private and never selected.
      volunteerProfile: { select: { skills: true, region: true } },
    },
  },
} satisfies Prisma.HelpOfferSelect;

type OfferRow = Prisma.HelpOfferGetPayload<{ select: typeof offerSelect }>;

/** Contact details of the volunteer appear only on an accepted offer, for the owner and admins. */
export function serializeOffer(offer: OfferRow, options: { showContact: boolean }) {
  const { volunteer } = offer;
  return {
    id: offer.id,
    requestId: offer.requestId,
    status: offer.status,
    message: offer.message,
    createdAt: offer.createdAt,
    decidedAt: offer.decidedAt,
    withdrawnAt: offer.withdrawnAt,
    volunteer: {
      id: volunteer.id,
      name: volunteer.name,
      skills: volunteer.volunteerProfile?.skills ?? [],
      region: volunteer.volunteerProfile?.region ?? null,
    },
    contact:
      options.showContact && offer.status === 'ACCEPTED'
        ? { email: volunteer.email, phone: volunteer.phone }
        : null,
  };
}

/**
 * Any user except the owner can offer help on an approved, open request: one active
 * (pending or accepted) offer per volunteer, also enforced by a partial unique index.
 */
export async function createOffer(
  prisma: Db,
  requestId: string,
  input: z.output<typeof createOfferBody>,
  user: AuthUser,
) {
  try {
    return await prisma.$transaction(async (tx) => {
      if (!(await lockHelpRequest(tx, requestId))) throw errors.notFound('Help request');
      const { request, access } = await loadVisibleRequest(tx, requestId, user);
      if (access.isOwner) throw errors.forbidden('You cannot offer help on your own request.');
      if (request.moderationStatus !== 'APPROVED' || request.status !== 'OPEN') {
        throw errors.conflict(
          ErrorCodes.INVALID_STATE,
          'This request is not open for offers right now.',
        );
      }
      if (access.myOffer?.status === 'PENDING' || access.myOffer?.status === 'ACCEPTED') {
        throw alreadyOffered();
      }
      const offer = await tx.helpOffer.create({
        data: { requestId, volunteerId: user.id, message: input.message },
        select: { id: true },
      });
      await recordStatusChange(tx, {
        entityType: 'HELP_OFFER',
        entityId: offer.id,
        field: 'STATUS',
        fromStatus: null,
        toStatus: 'PENDING',
        actorId: user.id,
      });
      await notify(tx, [request.ownerId], {
        type: 'OFFER_RECEIVED',
        entityType: 'HelpRequest',
        entityId: requestId,
        message: `${user.name} offered to help with your request ${quote(request.title)}.`,
      });
      return offer.id;
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw alreadyOffered();
    throw error;
  }
}

const alreadyOffered = () =>
  new AppError(409, ErrorCodes.ALREADY_EXISTS, 'You already have an active offer on this request.');

/** Loads an offer the user is involved in (volunteer, request owner or admin); 404 otherwise. */
async function loadOffer(db: DbClient, id: string, user: AuthUser) {
  const offer = await db.helpOffer.findUnique({
    where: { id },
    select: { id: true, status: true, requestId: true, volunteerId: true },
  });
  if (!offer) throw errors.notFound('Offer');
  const { request, access } = await loadVisibleRequest(db, offer.requestId, user).catch(() => {
    throw errors.notFound('Offer');
  });
  const isVolunteer = offer.volunteerId === user.id;
  if (!isVolunteer && !access.isOwner && !access.isAdmin) throw errors.notFound('Offer');
  return { offer, request, access, isVolunteer };
}

/**
 * The request owner accepts exactly one offer. Under a row lock on the request: the offer
 * becomes ACCEPTED, every other pending offer is DECLINED and the request moves to
 * IN_PROGRESS. A partial unique index guarantees one accepted offer even if this were
 * bypassed. Acceptance is separate from publication: the request must be approved.
 */
export async function acceptOffer(prisma: Db, offerId: string, user: AuthUser) {
  const requestId = await offerRequestId(prisma, offerId);
  return prisma.$transaction(async (tx) => {
    await lockHelpRequest(tx, requestId);
    const { offer, request, access } = await loadOffer(tx, offerId, user);
    if (!access.isOwner) throw errors.forbidden('Only the owner of the request can accept offers.');
    if (request.moderationStatus !== 'APPROVED' || request.status !== 'OPEN') {
      throw errors.conflict(
        ErrorCodes.INVALID_STATE,
        'Offers can only be accepted on an approved, open request.',
      );
    }
    if (offer.status !== 'PENDING') {
      throw errors.conflict(ErrorCodes.INVALID_TRANSITION, 'Only a pending offer can be accepted.');
    }
    const now = new Date();
    await tx.helpOffer.update({
      where: { id: offerId },
      data: { status: 'ACCEPTED', decidedAt: now },
    });
    await recordStatusChange(tx, {
      entityType: 'HELP_OFFER',
      entityId: offerId,
      field: 'STATUS',
      fromStatus: 'PENDING',
      toStatus: 'ACCEPTED',
      actorId: user.id,
    });
    const others = await tx.helpOffer.findMany({
      where: { requestId, status: 'PENDING', id: { not: offerId } },
      select: { id: true, volunteerId: true },
    });
    await declineOffers(tx, others, user.id, 'Another offer was accepted.', now);

    await tx.helpRequest.update({ where: { id: requestId }, data: { status: 'IN_PROGRESS' } });
    await recordStatusChange(tx, {
      entityType: 'HELP_REQUEST',
      entityId: requestId,
      field: 'STATUS',
      fromStatus: 'OPEN',
      toStatus: 'IN_PROGRESS',
      actorId: user.id,
      note: 'An offer was accepted.',
    });

    await notify(tx, [offer.volunteerId], {
      type: 'OFFER_ACCEPTED',
      entityType: 'HelpRequest',
      entityId: requestId,
      message: `Your offer to help with ${quote(request.title)} was accepted. You can now see the contact details.`,
    });
    await notify(
      tx,
      others.map((other) => other.volunteerId),
      {
        type: 'OFFER_DECLINED',
        entityType: 'HelpRequest',
        entityId: requestId,
        message: `Another volunteer was chosen for ${quote(request.title)}. Thank you for offering!`,
      },
    );
  });
}

export async function declineOffer(prisma: Db, offerId: string, user: AuthUser) {
  const requestId = await offerRequestId(prisma, offerId);
  await prisma.$transaction(async (tx) => {
    await lockHelpRequest(tx, requestId);
    const { offer, request, access } = await loadOffer(tx, offerId, user);
    if (!access.isOwner)
      throw errors.forbidden('Only the owner of the request can decline offers.');
    if (offer.status !== 'PENDING') {
      throw errors.conflict(ErrorCodes.INVALID_TRANSITION, 'Only a pending offer can be declined.');
    }
    await declineOffers(tx, [offer], user.id, 'Declined by the request owner.', new Date());
    await notify(tx, [offer.volunteerId], {
      type: 'OFFER_DECLINED',
      entityType: 'HelpRequest',
      entityId: requestId,
      message: `Your offer to help with ${quote(request.title)} was declined.`,
    });
  });
}

/** The volunteer withdraws their own pending offer. Accepted offers cannot be withdrawn. */
export async function withdrawOffer(prisma: Db, offerId: string, user: AuthUser) {
  const requestId = await offerRequestId(prisma, offerId);
  await prisma.$transaction(async (tx) => {
    await lockHelpRequest(tx, requestId);
    const { offer, request, isVolunteer } = await loadOffer(tx, offerId, user);
    if (!isVolunteer) throw errors.forbidden('Only the volunteer can withdraw this offer.');
    if (offer.status !== 'PENDING') {
      throw errors.conflict(
        ErrorCodes.INVALID_TRANSITION,
        'Only a pending offer can be withdrawn. After acceptance, contact the requester.',
      );
    }
    await tx.helpOffer.update({
      where: { id: offerId },
      data: { status: 'WITHDRAWN', withdrawnAt: new Date() },
    });
    await recordStatusChange(tx, {
      entityType: 'HELP_OFFER',
      entityId: offerId,
      field: 'STATUS',
      fromStatus: 'PENDING',
      toStatus: 'WITHDRAWN',
      actorId: user.id,
    });
    await notify(tx, [request.ownerId], {
      type: 'OFFER_WITHDRAWN',
      entityType: 'HelpRequest',
      entityId: requestId,
      message: `${user.name} withdrew their offer for ${quote(request.title)}.`,
    });
  });
}

async function offerRequestId(prisma: Db, offerId: string): Promise<string> {
  const offer = await prisma.helpOffer.findUnique({
    where: { id: offerId },
    select: { requestId: true },
  });
  if (!offer) throw errors.notFound('Offer');
  return offer.requestId;
}
