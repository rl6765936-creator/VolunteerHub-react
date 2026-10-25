import HelpRequestCard from "../components/HelpRequestCard";
import useHelpRequests from "../hooks/useHelpRequests";

const HelpRequestsPage = () => {
  const { data, isPending, isError } = useHelpRequests();

  if (isPending) {
    return <p>טוען בקשות עזרה...</p>;
  }

  if (isError) {
    return <p>שגיאה בטעינת בקשות העזרה</p>;
  }

  if (data.data.length === 0) {
    return <p>אין בקשות עזרה פתוחות כרגע</p>;
  }

  return (
    <div>
      <h1>בקשות עזרה</h1>
      <div>
        {data.data.map((request) => (
          <HelpRequestCard key={request.id} request={request} />
        ))}
      </div>
    </div>
  );
};

export default HelpRequestsPage;
