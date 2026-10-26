import { useQuery } from "@tanstack/react-query";
import useAuth from "./useAuth";
import { getHelpRequest } from "../services/helpRequestsApi";

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
