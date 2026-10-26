import useHelpRequestImageFile from "../hooks/useHelpRequestImageFile";

const HelpRequestImage = ({ url }: { url: string }) => {
  const { data: src, isPending, isError } = useHelpRequestImageFile(url);

  if (isError) return <p className="vh-hint">שגיאה בטעינת התמונה</p>;
  if (isPending) return <p className="vh-hint">טוען תמונה...</p>;

  return <img className="vh-card__image" src={src} alt="תמונה מצורפת לבקשה" width={250} />;
};

export default HelpRequestImage;
