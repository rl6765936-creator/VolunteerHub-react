import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { documentedEndpoints } from '../src/docs/openapi.js';
import { buildApp } from './helpers/setup.js';

const app = buildApp();
const SAMPLE_ID = '00000000-0000-4000-8000-000000000000';

describe('OpenAPI document and routes stay in sync', () => {
  it('documents every endpoint exactly once', () => {
    const keys = documentedEndpoints.map(({ method, path }) => `${method} ${path}`);
    expect(new Set(keys).size).toBe(keys.length);

    const modulesDir = path.resolve(import.meta.dirname, '../src/modules');
    const sources = readdirSync(modulesDir, { recursive: true, encoding: 'utf8' })
      .filter((file) => file.endsWith('.routes.ts'))
      .map((file) => readFileSync(path.join(modulesDir, file), 'utf8'));
    const routeDefinitions = sources.reduce(
      (count, source) =>
        count + (source.match(/router\.(get|post|patch|put|delete)\(/g)?.length ?? 0),
      0,
    );
    expect(keys.length).toBe(routeDefinitions);
  });

  it('has a real route behind every documented endpoint', async () => {
    for (const { method, path: route } of documentedEndpoints) {
      const url = route.replace(/\{\w+\}/g, SAMPLE_ID);
      const res = await request(app)[method as 'get'](url);
      expect(res.body?.error?.message, `${method.toUpperCase()} ${route}`).not.toBe(
        'Route not found.',
      );
    }
  });
});
