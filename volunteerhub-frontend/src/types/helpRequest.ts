// Types of the VolunteerHub help-request API (GET/POST/PATCH /api/requests, /api/users/me/requests,
// /api/admin/requests). Dates arrive as ISO strings.

export type ModerationStatus = "PENDING_REVIEW" | "APPROVED" | "REJECTED";

export type HelpRequestStatus = "OPEN" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

export type PaginationMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

/** List item. Never contains the address or contact details. */
export type HelpRequest = {
  id: string;
  title: string;
  description: string;
  region: string;
  neededBy: string | null;

  category: {
    id: string;
    name: string;
    slug: string;
  };

  owner: {
    id: string;
    name: string;
  };

  moderationStatus: ModerationStatus;
  /** Approved once, edited, and now waiting for review again. */
  underReModeration: boolean;
  status: HelpRequestStatus;

  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;

  activeOfferCount: number;
  imageCount: number;

  /** Only in the owner's list and the admin list. */
  rejectionReason?: string | null;
};

export type HelpRequestsResponse = {
  data: HelpRequest[];
  meta: PaginationMeta;
};

/** GET /api/requests/:id. privateDetails is null unless the viewer is the owner, an admin or the accepted volunteer. */
export type HelpRequestDetail = HelpRequest & {
  completedAt: string | null;
  cancelledAt: string | null;
  reviewedAt?: string | null;
  privateDetails: {
    addressDetails: string | null;
    contact: {
      name: string;
      email: string;
      phone: string | null;
    };
  } | null;
  acceptedVolunteer: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
  } | null;
  viewer: {
    isOwner: boolean;
    myOffer: { id: string; status: string } | null;
  };
};

export type HelpRequestDetailResponse = {
  data: HelpRequestDetail;
};

export type UpdateHelpRequestResponse = {
  data: HelpRequestDetail;
  meta: {
    changedFields: string[];
    reModeration: boolean;
  };
};

export type CreateHelpRequestRequest = {
  title: string;
  description: string;
  categoryId: string;
  region: string;
  addressDetails?: string;
  /** ISO date-time, must be in the future. */
  neededBy?: string;
};

/** PATCH body. addressDetails: null clears the address. */
export type UpdateHelpRequestRequest = {
  title?: string;
  description?: string;
  categoryId?: string;
  region?: string;
  addressDetails?: string | null;
  neededBy?: string | null;
};

export type HelpRequestAttachment = {
  id: string;
  requestId: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  /** Relative to the API origin, e.g. /api/attachments/:id/file */
  url: string;
};

export type HelpRequestAttachmentsResponse = {
  data: HelpRequestAttachment[];
};
