import { useMutation, useQueryClient } from "@tanstack/react-query";
import useAuth from "./useAuth";
import { rejectHelpRequest } from "../services/adminApi";

export function useRejectHelpRequest() {
  const { token } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ requestId, reason }: { requestId: string; reason: string }) => {
      if (!token) {
        throw new Error("Authentication required");
      }

      return rejectHelpRequest(requestId, reason, token);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adminHelpRequests"] });
      queryClient.invalidateQueries({ queryKey: ["helpRequests"] });
      queryClient.invalidateQueries({ queryKey: ["myHelpRequests"] });
    },
  });
}
