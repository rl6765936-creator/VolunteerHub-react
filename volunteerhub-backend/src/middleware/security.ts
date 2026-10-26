import cors from 'cors';
import type { RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import type { Env } from '../config/env.js';
import { AppError, ErrorCodes } from '../lib/errors.js';

export function securityHeaders(): RequestHandler {
  return helmet();
}

export function corsPolicy(env: Env): RequestHandler {
  return cors({
    origin: env.CORS_ORIGINS.length > 0 ? env.CORS_ORIGINS : false,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600,
  });
}

function limiter(
  windowMs: number,
  limit: number,
  skip?: (path: string) => boolean,
): RequestHandler {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    ...(skip && { skip: (req) => skip(req.path) }),
    handler: (_req, _res, next) => {
      next(
        new AppError(429, ErrorCodes.RATE_LIMITED, 'Too many requests. Please try again later.'),
      );
    },
  });
}

export function globalRateLimiter(env: Env): RequestHandler {
  return limiter(env.RATE_LIMIT_WINDOW_MS, env.RATE_LIMIT_MAX, (path) =>
    path.startsWith('/health'),
  );
}

export function authRateLimiter(env: Env): RequestHandler {
  return limiter(env.RATE_LIMIT_WINDOW_MS, env.AUTH_RATE_LIMIT_MAX);
}

export function writeRateLimiter(env: Env): RequestHandler {
  return limiter(60 * 60 * 1000, env.WRITE_RATE_LIMIT_MAX);
}
