import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createHelpRequest, uploadHelpRequestImage } from "../services/helpRequestsApi";
import { useNavigate } from "react-router";
import useAuth from "./useAuth";
import type { CreateHelpRequestRequest } from "../types/helpRequest";

type CreateHelpRequestVariables = {
  data: CreateHelpRequestRequest;
  images: File[];
};

const useCreateHelpRequest = () => {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: async ({ data, images }: CreateHelpRequestVariables) => {
      const token = auth.token;

      if (!token) {
        throw new Error("Authentication required");
      }

      const response = await createHelpRequest(data, token);

      const results = await Promise.allSettled(
        images.map((file) => uploadHelpRequestImage(response.data.id, file, token))
      );

      const failedCount = results.filter((result) => result.status === "rejected").length;

      return {
        ...response,
        failedCount,
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["myHelpRequests", auth.user?.id],
      });
      navigate("/my-requests");
    },
  });
};

export default useCreateHelpRequest;
