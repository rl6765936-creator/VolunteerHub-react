// Types of the help-offer API (POST/GET /api/requests/:id/offers, POST /api/offers/:id/accept).

export type OfferStatus = "PENDING" | "ACCEPTED" | "DECLINED" | "WITHDRAWN";

export type HelpOffer = {
  id: string;
  requestId: string;
  status: OfferStatus;
  message: string;
  createdAt: string;

  volunteer: {
    id: string;
    name: string;
    skills: string[];
    region: string | null;
  };

  /** Only on the accepted offer, and only for the request owner (and admins). */
  contact: { email: string; phone: string | null } | null;
};

export type HelpOffersResponse = {
  data: HelpOffer[];
};

export type HelpOfferResponse = {
  data: HelpOffer;
};
