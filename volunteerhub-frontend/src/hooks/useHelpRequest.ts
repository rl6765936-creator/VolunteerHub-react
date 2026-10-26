import { useQuery } from "@tanstack/react-query";
import useAuth from "./useAuth";
import { getHelpRequest } from "../services/helpRequestsApi";

/**
 * One request with its detail view. Used by the edit page: unlike VoiceUp, the list items
 * never include the address, so the form has to load it from the detail endpoint.
 */
const useHelpRequest = (requestId: string | undefined) => {
  const { token } = useAuth();

  return useQuery({
    queryKey: ["helpRequest", requestId, token],
    queryFn: () => {
      if (!requestId) {
        throw new Error("Missing request id");
      }

      return getHelpRequest(requestId, token ?? undefined);
    },
    enabled: requestId !== undefined,
  });
};

export default useHelpRequest;
