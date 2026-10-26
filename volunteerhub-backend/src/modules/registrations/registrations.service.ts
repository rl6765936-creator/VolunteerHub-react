import { AppError, ErrorCodes, errors } from '../../lib/errors.js';
import { lockVolunteerTask } from '../../lib/locks.js';
import { isUniqueViolation, type Db } from '../../lib/prisma.js';
import type { AuthUser } from '../../middleware/auth.js';
import { recordStatusChange } from '../history/history.service.js';
import { notify, quote } from '../notifications/notifications.service.js';
import { loadVisibleTask } from '../tasks/taskAccess.js';

const alreadyRegistered = () =>
  new AppError(409, ErrorCodes.ALREADY_EXISTS, 'You are already registered for this task.');

export async function register(prisma: Db, taskId: string, user: AuthUser) {
  try {
    return await prisma.$transaction(async (tx) => {
      if (!(await lockVolunteerTask(tx, taskId))) throw errors.notFound('Task');
      const { task, access } = await loadVisibleTask(tx, taskId, user);
      if (access.isOwner) throw errors.forbidden('You cannot register for your own task.');
      if (
        task.moderationStatus !== 'APPROVED' ||
        task.status !== 'OPEN' ||
        task.startsAt <= new Date()
      ) {
        throw errors.conflict(
          ErrorCodes.INVALID_STATE,
          'This task is not open for registration right now.',
        );
      }
      if (access.myRegistration?.status === 'CONFIRMED') throw alreadyRegistered();
      if (task._count.registrations >= task.capacity) {
        throw new AppError(409, ErrorCodes.TASK_FULL, 'This task is full.');
      }
      const registration = await tx.taskRegistration.create({
        data: { taskId, userId: user.id, status: 'CONFIRMED' },
        select: { id: true, taskId: true, status: true, createdAt: true, cancelledAt: true },
      });
      await recordStatusChange(tx, {
        entityType: 'TASK_REGISTRATION',
        entityId: registration.id,
        field: 'STATUS',
        fromStatus: null,
        toStatus: 'CONFIRMED',
        actorId: user.id,
      });
      await notify(tx, [task.createdById], {
        type: 'REGISTRATION_CREATED',
        entityType: 'VolunteerTask',
        entityId: taskId,
        message: `${user.name} registered for your task ${quote(task.title)}.`,
      });
      return registration;
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw alreadyRegistered();
    throw error;
  }
}

export async function cancelRegistration(prisma: Db, taskId: string, user: AuthUser) {
  return prisma.$transaction(async (tx) => {
    if (!(await lockVolunteerTask(tx, taskId))) throw errors.notFound('Task');
    const { task, access } = await loadVisibleTask(tx, taskId, user);
    const mine = access.myRegistration;
    if (mine?.status !== 'CONFIRMED') throw errors.notFound('Registration');
    if (task.status !== 'OPEN' || task.startsAt <= new Date()) {
      throw errors.conflict(
        ErrorCodes.INVALID_STATE,
        'Registrations can only be cancelled before an open task starts.',
      );
    }
    const registration = await tx.taskRegistration.update({
      where: { id: mine.id },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
      select: { id: true, taskId: true, status: true, createdAt: true, cancelledAt: true },
    });
    await recordStatusChange(tx, {
      entityType: 'TASK_REGISTRATION',
      entityId: mine.id,
      field: 'STATUS',
      fromStatus: 'CONFIRMED',
      toStatus: 'CANCELLED',
      actorId: user.id,
    });
    await notify(tx, [task.createdById], {
      type: 'REGISTRATION_CANCELLED',
      entityType: 'VolunteerTask',
      entityId: taskId,
      message: `${user.name} cancelled their registration for ${quote(task.title)}.`,
    });
    return registration;
  });
}
