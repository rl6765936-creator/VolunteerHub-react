import { useMutation, useQueryClient } from "@tanstack/react-query";
import { completeHelpRequest } from "../services/helpRequestsApi";
import useAuth from "./useAuth";

export function useCompleteHelpRequest() {
  const queryClient = useQueryClient();
  const { token } = useAuth();

  return useMutation({
    mutationFn: (requestId: string) => {
      if (!token) {
        throw new Error("Authentication required");
      }

      return completeHelpRequest(requestId, token);
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["myHelpRequests"] });
    },
  });
}
