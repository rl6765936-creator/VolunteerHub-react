import { useQuery } from "@tanstack/react-query";
import { getHelpRequestImages } from "../services/helpRequestsApi";
import useAuth from "./useAuth";

const useHelpRequestImages = (requestId: string) => {
  const { token } = useAuth();

  return useQuery({
    queryKey: ["helpRequestImages", requestId, token],
    queryFn: () => getHelpRequestImages(requestId, token ?? undefined),
  });
};

export default useHelpRequestImages;
