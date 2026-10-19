import { Router } from 'express';
import { z } from 'zod';
import type { AppDependencies } from '../../deps.js';
import { UserRole, UserStatus } from '../../generated/prisma/enums.js';
import { AppError, ErrorCodes, errors } from '../../lib/errors.js';
import { parseId, text } from '../../lib/http.js';
import { pageMeta, paginationQuery, toSkipTake } from '../../lib/pagination.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import { currentUser, requireAuth } from '../../middleware/auth.js';
import { AuditActions, writeAudit } from '../audit/audit.service.js';
import { password } from '../auth/auth.schemas.js';
import { adminUserSelect, meSelect } from './users.dto.js';

/** Digits, spaces, dashes, parentheses and an optional leading "+". */
export const phone = z
  .string()
  .trim()
  .regex(/^\+?[0-9 ()-]{7,30}$/, 'must be a valid phone number');

export const updateMeBody = z
  .object({ name: text(2, 80).optional(), phone: phone.nullable().optional() })
  .strict()
  .refine((body) => Object.keys(body).length > 0, 'Provide at least one field to update.');

export const changePasswordBody = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: password,
});

export const listUsersQuery = paginationQuery.extend({
  q: z.string().trim().max(100).optional(),
  role: z.enum(UserRole).optional(),
  status: z.enum(UserStatus).optional(),
});

export const updateUserBody = z
  .object({ role: z.enum(UserRole).optional(), status: z.enum(UserStatus).optional() })
  .strict()
  .refine((body) => body.role ?? body.status, 'Provide role and/or status.');

export function createUsersRouter({ prisma }: AppDependencies): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/me', async (req, res) => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: currentUser(req).id },
      select: meSelect,
    });
    res.json({ data: user });
  });

  /** Users can change their display name and contact phone. Email, role and status cannot. */
  router.patch('/me', async (req, res) => {
    const body = updateMeBody.parse(req.body);
    const user = await prisma.user.update({
      where: { id: currentUser(req).id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.phone !== undefined && { phone: body.phone }),
      },
      select: meSelect,
    });
    res.json({ data: user });
  });

  router.post('/me/password', async (req, res) => {
    const body = changePasswordBody.parse(req.body);
    const me = currentUser(req);
    const record = await prisma.user.findUniqueOrThrow({
      where: { id: me.id },
      select: { passwordHash: true },
    });
    if (!(await verifyPassword(record.passwordHash, body.currentPassword))) {
      throw new AppError(401, ErrorCodes.INVALID_CREDENTIALS, 'Current password is incorrect.');
    }
    await prisma.user.update({
      where: { id: me.id },
      data: { passwordHash: await hashPassword(body.newPassword) },
    });
    res.status(204).end();
  });

  return router;
}

/** Mounted under /api/admin/users (admin only). */
export function createUsersAdminRouter({ prisma }: AppDependencies): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const query = listUsersQuery.parse(req.query);
    const where = {
      ...(query.role && { role: query.role }),
      ...(query.status && { status: query.status }),
      ...(query.q && {
        OR: [
          { name: { contains: query.q, mode: 'insensitive' as const } },
          { email: { contains: query.q, mode: 'insensitive' as const } },
        ],
      }),
    };
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: adminUserSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        ...toSkipTake(query),
      }),
      prisma.user.count({ where }),
    ]);
    res.json({ data: users, meta: pageMeta(query, total) });
  });

  /** Admins see the full profile, including the private availability. */
  router.get('/:id', async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: parseId(req.params.id) },
      select: {
        ...adminUserSelect,
        volunteerProfile: { include: { interests: { select: { id: true, name: true } } } },
      },
    });
    if (!user) throw errors.notFound('User');
    res.json({ data: user });
  });

  /**
   * Changes a user's role and/or status (block or unblock). Admins cannot change their own
   * account, so VolunteerHub can never be left without an admin by accident.
   */
  router.patch('/:id', async (req, res) => {
    const id = parseId(req.params.id);
    const body = updateUserBody.parse(req.body);
    const admin = currentUser(req);
    if (id === admin.id) {
      throw errors.conflict(ErrorCodes.INVALID_STATE, 'You cannot change your own role or status.');
    }

    const user = await prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({
        where: { id },
        select: { role: true, status: true },
      });
      if (!existing) throw errors.notFound('User');
      const updated = await tx.user.update({
        where: { id },
        data: {
          ...(body.role && { role: body.role }),
          ...(body.status && { status: body.status }),
        },
        select: adminUserSelect,
      });
      if (body.role && existing.role !== body.role) {
        await writeAudit(tx, {
          actorId: admin.id,
          action: AuditActions.USER_ROLE_CHANGED,
          entityType: 'User',
          entityId: id,
          metadata: { from: existing.role, to: body.role },
        });
      }
      if (body.status && existing.status !== body.status) {
        await writeAudit(tx, {
          actorId: admin.id,
          action: AuditActions.USER_STATUS_CHANGED,
          entityType: 'User',
          entityId: id,
          metadata: { from: existing.status, to: body.status },
        });
      }
      return updated;
    });
    res.json({ data: user });
  });

  return router;
}
