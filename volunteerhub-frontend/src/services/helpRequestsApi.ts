import type {
  CreateHelpRequestRequest,
  HelpRequestAttachmentsResponse,
  HelpRequestDetailResponse,
  HelpRequestsResponse,
  UpdateHelpRequestRequest,
  UpdateHelpRequestResponse,
} from "../types/helpRequest";

const API_URL = import.meta.env.VITE_API_URL;

const getHelpRequests = async (status: string, page: number): Promise<HelpRequestsResponse> => {
  const params = new URLSearchParams({ status, page: String(page), pageSize: "20" });

  const response = await fetch(`${API_URL}/requests?${params}`);

  if (!response.ok) {
    throw new Error("Failed to fetch help requests");
  }

  return response.json();
};

const getMyHelpRequests = async (token: string): Promise<HelpRequestsResponse> => {
  const response = await fetch(`${API_URL}/users/me/requests`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch my help requests");
  }

  return response.json();
};

const getHelpRequest = async (
  requestId: string,
  token?: string
): Promise<HelpRequestDetailResponse> => {
  const response = await fetch(`${API_URL}/requests/${requestId}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!response.ok) {
    throw new Error("Failed to fetch help request");
  }

  return response.json();
};

const createHelpRequest = async (
  data: CreateHelpRequestRequest,
  token: string
): Promise<HelpRequestDetailResponse> => {
  const response = await fetch(`${API_URL}/requests`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error("Failed to create help request");
  }

  return response.json();
};

const uploadHelpRequestImage = async (requestId: string, file: File, token: string) => {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_URL}/requests/${requestId}/attachments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error("Failed to upload help request image");
  }

  return response.json();
};

const getHelpRequestImages = async (
  requestId: string,
  token?: string
): Promise<HelpRequestAttachmentsResponse> => {
  const response = await fetch(`${API_URL}/requests/${requestId}/attachments`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!response.ok) {
    throw new Error("Failed to fetch help request images");
  }

  return response.json();
};

const getHelpRequestImageFile = async (url: string, token?: string): Promise<Blob> => {
  const apiOrigin = new URL(API_URL).origin;
  const imageUrl = new URL(url, apiOrigin);

  const response = await fetch(imageUrl, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!response.ok) {
    throw new Error("Failed to load image");
  }

  return response.blob();
};

const updateHelpRequest = async (
  requestId: string,
  data: UpdateHelpRequestRequest,
  token: string
): Promise<UpdateHelpRequestResponse> => {
  const response = await fetch(`${API_URL}/requests/${requestId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error("Failed to update help request");
  }

  return response.json();
};

const completeHelpRequest = async (
  requestId: string,
  token: string
): Promise<HelpRequestDetailResponse> => {
  const response = await fetch(`${API_URL}/requests/${requestId}/complete`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error("Failed to complete help request");
  }

  return response.json();
};

export {
  getHelpRequests,
  getMyHelpRequests,
  getHelpRequest,
  createHelpRequest,
  uploadHelpRequestImage,
  getHelpRequestImages,
  getHelpRequestImageFile,
  updateHelpRequest,
  completeHelpRequest,
};
