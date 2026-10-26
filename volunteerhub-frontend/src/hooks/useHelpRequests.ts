import { useQuery } from "@tanstack/react-query";
import { getHelpRequests } from "../services/helpRequestsApi";

const useHelpRequests = (status: string, page: number) => {
  return useQuery({
    queryKey: ["helpRequests", status, page],
    queryFn: () => getHelpRequests(status, page),
  });
};

export default useHelpRequests;
