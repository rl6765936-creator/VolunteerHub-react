import type { Prisma } from '../../generated/prisma/client.js';
import type { DbClient } from '../../lib/prisma.js';

export const AuditActions = {
  USER_ROLE_CHANGED: 'USER_ROLE_CHANGED',
  USER_STATUS_CHANGED: 'USER_STATUS_CHANGED',
  CATEGORY_CREATED: 'CATEGORY_CREATED',
  CATEGORY_UPDATED: 'CATEGORY_UPDATED',
  REQUEST_APPROVED: 'REQUEST_APPROVED',
  REQUEST_REJECTED: 'REQUEST_REJECTED',
  REQUEST_CANCELLED: 'REQUEST_CANCELLED',
  TASK_APPROVED: 'TASK_APPROVED',
  TASK_REJECTED: 'TASK_REJECTED',
  TASK_CANCELLED: 'TASK_CANCELLED',
  TASK_COMPLETED: 'TASK_COMPLETED',
  ATTACHMENT_DELETED: 'ATTACHMENT_DELETED',
} as const;

export type AuditAction = (typeof AuditActions)[keyof typeof AuditActions];

export interface AuditEntry {
  actorId: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  metadata?: Prisma.InputJsonObject;
}

/** Records a sensitive admin action. Call it inside the same transaction as the action. */
export async function writeAudit(db: DbClient, entry: AuditEntry): Promise<void> {
  await db.auditLog.create({
    data: {
      actorId: entry.actorId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      metadata: entry.metadata ?? {},
    },
  });
}
