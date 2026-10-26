import { useMutation, useQueryClient } from "@tanstack/react-query";
import useAuth from "./useAuth";
import { approveHelpRequest } from "../services/adminApi";

export function useApproveHelpRequest() {
  const { token } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (requestId: string) => {
      if (!token) {
        throw new Error("Authentication required");
      }

      return approveHelpRequest(requestId, token);
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adminHelpRequests"] });
      queryClient.invalidateQueries({ queryKey: ["helpRequests"] });
      queryClient.invalidateQueries({ queryKey: ["myHelpRequests"] });
    },
  });
}
