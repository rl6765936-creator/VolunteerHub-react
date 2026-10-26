import useMyHelpRequests from "../hooks/useMyHelpRequests";
import useAuth from "../hooks/useAuth";
import HelpRequestCard from "../components/HelpRequestCard";
import { Link } from "react-router";

const MyHelpRequestsPage = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const { data, isPending, isError } = useMyHelpRequests();

  if (isLoading) {
    return <p className="vh-state">בודק התחברות...</p>;
  }

  if (!isAuthenticated) {
    return <p className="vh-state">יש להתחבר כדי לצפות בבקשות שלך.</p>;
  }

  if (isPending) {
    return <p className="vh-state">טוען את הבקשות שלך...</p>;
  }

  if (isError) {
    return <p className="vh-state vh-state--error">אירעה שגיאה בטעינת הבקשות.</p>;
  }

  return (
    <main>
      <div className="vh-page-head">
        <div className="vh-page-head__text">
          <h1 className="vh-title">הבקשות שלי</h1>
          <p className="vh-subtitle">הסולם שליד כל בקשה מראה כמה היא כבר טיפסה.</p>
        </div>
        <Link to="/requests/new" className="vh-btn vh-btn--heart">בקשה חדשה</Link>
      </div>

      {data.data.length === 0 ? (
        <p className="vh-state">עדיין לא יצרת בקשות עזרה.</p>
      ) : (
        <div className="vh-grid">
          {data.data.map((request) => (
            <HelpRequestCard key={request.id} request={request} canEdit />
          ))}
        </div>
      )}
    </main>
  );
};

export default MyHelpRequestsPage;
