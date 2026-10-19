import type { DbClient } from './prisma.js';

/**
 * Row locks (SELECT ... FOR UPDATE) inside an interactive transaction. Every state change
 * of a request or a task takes this lock first, so concurrent registrations, capacity
 * changes, edits, offer acceptances and moderation decisions are serialized per row.
 * Returns false when the row does not exist.
 */
export async function lockHelpRequest(tx: DbClient, id: string): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "HelpRequest" WHERE "id" = ${id}::uuid FOR UPDATE`;
  return rows.length > 0;
}

export async function lockVolunteerTask(tx: DbClient, id: string): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "VolunteerTask" WHERE "id" = ${id}::uuid FOR UPDATE`;
  return rows.length > 0;
}
