import { Router } from 'express';
import { z } from 'zod';
import type { AppDependencies } from '../../deps.js';
import { AppError, ErrorCodes, errors } from '../../lib/errors.js';
import { parseId, queryBoolean, text } from '../../lib/http.js';
import { isUniqueViolation, type DbClient } from '../../lib/prisma.js';
import { currentUser, isAdmin } from '../../middleware/auth.js';
import { AuditActions, writeAudit } from '../audit/audit.service.js';

const slug = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'lowercase letters, digits and dashes only')
  .max(80);

export const createCategoryBody = z.object({ name: text(2, 80), slug }).strict();
export const updateCategoryBody = z
  .object({ name: text(2, 80), slug, isActive: z.boolean() })
  .partial()
  .strict();

export const includeInactiveQuery = z.object({ includeInactive: queryBoolean });

const categorySelect = { id: true, name: true, slug: true, isActive: true } as const;

function duplicateName(error: unknown): never {
  if (isUniqueViolation(error)) {
    throw new AppError(409, ErrorCodes.ALREADY_EXISTS, 'The name or slug is already in use.');
  }
  throw error;
}

export function createCategoriesRouter({ prisma }: AppDependencies): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const { includeInactive } = includeInactiveQuery.parse(req.query);
    const all = includeInactive && isAdmin(req.user);
    const categories = await prisma.category.findMany({
      where: all ? {} : { isActive: true },
      select: categorySelect,
      orderBy: { name: 'asc' },
    });
    res.json({ data: categories });
  });

  return router;
}

export function createCategoriesAdminRouter({ prisma }: AppDependencies): Router {
  const router = Router();

  router.post('/', async (req, res) => {
    const body = createCategoryBody.parse(req.body);
    const admin = currentUser(req);
    const category = await prisma
      .$transaction(async (tx) => {
        const created = await tx.category.create({ data: body, select: categorySelect });
        await writeAudit(tx, {
          actorId: admin.id,
          action: AuditActions.CATEGORY_CREATED,
          entityType: 'Category',
          entityId: created.id,
          metadata: { name: created.name },
        });
        return created;
      })
      .catch(duplicateName);
    res.status(201).json({ data: category });
  });

  router.patch('/:id', async (req, res) => {
    const id = parseId(req.params.id);
    const body = updateCategoryBody.parse(req.body);
    const admin = currentUser(req);
    const category = await prisma
      .$transaction(async (tx) => {
        if (!(await tx.category.findUnique({ where: { id } }))) throw errors.notFound('Category');
        const updated = await tx.category.update({
          where: { id },
          data: body,
          select: categorySelect,
        });
        await writeAudit(tx, {
          actorId: admin.id,
          action: AuditActions.CATEGORY_UPDATED,
          entityType: 'Category',
          entityId: id,
          metadata: { changes: body },
        });
        return updated;
      })
      .catch(duplicateName);
    res.json({ data: category });
  });

  return router;
}

export async function assertActiveCategory(db: DbClient, categoryId: string): Promise<void> {
  const category = await db.category.findUnique({
    where: { id: categoryId },
    select: { isActive: true },
  });
  if (!category?.isActive) {
    throw errors.badRequest('Unknown or inactive category.', { field: 'categoryId' });
  }
}
