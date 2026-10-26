import useHelpRequestImages from "../hooks/useHelpRequestImages";
import HelpRequestImage from "./HelpRequestImage";

const HelpRequestImages = ({ requestId }: { requestId: string }) => {
  const { data, isPending, isError } = useHelpRequestImages(requestId);

  if (isPending) return <p>טוען תמונות...</p>;
  if (isError) return <p>שגיאה בטעינת התמונות</p>;
  if (!data.data.length) return null;

  return (
    <div>
      {data.data.map((image) => (
        <HelpRequestImage key={image.id} url={image.url} />
      ))}
    </div>
  );
};

export default HelpRequestImages;
