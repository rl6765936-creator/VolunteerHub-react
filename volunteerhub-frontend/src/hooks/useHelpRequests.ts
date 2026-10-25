import { useQuery } from "@tanstack/react-query";
import { getHelpRequests } from "../services/helpRequestsApi";

const useHelpRequests = () => {
  return useQuery({
    queryKey: ["helpRequests"],
    queryFn: getHelpRequests,
  });
};

export default useHelpRequests;
