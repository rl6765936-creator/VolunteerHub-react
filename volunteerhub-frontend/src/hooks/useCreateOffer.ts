import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createOffer } from "../services/offersApi";
import useAuth from "./useAuth";

/** Adapted from VoiceUp's useAddComment: a volunteer sends a help offer on a request. */
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
      // The public list shows the number of active offers.
      queryClient.invalidateQueries({ queryKey: ["helpRequests"] });
    },
  });
}
