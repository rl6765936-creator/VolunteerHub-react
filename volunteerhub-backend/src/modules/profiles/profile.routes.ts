import { Router } from 'express';
import { z } from 'zod';
import type { AppDependencies } from '../../deps.js';
import { Weekday } from '../../generated/prisma/enums.js';
import { errors } from '../../lib/errors.js';
import { optionalText } from '../../lib/http.js';
import { currentUser, requireAuth } from '../../middleware/auth.js';

export const volunteerProfileBody = z
  .object({
    bio: optionalText(1000),
    skills: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
    region: optionalText(80),
    availableDays: z
      .array(z.enum(Weekday))
      .max(7)
      .default([])
      .refine((days) => new Set(days).size === days.length, 'Days must not repeat.'),
    availabilityNotes: optionalText(500),
    interestCategoryIds: z.array(z.uuid()).max(20).default([]),
  })
  .strict();

/** The full profile, including the private availability. Only for the user and admins. */
export const ownProfileSelect = {
  bio: true,
  skills: true,
  region: true,
  availableDays: true,
  availabilityNotes: true,
  interests: { select: { id: true, name: true, slug: true }, orderBy: { name: 'asc' } },
  updatedAt: true,
} as const;

/**
 * Mounted under /api/users/me/volunteer-profile. Availability is private: no other user's
 * view (offers, registrations, public lists) ever includes it.
 */
export function createVolunteerProfileRouter({ prisma }: AppDependencies): Router {
  const router = Router();
  router.use(requireAuth);

  /** Returns the profile, or `null` when the user has not filled it in yet. */
  router.get('/', async (req, res) => {
    const profile = await prisma.volunteerProfile.findUnique({
      where: { userId: currentUser(req).id },
      select: ownProfileSelect,
    });
    res.json({ data: profile });
  });

  /** Creates or fully replaces the profile. */
  router.put('/', async (req, res) => {
    const body = volunteerProfileBody.parse(req.body);
    const userId = currentUser(req).id;
    const interestIds = [...new Set(body.interestCategoryIds)];
    const active = await prisma.category.count({
      where: { id: { in: interestIds }, isActive: true },
    });
    if (active !== interestIds.length) {
      throw errors.badRequest('Unknown or inactive category in interests.', {
        field: 'interestCategoryIds',
      });
    }
    const fields = {
      bio: body.bio ?? null,
      skills: [...new Set(body.skills)],
      region: body.region ?? null,
      availableDays: body.availableDays,
      availabilityNotes: body.availabilityNotes ?? null,
    };
    const interests = interestIds.map((id) => ({ id }));
    const profile = await prisma.volunteerProfile.upsert({
      where: { userId },
      create: { userId, ...fields, interests: { connect: interests } },
      update: { ...fields, interests: { set: interests } },
      select: ownProfileSelect,
    });
    res.json({ data: profile });
  });

  return router;
}
