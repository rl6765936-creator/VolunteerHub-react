import useMyHelpRequests from "../hooks/useMyHelpRequests";
import useAuth from "../hooks/useAuth";
import HelpRequestCard from "../components/HelpRequestCard";

const MyHelpRequestsPage = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const { data, isPending, isError } = useMyHelpRequests();

  if (isLoading) {
    return <p>בודק התחברות...</p>;
  }

  if (!isAuthenticated) {
    return <p>יש להתחבר כדי לצפות בבקשות שלך.</p>;
  }

  if (isPending) {
    return <p>טוען את הבקשות שלך...</p>;
  }

  if (isError) {
    return <p>אירעה שגיאה בטעינת הבקשות.</p>;
  }

  return (
    <main>
      <h1>הבקשות שלי</h1>

      {data.data.length === 0 ? (
        <p>עדיין לא יצרת בקשות עזרה.</p>
      ) : (
        <div>
          {data.data.map((request) => (
            <HelpRequestCard key={request.id} request={request} canEdit />
          ))}
        </div>
      )}
    </main>
  );
};

export default MyHelpRequestsPage;
