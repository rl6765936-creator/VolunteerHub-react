import useHelpRequestImageFile from "../hooks/useHelpRequestImageFile";

const HelpRequestImage = ({ url }: { url: string }) => {
  const { data: src, isPending, isError } = useHelpRequestImageFile(url);

  if (isError) return <p>שגיאה בטעינת התמונה</p>;
  if (isPending) return <p>טוען תמונה...</p>;

  return <img src={src} alt="תמונה מצורפת לבקשה" width={250} />;
};

export default HelpRequestImage;
