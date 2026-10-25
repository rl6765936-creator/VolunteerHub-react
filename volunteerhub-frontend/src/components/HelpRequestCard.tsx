import { Link } from "react-router";
import type { HelpRequest, HelpRequestStatus, ModerationStatus } from "../types/helpRequest";
import HelpRequestImages from "./HelpRequestImages";

const getModerationLabel = (status: ModerationStatus) => {
  switch (status) {
    case "PENDING_REVIEW":
      return "ממתין לאישור מנהל";
    case "APPROVED":
      return "מאושר";
    case "REJECTED":
      return "נדחה";
  }
};

const getStatusLabel = (status: HelpRequestStatus) => {
  switch (status) {
    case "OPEN":
      return "פתוחה";
    case "IN_PROGRESS":
      return "בטיפול";
    case "COMPLETED":
      return "הושלמה";
    case "CANCELLED":
      return "בוטלה";
  }
};

type HelpRequestCardProps = {
  request: HelpRequest;
  canEdit?: boolean;
};

const HelpRequestCard = ({ request, canEdit = false }: HelpRequestCardProps) => {
  return (
    <article>
      <h2>{request.title}</h2>
      <p>{request.description}</p>
      <p>קטגוריה: {request.category.name}</p>
      <p>אזור: {request.region}</p>
      {request.neededBy && (
        <p>נדרש עד: {new Date(request.neededBy).toLocaleString("he-IL")}</p>
      )}
      <p>מבקש/ת: {request.owner.name}</p>
      <p>סטטוס הבקשה: {getStatusLabel(request.status)}</p>
      <p>הצעות עזרה פעילות: {request.activeOfferCount}</p>

      {request.imageCount > 0 && <HelpRequestImages requestId={request.id} />}

      {/* The server allows editing while the request is OPEN, in any moderation state. */}
      {canEdit && request.status === "OPEN" && (
        <Link to={`/requests/${request.id}/edit`}>עריכת בקשה</Link>
      )}

      {request.moderationStatus === "REJECTED" && request.rejectionReason && (
        <section>
          <strong>❌ הבקשה נדחתה</strong>
          <p>הסיבה: {request.rejectionReason}</p>
        </section>
      )}

      {canEdit && (
        <p>
          סטטוס אישור: {getModerationLabel(request.moderationStatus)}
          {request.underReModeration && " (נערכה אחרי אישור, ממתינה לבדיקה חוזרת)"}
        </p>
      )}
    </article>
  );
};

export default HelpRequestCard;
