import { Router } from 'express';
import multer from 'multer';
import type { AppDependencies } from '../../deps.js';
import { AppError, ErrorCodes, errors } from '../../lib/errors.js';
import { parseId } from '../../lib/http.js';
import { lockHelpRequest } from '../../lib/locks.js';
import { detectImageType } from '../../lib/storage.js';
import { currentUser, requireAuth } from '../../middleware/auth.js';
import { writeRateLimiter } from '../../middleware/security.js';
import { AuditActions, writeAudit } from '../audit/audit.service.js';
import { recordStatusChange } from '../history/history.service.js';
import { notify, quote } from '../notifications/notifications.service.js';
import { loadVisibleRequest } from '../requests/requestAccess.js';

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_REQUEST = 5;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 1, fields: 0 },
});

const attachmentSelect = {
  id: true,
  requestId: true,
  mimeType: true,
  sizeBytes: true,
  createdAt: true,
} as const;

const withUrl = <T extends { id: string }>(attachment: T) => ({
  ...attachment,
  url: `/api/attachments/${attachment.id}/file`,
});

/**
 * Images for help requests: JPEG, PNG or WebP (detected from the file's bytes), up to 5 MB
 * each and 5 per request. The owner adds or removes images while the request is open; a new
 * image is material content, so an approved request goes back to moderation. The image bytes
 * are stored in the database (MediaAttachment.data) and served only through
 * GET /api/attachments/:id/file, with the same visibility as the request. Lists never select
 * the bytes.
 */
export function createAttachmentsRouter({ env, prisma }: AppDependencies): Router {
  const router = Router();

  router.get('/requests/:id/attachments', async (req, res) => {
    const { request } = await loadVisibleRequest(prisma, parseId(req.params.id), req.user);
    const attachments = await prisma.mediaAttachment.findMany({
      where: { requestId: request.id },
      select: attachmentSelect,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    res.json({ data: attachments.map(withUrl) });
  });

  router.post(
    '/requests/:id/attachments',
    requireAuth,
    writeRateLimiter(env),
    upload.single('file'),
    async (req, res) => {
      const user = currentUser(req);
      const id = parseId(req.params.id);
      // Cheap checks first; they are repeated under the row lock below.
      const { access } = await loadVisibleRequest(prisma, id, user);
      if (!access.isOwner) throw errors.forbidden('Only the owner can add images.');
      const file = req.file;
      if (!file) throw errors.badRequest('Send one image in the multipart field "file".');
      const type = detectImageType(file.buffer);
      if (!type) {
        throw new AppError(
          415,
          ErrorCodes.UNSUPPORTED_MEDIA_TYPE,
          'Only JPEG, PNG and WebP images are allowed.',
        );
      }

      const result = await prisma.$transaction(async (tx) => {
        if (!(await lockHelpRequest(tx, id))) throw errors.notFound('Help request');
        const { request } = await loadVisibleRequest(tx, id, user);
        if (request.status !== 'OPEN') {
          throw errors.conflict(
            ErrorCodes.INVALID_STATE,
            'Images can only be added while the request is open.',
          );
        }
        if (request._count.attachments >= MAX_ATTACHMENTS_PER_REQUEST) {
          throw errors.conflict(
            ErrorCodes.LIMIT_REACHED,
            `A request can have at most ${MAX_ATTACHMENTS_PER_REQUEST} images.`,
          );
        }
        const attachment = await tx.mediaAttachment.create({
          data: {
            requestId: id,
            uploaderId: user.id,
            mimeType: type.mimeType,
            sizeBytes: file.size,
            // A copy as a plain Uint8Array, the type Prisma expects for Bytes.
            data: new Uint8Array(file.buffer),
          },
          select: attachmentSelect,
        });
        const reModeration = request.moderationStatus !== 'PENDING_REVIEW';
        if (reModeration) {
          await tx.helpRequest.update({
            where: { id },
            data: {
              moderationStatus: 'PENDING_REVIEW',
              rejectionReason: null,
              reviewedAt: null,
              reviewedById: null,
            },
          });
          await recordStatusChange(tx, {
            entityType: 'HELP_REQUEST',
            entityId: id,
            field: 'MODERATION',
            fromStatus: request.moderationStatus,
            toStatus: 'PENDING_REVIEW',
            actorId: user.id,
            note: 'A new image was added; waiting for review.',
          });
          await notify(
            tx,
            request.offers.map((offer) => offer.volunteer.id),
            {
              type: 'REQUEST_UPDATED',
              entityType: 'HelpRequest',
              entityId: id,
              message: `The help request ${quote(request.title)} you offered to help with was changed (images).`,
            },
            user.id,
          );
        }
        return { attachment, reModeration };
      });
      res
        .status(201)
        .json({ data: withUrl(result.attachment), meta: { reModeration: result.reModeration } });
    },
  );

  router.get('/attachments/:id/file', async (req, res) => {
    const attachment = await prisma.mediaAttachment.findUnique({
      where: { id: parseId(req.params.id) },
      select: { requestId: true, mimeType: true, data: true },
    });
    if (!attachment) throw errors.notFound('Attachment');
    try {
      await loadVisibleRequest(prisma, attachment.requestId, req.user);
    } catch {
      throw errors.notFound('Attachment');
    }
    const body = Buffer.from(attachment.data);
    res.setHeader('Content-Type', attachment.mimeType);
    res.setHeader('Content-Length', body.length);
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.end(body);
  });

  /** The owner removes images while the request is open; admins remove any (audit-logged). */
  router.delete('/attachments/:id', requireAuth, async (req, res) => {
    const user = currentUser(req);
    const id = parseId(req.params.id);
    const attachment = await prisma.mediaAttachment.findUnique({
      where: { id },
      select: { requestId: true, uploaderId: true },
    });
    if (!attachment) throw errors.notFound('Attachment');
    const { request, access } = await loadVisibleRequest(prisma, attachment.requestId, user).catch(
      () => {
        throw errors.notFound('Attachment');
      },
    );
    if (!access.isAdmin) {
      if (!access.isOwner) throw errors.forbidden('Only the owner or an admin can remove images.');
      if (request.status !== 'OPEN') {
        throw errors.conflict(
          ErrorCodes.INVALID_STATE,
          'Images can only be removed while the request is open.',
        );
      }
    }
    await prisma.$transaction(async (tx) => {
      await tx.mediaAttachment.delete({ where: { id } });
      if (access.isAdmin && !access.isOwner) {
        await writeAudit(tx, {
          actorId: user.id,
          action: AuditActions.ATTACHMENT_DELETED,
          entityType: 'MediaAttachment',
          entityId: id,
          metadata: { requestId: attachment.requestId, uploaderId: attachment.uploaderId },
        });
      }
    });
    res.status(204).end();
  });

  return router;
}
