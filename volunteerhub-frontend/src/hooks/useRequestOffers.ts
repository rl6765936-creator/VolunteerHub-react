import { useQuery } from "@tanstack/react-query";
import { getRequestOffers } from "../services/offersApi";
import useAuth from "./useAuth";

export function useRequestOffers(requestId: string) {
  const { token } = useAuth();

  return useQuery({
    queryKey: ["requestOffers", requestId],
    queryFn: () => {
      if (!token) {
        throw new Error("Authentication required");
      }

      return getRequestOffers(requestId, token);
    },
    enabled: token !== null,
  });
}
