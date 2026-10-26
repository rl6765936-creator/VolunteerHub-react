import type { DbClient } from './prisma.js';

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
