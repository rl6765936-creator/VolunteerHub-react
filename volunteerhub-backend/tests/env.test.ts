import { describe, expect, it } from 'vitest';
import { EnvValidationError, loadEnv } from '../src/config/env.js';

describe('loadEnv', () => {
  it('applies development defaults, with port 3001', () => {
    expect(loadEnv({})).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3001,
      LOG_LEVEL: 'debug',
      CORS_ORIGINS: [],
      TRUST_PROXY: 0,
      RATE_LIMIT_WINDOW_MS: 900_000,
      RATE_LIMIT_MAX: 300,
    });
  });

  it('chooses a quiet log level in tests and info in production', () => {
    expect(loadEnv({ NODE_ENV: 'test' }).LOG_LEVEL).toBe('silent');
    expect(loadEnv({ NODE_ENV: 'production' }).LOG_LEVEL).toBe('info');
  });

  it('lets LOG_LEVEL override the default', () => {
    expect(loadEnv({ NODE_ENV: 'production', LOG_LEVEL: 'warn' }).LOG_LEVEL).toBe('warn');
  });

  it('parses a comma-separated CORS_ORIGINS list', () => {
    const env = loadEnv({
      CORS_ORIGINS: ' http://localhost:5173 , https://volunteerhub.example ,',
    });
    expect(env.CORS_ORIGINS).toEqual(['http://localhost:5173', 'https://volunteerhub.example']);
  });

  it('rejects invalid values', () => {
    expect(() => loadEnv({ PORT: '70000' })).toThrow(EnvValidationError);
    expect(() => loadEnv({ NODE_ENV: 'staging' })).toThrow(EnvValidationError);
    expect(() => loadEnv({ RATE_LIMIT_MAX: '0' })).toThrow(/RATE_LIMIT_MAX/);
    expect(() => loadEnv({ TRUST_PROXY: '-1' })).toThrow(/TRUST_PROXY/);
  });

  it('names the invalid variable but never echoes its value', () => {
    expect(() => loadEnv({ CORS_ORIGINS: 'not-a-valid-origin' })).toThrow(/CORS_ORIGINS/);
    try {
      loadEnv({ CORS_ORIGINS: 'not-a-valid-origin' });
    } catch (error) {
      expect((error as Error).message).not.toContain('not-a-valid-origin');
    }
  });
});
