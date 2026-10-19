import type { Env } from './config/env.js';
import type { Logger } from './lib/logger.js';

/**
 * Everything a feature router needs. Passed explicitly so tests can build isolated apps.
 * The Prisma client is added in Phase 2.
 */
export interface AppDependencies {
  env: Env;
  logger: Logger;
}
