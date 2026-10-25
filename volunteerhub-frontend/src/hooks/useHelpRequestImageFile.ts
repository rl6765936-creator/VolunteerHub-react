import { useQuery } from "@tanstack/react-query";
import { getHelpRequestImageFile } from "../services/helpRequestsApi";
import useAuth from "./useAuth";

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Failed to read image"));
    };
    reader.onerror = () => reject(new Error("Failed to read image"));
    reader.readAsDataURL(blob);
  });

/**
 * Loads one image file with the viewer's token (images of a request under review are not
 * public). Returns a data: URL, so there is no object URL to revoke and no state set inside
 * an effect (VoiceUp's IssueImage did that with useEffect + useState).
 */
const useHelpRequestImageFile = (url: string) => {
  const { token } = useAuth();

  return useQuery({
    queryKey: ["helpRequestImageFile", url, token],
    queryFn: async () => blobToDataUrl(await getHelpRequestImageFile(url, token ?? undefined)),
  });
};

export default useHelpRequestImageFile;
