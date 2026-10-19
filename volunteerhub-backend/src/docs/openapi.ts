import {
  OpenApiGeneratorV31,
  OpenAPIRegistry,
  type RouteConfig,
} from '@asteasolutions/zod-to-openapi';
import { z, type ZodObject, type ZodType } from 'zod';
import { loginBody, registerBody } from '../modules/auth/auth.schemas.js';
import {
  createCategoryBody,
  includeInactiveQuery,
  updateCategoryBody,
} from '../modules/categories/categories.routes.js';
import { approveBody, cancelBody, rejectBody } from '../modules/moderation/moderation.schemas.js';
import { createOfferBody, myOffersQuery } from '../modules/offers/offers.schemas.js';
import { volunteerProfileBody } from '../modules/profiles/profile.routes.js';
import {
  adminListRequestsQuery,
  createRequestBody,
  listRequestsQuery,
  myRequestsQuery,
  updateRequestBody,
} from '../modules/requests/requests.schemas.js';
import {
  changePasswordBody,
  listUsersQuery,
  updateMeBody,
  updateUserBody,
} from '../modules/users/users.routes.js';

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
  multipart?: boolean;
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
  {
    method: 'get',
    path: `${P}/health/ready`,
    tag: 'Health',
    summary: 'Readiness check (database)',
    access: 'public',
  },

  // Auth and current user (same contract as VoiceUp)
  {
    method: 'post',
    path: `${P}/auth/register`,
    tag: 'Auth',
    summary: 'Register (always creates a USER)',
    access: 'public',
    body: registerBody,
    status: 201,
    description:
      'Returns `{ data: { user, accessToken, tokenType: "Bearer", expiresIn } }`. Rate limited per IP.',
  },
  {
    method: 'post',
    path: `${P}/auth/login`,
    tag: 'Auth',
    summary: 'Log in and receive an access token',
    access: 'public',
    body: loginBody,
    description:
      'Same response as register. Stateless JWT: there is no refresh or logout endpoint; the client discards the token. Blocked accounts get 403 ACCOUNT_BLOCKED.',
  },
  {
    method: 'get',
    path: `${P}/users/me`,
    tag: 'Users',
    summary: 'Current user',
    access: 'user',
  },
  {
    method: 'patch',
    path: `${P}/users/me`,
    tag: 'Users',
    summary: 'Change display name or contact phone',
    access: 'user',
    body: updateMeBody,
  },
  {
    method: 'post',
    path: `${P}/users/me/password`,
    tag: 'Users',
    summary: 'Change password',
    access: 'user',
    body: changePasswordBody,
    status: 204,
  },

  {
    method: 'get',
    path: `${P}/users/me/volunteer-profile`,
    tag: 'Volunteer profile',
    summary: 'My volunteer profile (null until filled in)',
    access: 'user',
  },
  {
    method: 'put',
    path: `${P}/users/me/volunteer-profile`,
    tag: 'Volunteer profile',
    summary: 'Create or replace my volunteer profile',
    access: 'user',
    body: volunteerProfileBody,
    description:
      'Requires a Bearer token. Availability (days and notes) is private: only you and admins can read it.',
  },

  // Categories
  {
    method: 'get',
    path: `${P}/categories`,
    tag: 'Categories',
    summary: 'List categories',
    access: 'public',
    query: includeInactiveQuery,
  },
  {
    method: 'post',
    path: `${P}/admin/categories`,
    tag: 'Admin: categories',
    summary: 'Create a category',
    access: 'admin',
    body: createCategoryBody,
    status: 201,
  },
  {
    method: 'patch',
    path: `${P}/admin/categories/{id}`,
    tag: 'Admin: categories',
    summary: 'Rename or deactivate a category (never deleted)',
    access: 'admin',
    body: updateCategoryBody,
  },

  // Help requests
  {
    method: 'get',
    path: `${P}/requests`,
    tag: 'Help requests',
    summary: 'Search approved help requests',
    access: 'public',
    query: listRequestsQuery,
    description:
      'Public. Only approved requests are listed (default `status=OPEN`). Addresses and contact details are never included.',
  },
  {
    method: 'post',
    path: `${P}/requests`,
    tag: 'Help requests',
    summary: 'Create a help request (starts as PENDING_REVIEW)',
    access: 'user',
    body: createRequestBody,
    status: 201,
  },
  {
    method: 'get',
    path: `${P}/requests/{id}`,
    tag: 'Help requests',
    summary: 'Help request details',
    access: 'public',
    description:
      'Approved requests are public. Pending or rejected ones are visible only to the owner, admins and users who made an offer (404 for everyone else). `privateDetails` (address and requester contact) is shown only to the owner, admins and the volunteer whose offer was accepted.',
  },
  {
    method: 'patch',
    path: `${P}/requests/{id}`,
    tag: 'Help requests',
    summary: 'Edit my request (only while OPEN)',
    access: 'user',
    body: updateRequestBody,
    description:
      'Owner only. Every field is material: a published request goes back to PENDING_REVIEW (`meta.reModeration`) and users with an active offer are notified.',
  },
  {
    method: 'post',
    path: `${P}/requests/{id}/cancel`,
    tag: 'Help requests',
    summary: 'Cancel a request (owner or admin)',
    access: 'user',
    body: cancelBody,
    description:
      'Pending offers are declined and every offerer is notified. Admin cancellations are audit-logged.',
  },
  {
    method: 'post',
    path: `${P}/requests/{id}/complete`,
    tag: 'Help requests',
    summary: 'Mark an in-progress request as completed (owner)',
    access: 'user',
  },
  {
    method: 'get',
    path: `${P}/requests/{id}/history`,
    tag: 'Help requests',
    summary: 'Moderation and status history of a request and its offers (owner or admin)',
    access: 'user',
  },
  {
    method: 'get',
    path: `${P}/users/me/requests`,
    tag: 'Help requests',
    summary: 'My help requests, in every state',
    access: 'user',
    query: myRequestsQuery,
  },

  // Help offers
  {
    method: 'post',
    path: `${P}/requests/{id}/offers`,
    tag: 'Help offers',
    summary: 'Offer help on an approved, open request',
    access: 'user',
    body: createOfferBody,
    status: 201,
    description:
      'Not on your own request. One active (pending or accepted) offer per volunteer per request. The owner is notified.',
  },
  {
    method: 'get',
    path: `${P}/requests/{id}/offers`,
    tag: 'Help offers',
    summary: 'Offers on a request',
    access: 'user',
    description:
      'The owner and admins see all offers; other users see only their own. Volunteer contact details appear only on the accepted offer; availability never appears.',
  },
  {
    method: 'post',
    path: `${P}/offers/{id}/accept`,
    tag: 'Help offers',
    summary: 'Accept an offer (request owner)',
    access: 'user',
    description:
      'Exactly one offer per request can be accepted (row lock + partial unique index). Other pending offers are declined and the request becomes IN_PROGRESS.',
  },
  {
    method: 'post',
    path: `${P}/offers/{id}/decline`,
    tag: 'Help offers',
    summary: 'Decline a pending offer (request owner)',
    access: 'user',
  },
  {
    method: 'post',
    path: `${P}/offers/{id}/withdraw`,
    tag: 'Help offers',
    summary: 'Withdraw my pending offer',
    access: 'user',
  },
  {
    method: 'get',
    path: `${P}/users/me/offers`,
    tag: 'Help offers',
    summary: 'My offers',
    access: 'user',
    query: myOffersQuery,
  },

  // Images
  {
    method: 'get',
    path: `${P}/requests/{id}/attachments`,
    tag: 'Images',
    summary: 'List the images of a request',
    access: 'public',
    description: 'Same visibility as the request.',
  },
  {
    method: 'post',
    path: `${P}/requests/{id}/attachments`,
    tag: 'Images',
    summary: 'Upload an image (owner, while OPEN)',
    access: 'user',
    multipart: true,
    status: 201,
    description:
      'JPEG, PNG or WebP detected from the file bytes, max 5 MB, max 5 per request. Adding an image to a published request sends it back to moderation.',
  },
  {
    method: 'get',
    path: `${P}/attachments/{id}/file`,
    tag: 'Images',
    summary: 'Download an image',
    access: 'public',
    description: 'Same visibility as the request (404 otherwise).',
  },
  {
    method: 'delete',
    path: `${P}/attachments/{id}`,
    tag: 'Images',
    summary: 'Remove an image (owner while OPEN, or admin)',
    access: 'user',
    status: 204,
  },

  // Admin: moderation of requests
  {
    method: 'get',
    path: `${P}/admin/requests`,
    tag: 'Admin: moderation',
    summary: 'All help requests, e.g. the PENDING_REVIEW queue',
    access: 'admin',
    query: adminListRequestsQuery,
  },
  {
    method: 'post',
    path: `${P}/admin/requests/{id}/approve`,
    tag: 'Admin: moderation',
    summary: 'Approve and publish a pending request',
    access: 'admin',
    body: approveBody,
  },
  {
    method: 'post',
    path: `${P}/admin/requests/{id}/reject`,
    tag: 'Admin: moderation',
    summary: 'Reject a pending request or take down a published one',
    access: 'admin',
    body: rejectBody,
  },

  // Admin: users
  {
    method: 'get',
    path: `${P}/admin/users`,
    tag: 'Admin: users',
    summary: 'List users',
    access: 'admin',
    query: listUsersQuery,
  },
  {
    method: 'get',
    path: `${P}/admin/users/{id}`,
    tag: 'Admin: users',
    summary: 'User details, including the private volunteer profile',
    access: 'admin',
  },
  {
    method: 'patch',
    path: `${P}/admin/users/{id}`,
    tag: 'Admin: users',
    summary: 'Change role or block/unblock (never your own account; audit-logged)',
    access: 'admin',
    body: updateUserBody,
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
    const hasInput = Boolean(pathParams ?? endpoint.query ?? endpoint.body ?? endpoint.multipart);
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
        ...(endpoint.multipart && {
          body: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: z.object({ file: z.string().meta({ format: 'binary' }) }),
              },
            },
          },
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
