import type { z } from 'zod';
import type { Prisma } from '../../generated/prisma/client.js';
import { ErrorCodes, errors } from '../../lib/errors.js';
import { lockHelpRequest } from '../../lib/locks.js';
import type { Db, DbClient } from '../../lib/prisma.js';
import type { AuthUser } from '../../middleware/auth.js';
import { AuditActions, writeAudit } from '../audit/audit.service.js';
import { assertActiveCategory } from '../categories/categories.routes.js';
import { recordStatusChange } from '../history/history.service.js';
import type { approveBody, cancelBody, rejectBody } from '../moderation/moderation.schemas.js';
import { notify, quote } from '../notifications/notifications.service.js';
import { loadVisibleRequest } from './requestAccess.js';
import type { createRequestBody, requestSort, updateRequestBody } from './requests.schemas.js';

type CreateInput = z.output<typeof createRequestBody>;
type UpdateInput = z.output<typeof updateRequestBody>;

export function requestOrderBy(
  sort: z.output<typeof requestSort>,
): Prisma.HelpRequestOrderByWithRelationInput[] {
  if (sort === 'oldest') return [{ createdAt: 'asc' }, { id: 'asc' }];
  if (sort === 'neededBy') {
    return [{ neededBy: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }, { id: 'asc' }];
  }
  return [{ createdAt: 'desc' }, { id: 'asc' }];
}

export function textSearch(q: string | undefined): Prisma.HelpRequestWhereInput {
  if (!q) return {};
  return {
    OR: [
      { title: { contains: q, mode: 'insensitive' } },
      { description: { contains: q, mode: 'insensitive' } },
    ],
  };
}

/** New requests always start as PENDING_REVIEW: nothing is public before an admin approves it. */
export async function createRequest(prisma: Db, input: CreateInput, user: AuthUser) {
  await assertActiveCategory(prisma, input.categoryId);
  return prisma.$transaction(async (tx) => {
    const request = await tx.helpRequest.create({
      data: { ...input, ownerId: user.id, moderationStatus: 'PENDING_REVIEW', status: 'OPEN' },
      select: { id: true },
    });
    await recordStatusChange(tx, {
      entityType: 'HELP_REQUEST',
      entityId: request.id,
      field: 'MODERATION',
      fromStatus: null,
      toStatus: 'PENDING_REVIEW',
      actorId: user.id,
      note: 'Created',
    });
    return request.id;
  });
}

const sameDate = (a: Date | null, b: Date | null) =>
  (a?.getTime() ?? null) === (b?.getTime() ?? null);

/**
 * Owners edit their request only while it is OPEN. Every field is material content, so an
 * approved request goes back to PENDING_REVIEW (hidden publicly, still visible to the owner,
 * admins and users who made offers) and a rejected one is resubmitted. Users with an active
 * offer are notified of the change.
 */
export async function updateRequest(prisma: Db, id: string, input: UpdateInput, user: AuthUser) {
  return prisma.$transaction(async (tx) => {
    if (!(await lockHelpRequest(tx, id))) throw errors.notFound('Help request');
    const { request, access } = await loadVisibleRequest(tx, id, user);
    if (!access.isOwner) throw errors.forbidden('Only the owner of this request can edit it.');
    if (request.status !== 'OPEN') {
      throw errors.conflict(
        ErrorCodes.INVALID_STATE,
        'A request can only be edited while it is open.',
      );
    }

    const changed: string[] = [];
    if (input.title !== undefined && input.title !== request.title) changed.push('title');
    if (input.description !== undefined && input.description !== request.description) {
      changed.push('description');
    }
    if (input.categoryId !== undefined && input.categoryId !== request.categoryId) {
      await assertActiveCategory(tx, input.categoryId);
      changed.push('categoryId');
    }
    if (input.region !== undefined && input.region !== request.region) changed.push('region');
    if (
      input.addressDetails !== undefined &&
      (input.addressDetails ?? null) !== request.addressDetails
    ) {
      changed.push('addressDetails');
    }
    if (input.neededBy !== undefined && !sameDate(input.neededBy, request.neededBy)) {
      changed.push('neededBy');
    }
    if (changed.length === 0) return { id, changed, reModeration: false };

    const reModeration = request.moderationStatus !== 'PENDING_REVIEW';
    await tx.helpRequest.update({
      where: { id },
      data: {
        ...input,
        ...(input.addressDetails !== undefined && { addressDetails: input.addressDetails ?? null }),
        ...(reModeration && {
          moderationStatus: 'PENDING_REVIEW',
          rejectionReason: null,
          reviewedAt: null,
          reviewedById: null,
        }),
      },
    });
    if (reModeration) {
      await recordStatusChange(tx, {
        entityType: 'HELP_REQUEST',
        entityId: id,
        field: 'MODERATION',
        fromStatus: request.moderationStatus,
        toStatus: 'PENDING_REVIEW',
        actorId: user.id,
        note: `Edited by the owner (${changed.join(', ')}); waiting for review.`,
      });
    }
    await notify(
      tx,
      request.offers.map((offer) => offer.volunteer.id),
      {
        type: 'REQUEST_UPDATED',
        entityType: 'HelpRequest',
        entityId: id,
        message: `The help request ${quote(request.title)} you offered to help with was changed (${changed.join(', ')}).`,
      },
      user.id,
    );
    return { id, changed, reModeration };
  });
}

/**
 * The owner or an admin cancels an open or in-progress request. Pending offers are declined,
 * everyone with an active offer is notified, and an admin cancellation is audit-logged.
 */
export async function cancelRequest(
  prisma: Db,
  id: string,
  input: z.output<typeof cancelBody>,
  user: AuthUser,
) {
  await prisma.$transaction(async (tx) => {
    if (!(await lockHelpRequest(tx, id))) throw errors.notFound('Help request');
    const { request, access } = await loadVisibleRequest(tx, id, user);
    if (!access.isOwner && !access.isAdmin) {
      throw errors.forbidden('Only the owner or an admin can cancel this request.');
    }
    if (request.status !== 'OPEN' && request.status !== 'IN_PROGRESS') {
      throw errors.conflict(
        ErrorCodes.INVALID_TRANSITION,
        `A ${request.status.toLowerCase()} request cannot be cancelled.`,
      );
    }
    const now = new Date();
    await tx.helpRequest.update({
      where: { id },
      data: { status: 'CANCELLED', cancelledAt: now },
    });
    await recordStatusChange(tx, {
      entityType: 'HELP_REQUEST',
      entityId: id,
      field: 'STATUS',
      fromStatus: request.status,
      toStatus: 'CANCELLED',
      actorId: user.id,
      note: input.reason ?? null,
    });
    const pending = request.offers.filter((offer) => offer.status === 'PENDING');
    await declineOffers(tx, pending, user.id, 'The request was cancelled.', now);
    await notify(
      tx,
      [...request.offers.map((offer) => offer.volunteer.id), request.ownerId],
      {
        type: 'REQUEST_CANCELLED',
        entityType: 'HelpRequest',
        entityId: id,
        message: `The help request ${quote(request.title)} was cancelled.${input.reason ? ` Reason: ${input.reason}` : ''}`,
      },
      user.id,
    );
    if (!access.isOwner) {
      await writeAudit(tx, {
        actorId: user.id,
        action: AuditActions.REQUEST_CANCELLED,
        entityType: 'HelpRequest',
        entityId: id,
        metadata: { from: request.status, reason: input.reason ?? null },
      });
    }
  });
}

/** Declines pending offers (when another offer is accepted or the request is cancelled). */
export async function declineOffers(
  tx: DbClient,
  offers: { id: string }[],
  actorId: string,
  note: string,
  now: Date,
): Promise<void> {
  if (offers.length === 0) return;
  await tx.helpOffer.updateMany({
    where: { id: { in: offers.map((offer) => offer.id) }, status: 'PENDING' },
    data: { status: 'DECLINED', decidedAt: now },
  });
  for (const offer of offers) {
    await recordStatusChange(tx, {
      entityType: 'HELP_OFFER',
      entityId: offer.id,
      field: 'STATUS',
      fromStatus: 'PENDING',
      toStatus: 'DECLINED',
      actorId,
      note,
    });
  }
}

/** The owner marks an in-progress request (an offer was accepted) as completed. */
export async function completeRequest(prisma: Db, id: string, user: AuthUser) {
  await prisma.$transaction(async (tx) => {
    if (!(await lockHelpRequest(tx, id))) throw errors.notFound('Help request');
    const { request, access } = await loadVisibleRequest(tx, id, user);
    if (!access.isOwner) throw errors.forbidden('Only the owner can complete this request.');
    if (request.status !== 'IN_PROGRESS') {
      throw errors.conflict(
        ErrorCodes.INVALID_TRANSITION,
        'Only a request with an accepted offer can be completed.',
      );
    }
    await tx.helpRequest.update({
      where: { id },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
    await recordStatusChange(tx, {
      entityType: 'HELP_REQUEST',
      entityId: id,
      field: 'STATUS',
      fromStatus: 'IN_PROGRESS',
      toStatus: 'COMPLETED',
      actorId: user.id,
    });
    const accepted = request.offers.find((offer) => offer.status === 'ACCEPTED');
    await notify(tx, [accepted?.volunteer.id], {
      type: 'REQUEST_COMPLETED',
      entityType: 'HelpRequest',
      entityId: id,
      message: `The help request ${quote(request.title)} was marked as completed. Thank you!`,
    });
  });
}

/** PENDING_REVIEW → APPROVED. The first approval sets publishedAt; it is kept on re-approval. */
export async function approveRequest(
  prisma: Db,
  id: string,
  input: z.output<typeof approveBody>,
  admin: AuthUser,
) {
  await prisma.$transaction(async (tx) => {
    if (!(await lockHelpRequest(tx, id))) throw errors.notFound('Help request');
    const request = await tx.helpRequest.findUniqueOrThrow({ where: { id } });
    if (request.moderationStatus !== 'PENDING_REVIEW') {
      throw errors.conflict(
        ErrorCodes.INVALID_TRANSITION,
        'Only pending requests can be approved.',
      );
    }
    if (request.status === 'CANCELLED' || request.status === 'COMPLETED') {
      throw errors.conflict(ErrorCodes.INVALID_STATE, 'This request is closed.');
    }
    const now = new Date();
    await tx.helpRequest.update({
      where: { id },
      data: {
        moderationStatus: 'APPROVED',
        rejectionReason: null,
        reviewedAt: now,
        reviewedById: admin.id,
        publishedAt: request.publishedAt ?? now,
      },
    });
    await recordStatusChange(tx, {
      entityType: 'HELP_REQUEST',
      entityId: id,
      field: 'MODERATION',
      fromStatus: 'PENDING_REVIEW',
      toStatus: 'APPROVED',
      actorId: admin.id,
      note: input.note ?? null,
    });
    await writeAudit(tx, {
      actorId: admin.id,
      action: AuditActions.REQUEST_APPROVED,
      entityType: 'HelpRequest',
      entityId: id,
      metadata: { reApproval: request.publishedAt !== null },
    });
    await notify(tx, [request.ownerId], {
      type: 'REQUEST_APPROVED',
      entityType: 'HelpRequest',
      entityId: id,
      message: `Your help request ${quote(request.title)} was approved and is now published.`,
    });
  });
}

/** PENDING_REVIEW or APPROVED (takedown) → REJECTED, with a reason shown to the owner. */
export async function rejectRequest(
  prisma: Db,
  id: string,
  input: z.output<typeof rejectBody>,
  admin: AuthUser,
) {
  await prisma.$transaction(async (tx) => {
    if (!(await lockHelpRequest(tx, id))) throw errors.notFound('Help request');
    const request = await tx.helpRequest.findUniqueOrThrow({ where: { id } });
    if (request.moderationStatus === 'REJECTED') {
      throw errors.conflict(ErrorCodes.INVALID_TRANSITION, 'This request is already rejected.');
    }
    await tx.helpRequest.update({
      where: { id },
      data: {
        moderationStatus: 'REJECTED',
        rejectionReason: input.reason,
        reviewedAt: new Date(),
        reviewedById: admin.id,
      },
    });
    await recordStatusChange(tx, {
      entityType: 'HELP_REQUEST',
      entityId: id,
      field: 'MODERATION',
      fromStatus: request.moderationStatus,
      toStatus: 'REJECTED',
      actorId: admin.id,
      note: input.reason,
    });
    await writeAudit(tx, {
      actorId: admin.id,
      action: AuditActions.REQUEST_REJECTED,
      entityType: 'HelpRequest',
      entityId: id,
      metadata: { from: request.moderationStatus, reason: input.reason },
    });
    await notify(tx, [request.ownerId], {
      type: 'REQUEST_REJECTED',
      entityType: 'HelpRequest',
      entityId: id,
      message: `Your help request ${quote(request.title)} was not approved. Reason: ${input.reason}`,
    });
  });
}
