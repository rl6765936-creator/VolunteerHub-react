import { isUnderReModeration } from '../moderation/moderation.schemas.js';
import { isRegistrationOpen, type TaskAccess, type TaskDetail } from './taskAccess.js';

export function serializeTask(
  task: TaskDetail,
  options: { access?: TaskAccess; own?: boolean } = {},
) {
  const confirmed = task._count.registrations;
  const ownerView = options.own || options.access?.isOwner || options.access?.isAdmin;
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    region: task.region,
    location: task.location,
    startsAt: task.startsAt,
    endsAt: task.endsAt,
    capacity: task.capacity,
    registeredCount: confirmed,
    spotsLeft: Math.max(task.capacity - confirmed, 0),
    registrationOpen: isRegistrationOpen(task, confirmed),
    category: task.category,
    createdBy: task.createdBy,
    moderationStatus: task.moderationStatus,
    underReModeration: isUnderReModeration(task),
    status: task.status,
    publishedAt: task.publishedAt,
    cancelledAt: task.cancelledAt,
    cancellationReason: task.cancellationReason,
    completedAt: task.completedAt,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    ...(ownerView && { rejectionReason: task.rejectionReason, reviewedAt: task.reviewedAt }),
    ...(options.access && {
      viewer: {
        isOwner: options.access.isOwner,
        myRegistration: options.access.myRegistration,
      },
    }),
  };
}
