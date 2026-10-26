import useHelpRequestImages from "../hooks/useHelpRequestImages";
import HelpRequestImage from "./HelpRequestImage";

const HelpRequestImages = ({ requestId }: { requestId: string }) => {
  const { data, isPending, isError } = useHelpRequestImages(requestId);

  if (isPending) return <p className="vh-hint">טוען תמונות...</p>;
  if (isError) return <p className="vh-hint">שגיאה בטעינת התמונות</p>;
  if (!data.data.length) return null;

  return (
    <div className="vh-card__images">
      {data.data.map((image) => (
        <HelpRequestImage key={image.id} url={image.url} />
      ))}
    </div>
  );
};

export default HelpRequestImages;
