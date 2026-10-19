import type { HistoryEntityType, HistoryField } from '../../generated/prisma/enums.js';
import type { DbClient } from '../../lib/prisma.js';
import { publicUserSelect } from '../users/users.dto.js';

export interface StatusChange {
  entityType: HistoryEntityType;
  entityId: string;
  field: HistoryField;
  fromStatus: string | null;
  toStatus: string;
  actorId: string;
  note?: string | null;
}

/** Appends one row to the status history. Call it inside the transaction of the change. */
export async function recordStatusChange(db: DbClient, change: StatusChange): Promise<void> {
  await db.statusHistory.create({ data: { ...change, note: change.note ?? null } });
}

/** The full history of one entity, oldest first, with the actor's display name. */
export function listHistory(db: DbClient, entityType: HistoryEntityType, entityIds: string[]) {
  return db.statusHistory.findMany({
    where: { entityType, entityId: { in: entityIds } },
    select: {
      id: true,
      entityType: true,
      entityId: true,
      field: true,
      fromStatus: true,
      toStatus: true,
      note: true,
      createdAt: true,
      actor: { select: publicUserSelect },
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
}
