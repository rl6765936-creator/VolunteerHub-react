import type { HelpOfferResponse, HelpOffersResponse } from "../types/offer";

const API_URL = import.meta.env.VITE_API_URL;

/** A volunteer offers help on an approved, open request. message: 5-1000 characters. */
const createOffer = async (
  requestId: string,
  message: string,
  token: string
): Promise<HelpOfferResponse> => {
  const response = await fetch(`${API_URL}/requests/${requestId}/offers`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message }),
  });

  if (!response.ok) {
    throw new Error("Failed to send offer");
  }

  return response.json();
};

/** The owner gets every offer on the request. */
const getRequestOffers = async (requestId: string, token: string): Promise<HelpOffersResponse> => {
  const response = await fetch(`${API_URL}/requests/${requestId}/offers`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch offers");
  }

  return response.json();
};

/** Owner only. The other pending offers are declined and the request becomes IN_PROGRESS. */
const acceptOffer = async (offerId: string, token: string): Promise<HelpOfferResponse> => {
  const response = await fetch(`${API_URL}/offers/${offerId}/accept`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error("Failed to accept offer");
  }

  return response.json();
};

export { createOffer, getRequestOffers, acceptOffer };
