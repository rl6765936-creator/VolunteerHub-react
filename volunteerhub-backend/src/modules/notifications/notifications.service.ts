import type { NotificationType } from '../../generated/prisma/enums.js';
import type { DbClient } from '../../lib/prisma.js';

export interface NotificationInput {
  type: NotificationType;
  entityType: 'HelpRequest' | 'VolunteerTask';
  entityId: string;
  message: string;
}

const MAX_MESSAGE = 300;

export function quote(title: string, max = 80): string {
  return `"${title.length > max ? `${title.slice(0, max - 1)}…` : title}"`;
}

export async function notify(
  db: DbClient,
  recipientIds: (string | null | undefined)[],
  input: NotificationInput,
  actorId?: string,
): Promise<void> {
  const ids = [...new Set(recipientIds)].filter(
    (id): id is string => typeof id === 'string' && id !== actorId,
  );
  if (ids.length === 0) return;
  await db.notification.createMany({
    data: ids.map((userId) => ({
      userId,
      type: input.type,
      entityType: input.entityType,
      entityId: input.entityId,
      message: input.message.slice(0, MAX_MESSAGE),
    })),
  });
}
