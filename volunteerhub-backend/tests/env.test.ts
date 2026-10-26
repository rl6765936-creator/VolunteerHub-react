import { describe, expect, it } from 'vitest';
import { EnvValidationError, loadEnv } from '../src/config/env.js';

const REQUIRED = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/volunteerhub',
  JWT_SECRET: 'x'.repeat(32),
};

describe('loadEnv', () => {
  it('applies development defaults, with port 3001', () => {
    expect(loadEnv({ ...REQUIRED })).toMatchObject({
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
    expect(loadEnv({ ...REQUIRED, NODE_ENV: 'test' }).LOG_LEVEL).toBe('silent');
    expect(loadEnv({ ...REQUIRED, NODE_ENV: 'production' }).LOG_LEVEL).toBe('info');
  });

  it('lets LOG_LEVEL override the default', () => {
    expect(loadEnv({ ...REQUIRED, NODE_ENV: 'production', LOG_LEVEL: 'warn' }).LOG_LEVEL).toBe(
      'warn',
    );
  });

  it('parses a comma-separated CORS_ORIGINS list', () => {
    const env = loadEnv({
      ...REQUIRED,
      CORS_ORIGINS: ' http://localhost:5173 , https://volunteerhub.example ,',
    });
    expect(env.CORS_ORIGINS).toEqual(['http://localhost:5173', 'https://volunteerhub.example']);
  });

  it('rejects invalid values', () => {
    expect(() => loadEnv({ ...REQUIRED, PORT: '70000' })).toThrow(EnvValidationError);
    expect(() => loadEnv({ ...REQUIRED, NODE_ENV: 'staging' })).toThrow(EnvValidationError);
    expect(() => loadEnv({ ...REQUIRED, RATE_LIMIT_MAX: '0' })).toThrow(/RATE_LIMIT_MAX/);
    expect(() => loadEnv({ ...REQUIRED, TRUST_PROXY: '-1' })).toThrow(/TRUST_PROXY/);
  });

  it('requires a PostgreSQL DATABASE_URL', () => {
    expect(() => loadEnv({})).toThrow(/DATABASE_URL/);
    expect(() => loadEnv({ ...REQUIRED, DATABASE_URL: 'mysql://x' })).toThrow(/DATABASE_URL/);
  });

  it('requires a JWT secret of at least 32 characters and never echoes it', () => {
    expect(() => loadEnv({ ...REQUIRED, JWT_SECRET: undefined })).toThrow(/JWT_SECRET/);
    try {
      loadEnv({ ...REQUIRED, JWT_SECRET: 'tooshortsecret' });
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).toMatch(/JWT_SECRET/);
      expect((error as Error).message).not.toContain('tooshortsecret');
    }
  });

  it('applies auth and write-limit defaults', () => {
    expect(loadEnv({ ...REQUIRED })).toMatchObject({
      JWT_EXPIRES_IN_SECONDS: 7200,
      AUTH_RATE_LIMIT_MAX: 20,
      WRITE_RATE_LIMIT_MAX: 30,
      TIME_ZONE: 'Asia/Jerusalem',
    });
  });

  it('validates the time zone', () => {
    expect(loadEnv({ ...REQUIRED, TIME_ZONE: 'Europe/London' }).TIME_ZONE).toBe('Europe/London');
    expect(() => loadEnv({ ...REQUIRED, TIME_ZONE: 'Mars/Olympus' })).toThrow(/TIME_ZONE/);
  });

  it('names the invalid variable but never echoes its value', () => {
    expect(() => loadEnv({ ...REQUIRED, CORS_ORIGINS: 'not-a-valid-origin' })).toThrow(
      /CORS_ORIGINS/,
    );
    try {
      loadEnv({ ...REQUIRED, CORS_ORIGINS: 'not-a-valid-origin' });
    } catch (error) {
      expect((error as Error).message).not.toContain('not-a-valid-origin');
    }
  });
});
