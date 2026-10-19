import {
  OpenApiGeneratorV31,
  OpenAPIRegistry,
  type RouteConfig,
} from '@asteasolutions/zod-to-openapi';
import { z, type ZodObject, type ZodType } from 'zod';

type Access = 'public' | 'user' | 'admin';
type Method = RouteConfig['method'];

interface Endpoint {
  method: Method;
  path: string;
  tag: string;
  summary: string;
  access: Access;
  body?: ZodType;
  query?: ZodObject;
  status?: number;
  /** Overrides the default access note. */
  description?: string;
}

const id = z.uuid();
const params = (path: string): ZodObject | undefined => {
  const names = [...path.matchAll(/\{(\w+)\}/g)].map((match) => match[1] ?? '');
  return names.length > 0
    ? z.object(Object.fromEntries(names.map((name) => [name, id])))
    : undefined;
};

const errorBody = z.object({
  error: z.object({
    code: z.string().meta({ example: 'VALIDATION_ERROR' }),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

const P = '/api';

/** Every documented operation. Feature phases add their endpoints here. */
const endpoints: Endpoint[] = [
  {
    method: 'get',
    path: `${P}/health`,
    tag: 'Health',
    summary: 'Liveness check',
    access: 'public',
  },
];

const ACCESS_NOTE: Record<Access, string> = {
  public: 'Public.',
  user: 'Requires a Bearer token.',
  admin: 'Requires a Bearer token of an ADMIN.',
};

export function buildOpenApiDocument() {
  const registry = new OpenAPIRegistry();
  const bearer = registry.registerComponent('securitySchemes', 'bearerAuth', {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
  });

  for (const endpoint of endpoints) {
    const status = endpoint.status ?? 200;
    const pathParams = params(endpoint.path);
    const hasInput = Boolean(pathParams ?? endpoint.query ?? endpoint.body);
    const responses: RouteConfig['responses'] = {
      [status]: {
        description: status === 204 ? 'No content' : 'Success. Body: `{ data, meta? }`.',
      },
      ...(hasInput && {
        400: {
          description: 'Validation error',
          content: { 'application/json': { schema: errorBody } },
        },
      }),
      ...(endpoint.access !== 'public' && {
        401: {
          description: 'Missing or invalid token',
          content: { 'application/json': { schema: errorBody } },
        },
      }),
      ...(endpoint.access === 'admin' && {
        403: {
          description: 'Not an admin',
          content: { 'application/json': { schema: errorBody } },
        },
      }),
      ...(pathParams && {
        404: {
          description: 'Not found (or not visible to you)',
          content: { 'application/json': { schema: errorBody } },
        },
      }),
      ...(endpoint.method !== 'get' && {
        409: {
          description: 'Conflict: invalid state or transition, or duplicate',
          content: { 'application/json': { schema: errorBody } },
        },
      }),
    };
    registry.registerPath({
      method: endpoint.method,
      path: endpoint.path,
      tags: [endpoint.tag],
      summary: endpoint.summary,
      description: endpoint.description ?? ACCESS_NOTE[endpoint.access],
      ...(endpoint.access !== 'public' && { security: [{ [bearer.name]: [] }] }),
      request: {
        ...(pathParams && { params: pathParams }),
        ...(endpoint.query && { query: endpoint.query }),
        ...(endpoint.body && {
          body: { required: true, content: { 'application/json': { schema: endpoint.body } } },
        }),
      },
      responses,
    });
  }

  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'VolunteerHub API',
      version: '0.1.0',
      description: [
        'Community platform where every registered user can request help and volunteer.',
        '',
        '**VolunteerHub is not a substitute for emergency services.** In an emergency, contact the',
        'relevant emergency number.',
        '',
        'Success: `{ data, meta? }`. Errors: `{ error: { code, message, details? } }`. Lists accept',
        '`page` and `pageSize` (max 50) and return `meta.total`.',
      ].join('\n'),
    },
    servers: [{ url: '/' }],
  });
}

/** Documented operations, used by tests to keep docs and routes in sync. */
export const documentedEndpoints = endpoints.map(({ method, path }) => ({ method, path }));
