import type { Prisma } from '../../generated/prisma/client.js';
import { errors } from '../../lib/errors.js';
import type { DbClient } from '../../lib/prisma.js';
import type { AuthUser } from '../../middleware/auth.js';

export const taskDetailInclude = {
  category: { select: { id: true, name: true, slug: true } },
  createdBy: { select: { id: true, name: true } },
  _count: { select: { registrations: { where: { status: 'CONFIRMED' } } } },
} satisfies Prisma.VolunteerTaskInclude;

export type TaskDetail = Prisma.VolunteerTaskGetPayload<{ include: typeof taskDetailInclude }>;

export interface TaskAccess {
  isOwner: boolean;
  isAdmin: boolean;
  myRegistration: { id: string; status: string; createdAt: Date; cancelledAt: Date | null } | null;
}

export async function loadVisibleTask(
  db: DbClient,
  id: string,
  user: AuthUser | undefined,
): Promise<{ task: TaskDetail; access: TaskAccess }> {
  const task = await db.volunteerTask.findUnique({ where: { id }, include: taskDetailInclude });
  if (!task) throw errors.notFound('Task');
  const myRegistration = user
    ? await db.taskRegistration.findFirst({
        where: { taskId: id, userId: user.id },
        select: { id: true, status: true, createdAt: true, cancelledAt: true },
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      })
    : null;
  const access: TaskAccess = {
    isOwner: user?.id === task.createdById,
    isAdmin: user?.role === 'ADMIN',
    myRegistration,
  };
  const visible =
    task.moderationStatus === 'APPROVED' ||
    access.isOwner ||
    access.isAdmin ||
    myRegistration !== null;
  if (!visible) throw errors.notFound('Task');
  return { task, access };
}

export const confirmedCount = (task: TaskDetail) => task._count.registrations;

export function isRegistrationOpen(
  task: Pick<TaskDetail, 'moderationStatus' | 'status' | 'startsAt' | 'capacity'>,
  confirmed: number,
  now = new Date(),
): boolean {
  return (
    task.moderationStatus === 'APPROVED' &&
    task.status === 'OPEN' &&
    task.startsAt > now &&
    confirmed < task.capacity
  );
}
