import { useQuery } from "@tanstack/react-query";
import useAuth from "./useAuth";
import type { HelpRequestsResponse } from "../types/helpRequest";
import { getPendingHelpRequests } from "../services/adminApi";

export function useAdminHelpRequests() {
  const { token } = useAuth();

  return useQuery<HelpRequestsResponse>({
    queryKey: ["adminHelpRequests"],
    queryFn: () => {
      if (!token) {
        throw new Error("Authentication required");
      }

      return getPendingHelpRequests(token);
    },
    enabled: token !== null,
  });
}
