import type { Env } from './config/env.js';
import type { Logger } from './lib/logger.js';
import type { Db } from './lib/prisma.js';

export interface AppDependencies {
  env: Env;
  logger: Logger;
  prisma: Db;
}
