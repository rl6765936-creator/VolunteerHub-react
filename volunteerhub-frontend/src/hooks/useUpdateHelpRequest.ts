import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateHelpRequest } from "../services/helpRequestsApi";
import useAuth from "./useAuth";
import type { UpdateHelpRequestRequest } from "../types/helpRequest";

type UpdateHelpRequestVariables = {
  requestId: string;
  data: UpdateHelpRequestRequest;
};

const useUpdateHelpRequest = () => {
  const { token, user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ requestId, data }: UpdateHelpRequestVariables) => {
      if (!token) {
        throw new Error("Authentication required");
      }

      return updateHelpRequest(requestId, data, token);
    },

    onSuccess: (_response, { requestId }) => {
      queryClient.invalidateQueries({
        queryKey: ["myHelpRequests", user?.id],
      });

      queryClient.invalidateQueries({
        queryKey: ["helpRequests"],
      });

      queryClient.invalidateQueries({
        queryKey: ["helpRequest", requestId],
      });
    },
  });
};

export default useUpdateHelpRequest;
