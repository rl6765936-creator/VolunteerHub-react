import { useMutation, useQueryClient } from "@tanstack/react-query";
import { acceptOffer } from "../services/offersApi";
import useAuth from "./useAuth";

export function useAcceptOffer(requestId: string) {
  const queryClient = useQueryClient();
  const { token } = useAuth();

  return useMutation({
    mutationFn: (offerId: string) => {
      if (!token) {
        throw new Error("Authentication required");
      }

      return acceptOffer(offerId, token);
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["requestOffers", requestId] });
      queryClient.invalidateQueries({ queryKey: ["myHelpRequests"] });
      queryClient.invalidateQueries({ queryKey: ["helpRequests"] });
    },
  });
}
