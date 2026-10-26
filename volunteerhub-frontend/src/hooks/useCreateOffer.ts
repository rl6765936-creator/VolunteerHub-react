import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createOffer } from "../services/offersApi";
import useAuth from "./useAuth";

export function useCreateOffer(requestId: string) {
  const queryClient = useQueryClient();
  const { token } = useAuth();

  return useMutation({
    mutationFn: (message: string) => {
      if (!token) {
        throw new Error("Authentication required");
      }

      return createOffer(requestId, message, token);
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["helpRequests"] });
    },
  });
}
