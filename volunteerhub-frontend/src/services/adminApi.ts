import type { HelpRequestDetailResponse, HelpRequestsResponse } from "../types/helpRequest";

const API_URL = import.meta.env.VITE_API_URL;

/** The moderation queue. Unlike VoiceUp, the server has no default filter, so it is sent explicitly. */
const getPendingHelpRequests = async (token: string): Promise<HelpRequestsResponse> => {
  const response = await fetch(`${API_URL}/admin/requests?moderationStatus=PENDING_REVIEW`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch pending help requests");
  }

  return response.json();
};

const approveHelpRequest = async (
  requestId: string,
  token: string
): Promise<HelpRequestDetailResponse> => {
  const response = await fetch(`${API_URL}/admin/requests/${requestId}/approve`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    throw new Error("Failed to approve help request");
  }

  return response.json();
};

const rejectHelpRequest = async (
  requestId: string,
  reason: string,
  token: string
): Promise<HelpRequestDetailResponse> => {
  const response = await fetch(`${API_URL}/admin/requests/${requestId}/reject`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ reason }),
  });

  if (!response.ok) {
    throw new Error("Failed to reject help request");
  }

  return response.json();
};

export { getPendingHelpRequests, approveHelpRequest, rejectHelpRequest };
