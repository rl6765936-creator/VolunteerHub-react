import type { Prisma } from '../../generated/prisma/client.js';
import { isUnderReModeration } from '../moderation/moderation.schemas.js';
import type { RequestAccess, RequestDetail } from './requestAccess.js';

export const requestSummaryInclude = {
  category: { select: { id: true, name: true, slug: true } },
  owner: { select: { id: true, name: true } },
  _count: {
    select: {
      attachments: true,
      offers: { where: { status: { in: ['PENDING', 'ACCEPTED'] } } },
    },
  },
} satisfies Prisma.HelpRequestInclude;

type RequestSummaryRow = Prisma.HelpRequestGetPayload<{ include: typeof requestSummaryInclude }>;

export function serializeRequestSummary(row: RequestSummaryRow, options: { own?: boolean } = {}) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    region: row.region,
    neededBy: row.neededBy,
    category: row.category,
    owner: row.owner,
    moderationStatus: row.moderationStatus,
    underReModeration: isUnderReModeration(row),
    status: row.status,
    publishedAt: row.publishedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    activeOfferCount: row._count.offers,
    imageCount: row._count.attachments,
    ...(options.own && { rejectionReason: row.rejectionReason }),
  };
}

export function serializeRequestDetail(row: RequestDetail, access: RequestAccess) {
  const accepted = row.offers.find((offer) => offer.status === 'ACCEPTED');
  const ownerOrAdmin = access.isOwner || access.isAdmin;
  const canSeePrivate = ownerOrAdmin || access.isAcceptedVolunteer;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    region: row.region,
    neededBy: row.neededBy,
    category: row.category,
    owner: { id: row.owner.id, name: row.owner.name },
    moderationStatus: row.moderationStatus,
    underReModeration: isUnderReModeration(row),
    status: row.status,
    publishedAt: row.publishedAt,
    completedAt: row.completedAt,
    cancelledAt: row.cancelledAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    activeOfferCount: row.offers.length,
    imageCount: row._count.attachments,
    ...(ownerOrAdmin && { rejectionReason: row.rejectionReason, reviewedAt: row.reviewedAt }),
    privateDetails: canSeePrivate
      ? {
          addressDetails: row.addressDetails,
          contact: {
            name: row.owner.name,
            email: row.owner.email,
            phone: row.owner.phone,
          },
        }
      : null,
    acceptedVolunteer:
      accepted && ownerOrAdmin
        ? {
            id: accepted.volunteer.id,
            name: accepted.volunteer.name,
            email: accepted.volunteer.email,
            phone: accepted.volunteer.phone,
          }
        : null,
    viewer: {
      isOwner: access.isOwner,
      myOffer: access.myOffer,
    },
  };
}
