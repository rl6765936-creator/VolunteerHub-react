-- Database-level guarantees that back the application rules.
-- Prisma does not model CHECK constraints or partial indexes, so they live in this
-- hand-written migration.

-- Tasks: a sane capacity and a schedule that ends after it starts.
ALTER TABLE "VolunteerTask"
  ADD CONSTRAINT "VolunteerTask_capacity_range" CHECK ("capacity" BETWEEN 1 AND 1000),
  ADD CONSTRAINT "VolunteerTask_ends_after_start" CHECK ("endsAt" > "startsAt"),
  ADD CONSTRAINT "VolunteerTask_rejected_has_reason" CHECK (
    "moderationStatus" <> 'REJECTED' OR "rejectionReason" IS NOT NULL
  ),
  ADD CONSTRAINT "VolunteerTask_cancelled_has_date" CHECK (
    "status" <> 'CANCELLED' OR "cancelledAt" IS NOT NULL
  ),
  ADD CONSTRAINT "VolunteerTask_completed_has_date" CHECK (
    "status" <> 'COMPLETED' OR "completedAt" IS NOT NULL
  );

-- Help requests: rejections carry a reason, terminal states carry their date.
ALTER TABLE "HelpRequest"
  ADD CONSTRAINT "HelpRequest_rejected_has_reason" CHECK (
    "moderationStatus" <> 'REJECTED' OR "rejectionReason" IS NOT NULL
  ),
  ADD CONSTRAINT "HelpRequest_cancelled_has_date" CHECK (
    "status" <> 'CANCELLED' OR "cancelledAt" IS NOT NULL
  ),
  ADD CONSTRAINT "HelpRequest_completed_has_date" CHECK (
    "status" <> 'COMPLETED' OR "completedAt" IS NOT NULL
  );

-- A cancelled registration records when it was cancelled.
ALTER TABLE "TaskRegistration"
  ADD CONSTRAINT "TaskRegistration_cancelled_has_date" CHECK (
    "status" <> 'CANCELLED' OR "cancelledAt" IS NOT NULL
  );

-- At most one confirmed registration per user per task (cancelled rows are kept as history).
CREATE UNIQUE INDEX "TaskRegistration_one_confirmed_per_user"
  ON "TaskRegistration" ("taskId", "userId")
  WHERE "status" = 'CONFIRMED';

-- At most one accepted offer per help request.
CREATE UNIQUE INDEX "HelpOffer_one_accepted_per_request"
  ON "HelpOffer" ("requestId")
  WHERE "status" = 'ACCEPTED';

-- At most one active (pending or accepted) offer per volunteer per request.
CREATE UNIQUE INDEX "HelpOffer_one_active_per_volunteer"
  ON "HelpOffer" ("requestId", "volunteerId")
  WHERE "status" IN ('PENDING', 'ACCEPTED');

-- Offers record when they were decided or withdrawn.
ALTER TABLE "HelpOffer"
  ADD CONSTRAINT "HelpOffer_decided_has_date" CHECK (
    "status" NOT IN ('ACCEPTED', 'DECLINED') OR "decidedAt" IS NOT NULL
  ),
  ADD CONSTRAINT "HelpOffer_withdrawn_has_date" CHECK (
    "status" <> 'WITHDRAWN' OR "withdrawnAt" IS NOT NULL
  );
