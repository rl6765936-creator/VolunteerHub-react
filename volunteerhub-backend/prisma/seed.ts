/**
 * Idempotent seed: the first admin account and the volunteering categories.
 * Run with `npm run db:seed` (or automatically by `prisma migrate reset`).
 * The admin password comes from SEED_ADMIN_PASSWORD and is never printed.
 * Existing data is never deleted; running it again only fills in what is missing.
 */
import { z } from 'zod';
import { hashPassword } from '../src/lib/password.js';
import { createPrisma } from '../src/lib/prisma.js';

const seedEnv = z
  .object({
    DATABASE_URL: z.string().min(1),
    SEED_ADMIN_EMAIL: z.string().trim().toLowerCase().pipe(z.email()),
    SEED_ADMIN_PASSWORD: z.string().min(12, 'must be at least 12 characters'),
    SEED_ADMIN_NAME: z.string().trim().min(2).max(80).default('VolunteerHub Admin'),
  })
  .safeParse(process.env);

if (!seedEnv.success) {
  const lines = seedEnv.error.issues.map(
    (issue) => `  - ${issue.path.join('.')}: ${issue.message}`,
  );
  process.stderr.write(`Seed configuration is invalid:\n${lines.join('\n')}\n`);
  process.exit(1);
}

const env = seedEnv.data;
const prisma = createPrisma(env.DATABASE_URL);

const CATEGORIES = [
  { slug: 'elderly-support', name: 'סיוע לקשישים' },
  { slug: 'food-distribution', name: 'חלוקת מזון' },
  { slug: 'transportation', name: 'הסעות וליווי' },
  { slug: 'education-tutoring', name: 'חינוך ושיעורי עזר' },
  { slug: 'home-repairs', name: 'תיקונים בבית' },
  { slug: 'environment', name: 'איכות הסביבה' },
  { slug: 'community-events', name: 'אירועים קהילתיים' },
  { slug: 'shopping-errands', name: 'קניות וסידורים' },
];

async function main(): Promise<void> {
  const existing = await prisma.user.findUnique({
    where: { email: env.SEED_ADMIN_EMAIL },
    select: { id: true },
  });
  if (existing) {
    // Never overwrite an existing password; only make sure the account is an active admin.
    await prisma.user.update({
      where: { id: existing.id },
      data: { role: 'ADMIN', status: 'ACTIVE' },
    });
  } else {
    await prisma.user.create({
      data: {
        email: env.SEED_ADMIN_EMAIL,
        name: env.SEED_ADMIN_NAME,
        passwordHash: await hashPassword(env.SEED_ADMIN_PASSWORD),
        role: 'ADMIN',
      },
    });
  }

  for (const category of CATEGORIES) {
    await prisma.category.upsert({
      where: { slug: category.slug },
      create: category,
      update: {},
    });
  }

  process.stdout.write(
    `Seed complete: admin ${env.SEED_ADMIN_EMAIL} (${existing ? 'existing' : 'created'}), ${CATEGORIES.length} categories.\n`,
  );
}

main()
  .catch((error: unknown) => {
    process.stderr.write(
      `Seed failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
