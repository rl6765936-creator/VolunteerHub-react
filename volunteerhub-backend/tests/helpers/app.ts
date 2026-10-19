import { createApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { createLogger } from '../../src/lib/logger.js';

/** Builds an isolated app (fresh rate-limit counters) with test configuration plus overrides. */
export function buildApp(overrides: Record<string, string> = {}) {
  const env = loadEnv({ NODE_ENV: 'test', ...overrides });
  return createApp({ env, logger: createLogger('silent') });
}
