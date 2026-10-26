import { useState } from "react";
import HelpRequestCard from "../components/HelpRequestCard";
import useHelpRequests from "../hooks/useHelpRequests";

const HelpRequestsPage = () => {
  const [selectedStatus, setSelectedStatus] = useState("OPEN");
  const [page, setPage] = useState(1);
  const { data, isPending, isError } = useHelpRequests(selectedStatus, page);

  if (isPending) {
    return <p className="vh-state">טוען בקשות עזרה...</p>;
  }

  if (isError) {
    return <p className="vh-state vh-state--error">שגיאה בטעינת בקשות העזרה</p>;
  }

  return (
    <div>
      <div className="vh-page-head">
        <div className="vh-page-head__text">
          <h1 className="vh-title">בקשות עזרה</h1>
          <p className="vh-subtitle">בחרו בקשה וטפסו אליה. כל הצעת עזרה היא עוד שליבה בסולם.</p>
        </div>
      </div>

      <div className="vh-toolbar">
      <label className="vh-label" htmlFor="statusFilter">סינון לפי סטטוס:</label>
      <select
        id="statusFilter"
        className="vh-input"
        value={selectedStatus}
        onChange={(e) => { setSelectedStatus(e.target.value); setPage(1); }}
      >
        <option value="OPEN">פתוחות</option>
        <option value="IN_PROGRESS">בטיפול</option>
        <option value="COMPLETED">הושלמו</option>
        <option value="CANCELLED">בוטלו</option>
      </select>
      </div>

      {data.data.length === 0 ? (
        <p className="vh-state">אין בקשות עזרה בסטטוס שנבחר</p>
      ) : (
        <div className="vh-grid">
        {data.data.map((request) => (
          <HelpRequestCard key={request.id} request={request} />
        ))}
        </div>
      )}

      <div className="vh-pager">
        <button
          type="button"
          className="vh-btn vh-btn--cloud vh-btn--small"
          disabled={page === 1}
          onClick={() => setPage((prev) => prev - 1)}
        >
          הקודם
        </button>

        <span className="vh-pager__text"> עמוד {page} מתוך {data.meta.totalPages} </span>

        <button
          type="button"
          className="vh-btn vh-btn--cloud vh-btn--small"
          disabled={page >= data.meta.totalPages}
          onClick={() => setPage((prev) => prev + 1)}
        >
          הבא
        </button>
      </div>
    </div>
  );
};

export default HelpRequestsPage;
