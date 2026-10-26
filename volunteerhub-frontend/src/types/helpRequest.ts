

export type ModerationStatus = "PENDING_REVIEW" | "APPROVED" | "REJECTED";

export type HelpRequestStatus = "OPEN" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

export type PaginationMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

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
  underReModeration: boolean;
  status: HelpRequestStatus;

  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;

  activeOfferCount: number;
  imageCount: number;

  rejectionReason?: string | null;
};

export type HelpRequestsResponse = {
  data: HelpRequest[];
  meta: PaginationMeta;
};

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
  neededBy?: string;
};

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
  url: string;
};

export type HelpRequestAttachmentsResponse = {
  data: HelpRequestAttachment[];
};
