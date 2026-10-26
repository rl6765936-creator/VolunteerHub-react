import type { z } from 'zod';
import type { Prisma } from '../../generated/prisma/client.js';
import { AppError, ErrorCodes, errors } from '../../lib/errors.js';
import { lockVolunteerTask } from '../../lib/locks.js';
import type { Db, DbClient } from '../../lib/prisma.js';
import type { AuthUser } from '../../middleware/auth.js';
import { AuditActions, writeAudit } from '../audit/audit.service.js';
import { assertActiveCategory } from '../categories/categories.routes.js';
import { recordStatusChange } from '../history/history.service.js';
import type { approveBody, cancelBody, rejectBody } from '../moderation/moderation.schemas.js';
import { notify, quote } from '../notifications/notifications.service.js';
import { loadVisibleTask } from './taskAccess.js';
import {
  MATERIAL_TASK_FIELDS,
  type createTaskBody,
  type taskSort,
  type updateTaskBody,
} from './tasks.schemas.js';

export function taskOrderBy(
  sort: z.output<typeof taskSort>,
): Prisma.VolunteerTaskOrderByWithRelationInput[] {
  if (sort === 'newest') return [{ createdAt: 'desc' }, { id: 'asc' }];
  return [{ startsAt: 'asc' }, { id: 'asc' }];
}

export function taskTextSearch(q: string | undefined): Prisma.VolunteerTaskWhereInput {
  if (!q) return {};
  return {
    OR: [
      { title: { contains: q, mode: 'insensitive' } },
      { description: { contains: q, mode: 'insensitive' } },
      { location: { contains: q, mode: 'insensitive' } },
    ],
  };
}

export async function fullTaskIds(db: DbClient): Promise<string[]> {
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT t."id"
    FROM "VolunteerTask" t
    JOIN "TaskRegistration" r ON r."taskId" = t."id" AND r."status" = 'CONFIRMED'
    GROUP BY t."id", t."capacity"
    HAVING count(*) >= t."capacity"`;
  return rows.map((row) => row.id);
}

const confirmedRegistrantIds = async (db: DbClient, taskId: string) =>
  (
    await db.taskRegistration.findMany({
      where: { taskId, status: 'CONFIRMED' },
      select: { userId: true },
    })
  ).map((registration) => registration.userId);

export async function createTask(
  prisma: Db,
  input: z.output<typeof createTaskBody>,
  user: AuthUser,
) {
  await assertActiveCategory(prisma, input.categoryId);
  return prisma.$transaction(async (tx) => {
    const task = await tx.volunteerTask.create({
      data: { ...input, createdById: user.id, moderationStatus: 'PENDING_REVIEW', status: 'OPEN' },
      select: { id: true },
    });
    await recordStatusChange(tx, {
      entityType: 'VOLUNTEER_TASK',
      entityId: task.id,
      field: 'MODERATION',
      fromStatus: null,
      toStatus: 'PENDING_REVIEW',
      actorId: user.id,
      note: 'Created',
    });
    return task.id;
  });
}

const FIELD_LABELS: Record<(typeof MATERIAL_TASK_FIELDS)[number], string> = {
  title: 'title',
  description: 'description',
  categoryId: 'category',
  region: 'region',
  location: 'location',
  startsAt: 'start time',
  endsAt: 'end time',
};

export async function updateTask(
  prisma: Db,
  id: string,
  input: z.output<typeof updateTaskBody>,
  user: AuthUser,
) {
  return prisma.$transaction(async (tx) => {
    if (!(await lockVolunteerTask(tx, id))) throw errors.notFound('Task');
    const { task, access } = await loadVisibleTask(tx, id, user);
    if (!access.isOwner) throw errors.forbidden('Only the creator of this task can edit it.');
    if (task.status !== 'OPEN' || task.startsAt <= new Date()) {
      throw errors.conflict(
        ErrorCodes.INVALID_STATE,
        'A task can only be edited while it is open and has not started.',
      );
    }

    const startsAt = input.startsAt ?? task.startsAt;
    const endsAt = input.endsAt ?? task.endsAt;
    if (endsAt <= startsAt) {
      throw errors.badRequest('The task must end after it starts.', { field: 'endsAt' });
    }
    const confirmed = task._count.registrations;
    if (input.capacity !== undefined && input.capacity < confirmed) {
      throw new AppError(
        409,
        ErrorCodes.CAPACITY_TOO_LOW,
        `Capacity cannot be lower than the ${confirmed} confirmed registrations.`,
        { confirmedRegistrations: confirmed },
      );
    }

    const changed = MATERIAL_TASK_FIELDS.filter((field) => {
      const next = input[field];
      if (next === undefined) return false;
      const current = task[field];
      return next instanceof Date && current instanceof Date
        ? next.getTime() !== current.getTime()
        : next !== current;
    });
    if (changed.includes('categoryId') && input.categoryId) {
      await assertActiveCategory(tx, input.categoryId);
    }
    const capacityChanged = input.capacity !== undefined && input.capacity !== task.capacity;
    if (changed.length === 0 && !capacityChanged) {
      return { id, changedFields: [] as string[], reModeration: false };
    }

    const reModeration = changed.length > 0 && task.moderationStatus !== 'PENDING_REVIEW';
    await tx.volunteerTask.update({
      where: { id },
      data: {
        ...input,
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
        entityType: 'VOLUNTEER_TASK',
        entityId: id,
        field: 'MODERATION',
        fromStatus: task.moderationStatus,
        toStatus: 'PENDING_REVIEW',
        actorId: user.id,
        note: `Edited by the creator (${changed.join(', ')}); waiting for review.`,
      });
    }
    if (changed.length > 0) {
      const what = changed.map((field) => FIELD_LABELS[field]).join(', ');
      await notify(
        tx,
        await confirmedRegistrantIds(tx, id),
        {
          type: 'TASK_UPDATED',
          entityType: 'VolunteerTask',
          entityId: id,
          message: `The task ${quote(task.title)} you registered for was changed (${what}). Your registration is kept; please check the new details.`,
        },
        user.id,
      );
    }
    return {
      id,
      changedFields: [...changed, ...(capacityChanged ? ['capacity'] : [])],
      reModeration,
    };
  });
}

export async function cancelTask(
  prisma: Db,
  id: string,
  input: z.output<typeof cancelBody>,
  user: AuthUser,
) {
  await prisma.$transaction(async (tx) => {
    if (!(await lockVolunteerTask(tx, id))) throw errors.notFound('Task');
    const { task, access } = await loadVisibleTask(tx, id, user);
    if (!access.isOwner && !access.isAdmin) {
      throw errors.forbidden('Only the creator or an admin can cancel this task.');
    }
    if (task.status !== 'OPEN') {
      throw errors.conflict(
        ErrorCodes.INVALID_TRANSITION,
        `A ${task.status.toLowerCase()} task cannot be cancelled.`,
      );
    }
    await tx.volunteerTask.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancellationReason: input.reason ?? null,
      },
    });
    await recordStatusChange(tx, {
      entityType: 'VOLUNTEER_TASK',
      entityId: id,
      field: 'STATUS',
      fromStatus: 'OPEN',
      toStatus: 'CANCELLED',
      actorId: user.id,
      note: input.reason ?? null,
    });
    await notify(
      tx,
      [...(await confirmedRegistrantIds(tx, id)), task.createdById],
      {
        type: 'TASK_CANCELLED',
        entityType: 'VolunteerTask',
        entityId: id,
        message: `The task ${quote(task.title)} was cancelled.${input.reason ? ` Reason: ${input.reason}` : ''}`,
      },
      user.id,
    );
    if (!access.isOwner) {
      await writeAudit(tx, {
        actorId: user.id,
        action: AuditActions.TASK_CANCELLED,
        entityType: 'VolunteerTask',
        entityId: id,
        metadata: { reason: input.reason ?? null },
      });
    }
  });
}

export async function completeTask(prisma: Db, id: string, user: AuthUser) {
  await prisma.$transaction(async (tx) => {
    if (!(await lockVolunteerTask(tx, id))) throw errors.notFound('Task');
    const { task, access } = await loadVisibleTask(tx, id, user);
    if (!access.isOwner && !access.isAdmin) {
      throw errors.forbidden('Only the creator or an admin can complete this task.');
    }
    if (task.status !== 'OPEN' || task.publishedAt === null) {
      throw errors.conflict(
        ErrorCodes.INVALID_TRANSITION,
        'Only an open task that was published can be completed.',
      );
    }
    if (task.startsAt > new Date()) {
      throw errors.conflict(
        ErrorCodes.INVALID_STATE,
        'A task can only be completed after it has started.',
      );
    }
    await tx.volunteerTask.update({
      where: { id },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
    await recordStatusChange(tx, {
      entityType: 'VOLUNTEER_TASK',
      entityId: id,
      field: 'STATUS',
      fromStatus: 'OPEN',
      toStatus: 'COMPLETED',
      actorId: user.id,
    });
    await notify(
      tx,
      await confirmedRegistrantIds(tx, id),
      {
        type: 'TASK_COMPLETED',
        entityType: 'VolunteerTask',
        entityId: id,
        message: `The task ${quote(task.title)} was completed. Thank you for volunteering!`,
      },
      user.id,
    );
    if (!access.isOwner) {
      await writeAudit(tx, {
        actorId: user.id,
        action: AuditActions.TASK_COMPLETED,
        entityType: 'VolunteerTask',
        entityId: id,
      });
    }
  });
}

export async function approveTask(
  prisma: Db,
  id: string,
  input: z.output<typeof approveBody>,
  admin: AuthUser,
) {
  await prisma.$transaction(async (tx) => {
    if (!(await lockVolunteerTask(tx, id))) throw errors.notFound('Task');
    const task = await tx.volunteerTask.findUniqueOrThrow({ where: { id } });
    if (task.moderationStatus !== 'PENDING_REVIEW') {
      throw errors.conflict(ErrorCodes.INVALID_TRANSITION, 'Only pending tasks can be approved.');
    }
    if (task.status !== 'OPEN') {
      throw errors.conflict(ErrorCodes.INVALID_STATE, 'This task is closed.');
    }
    const now = new Date();
    await tx.volunteerTask.update({
      where: { id },
      data: {
        moderationStatus: 'APPROVED',
        rejectionReason: null,
        reviewedAt: now,
        reviewedById: admin.id,
        publishedAt: task.publishedAt ?? now,
      },
    });
    await recordStatusChange(tx, {
      entityType: 'VOLUNTEER_TASK',
      entityId: id,
      field: 'MODERATION',
      fromStatus: 'PENDING_REVIEW',
      toStatus: 'APPROVED',
      actorId: admin.id,
      note: input.note ?? null,
    });
    await writeAudit(tx, {
      actorId: admin.id,
      action: AuditActions.TASK_APPROVED,
      entityType: 'VolunteerTask',
      entityId: id,
      metadata: { reApproval: task.publishedAt !== null },
    });
    await notify(tx, [task.createdById], {
      type: 'TASK_APPROVED',
      entityType: 'VolunteerTask',
      entityId: id,
      message: `Your task ${quote(task.title)} was approved and is now open for registration.`,
    });
  });
}

export async function rejectTask(
  prisma: Db,
  id: string,
  input: z.output<typeof rejectBody>,
  admin: AuthUser,
) {
  await prisma.$transaction(async (tx) => {
    if (!(await lockVolunteerTask(tx, id))) throw errors.notFound('Task');
    const task = await tx.volunteerTask.findUniqueOrThrow({ where: { id } });
    if (task.moderationStatus === 'REJECTED') {
      throw errors.conflict(ErrorCodes.INVALID_TRANSITION, 'This task is already rejected.');
    }
    await tx.volunteerTask.update({
      where: { id },
      data: {
        moderationStatus: 'REJECTED',
        rejectionReason: input.reason,
        reviewedAt: new Date(),
        reviewedById: admin.id,
      },
    });
    await recordStatusChange(tx, {
      entityType: 'VOLUNTEER_TASK',
      entityId: id,
      field: 'MODERATION',
      fromStatus: task.moderationStatus,
      toStatus: 'REJECTED',
      actorId: admin.id,
      note: input.reason,
    });
    await writeAudit(tx, {
      actorId: admin.id,
      action: AuditActions.TASK_REJECTED,
      entityType: 'VolunteerTask',
      entityId: id,
      metadata: { from: task.moderationStatus, reason: input.reason },
    });
    await notify(tx, [task.createdById], {
      type: 'TASK_REJECTED',
      entityType: 'VolunteerTask',
      entityId: id,
      message: `Your task ${quote(task.title)} was not approved. Reason: ${input.reason}`,
    });
    await notify(
      tx,
      await confirmedRegistrantIds(tx, id),
      {
        type: 'TASK_UPDATED',
        entityType: 'VolunteerTask',
        entityId: id,
        message: `The task ${quote(task.title)} you registered for was withdrawn from publication by an admin.`,
      },
      task.createdById,
    );
  });
}
