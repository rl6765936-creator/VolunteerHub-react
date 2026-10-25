import { useQuery } from "@tanstack/react-query";
import useAuth from "./useAuth";
import { getMyHelpRequests } from "../services/helpRequestsApi";

const useMyHelpRequests = () => {
  const { token, user } = useAuth();

  return useQuery({
    queryKey: ["myHelpRequests", user?.id],
    queryFn: () => {
      if (!token) {
        throw new Error("Authentication required");
      }

      return getMyHelpRequests(token);
    },
    enabled: token !== null && user !== null,
  });
};

export default useMyHelpRequests;
