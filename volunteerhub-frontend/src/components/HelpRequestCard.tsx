import { Link } from "react-router";
import type { HelpRequest, HelpRequestStatus, ModerationStatus } from "../types/helpRequest";
import HelpRequestImages from "./HelpRequestImages";
import { useState } from "react";
import useAuth from "../hooks/useAuth";
import { useCompleteHelpRequest } from "../hooks/useCompleteHelpRequest";
import OfferHelp from "./OfferHelp";
import RequestOffers from "./RequestOffers";
import HeartIcon from "../design/HeartIcon";
import RequestLadder from "../design/RequestLadder";

const getModerationLabel = (status: ModerationStatus) => {
  switch (status) {
    case "PENDING_REVIEW":
      return "ממתין לאישור מנהל";
    case "APPROVED":
      return "מאושר";
    case "REJECTED":
      return "נדחה";
    default:
      return status;
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

/** Design only: a chip colour per status / moderation state. */
const statusChip = (status: HelpRequestStatus) =>
  status === "OPEN" ? "vh-chip vh-chip--teal" : status === "IN_PROGRESS" ? "vh-chip vh-chip--amber" : status === "COMPLETED" ? "vh-chip vh-chip--mint" : "vh-chip";
const moderationChip = (status: ModerationStatus) =>
  status === "APPROVED" ? "vh-chip vh-chip--mint" : status === "REJECTED" ? "vh-chip vh-chip--pink" : "vh-chip vh-chip--lilac";

type HelpRequestCardProps = {
  request: HelpRequest;
  canEdit?: boolean;
};

const HelpRequestCard = ({ request, canEdit = false }: HelpRequestCardProps) => {
  const { user } = useAuth();
  const [showOffers, setShowOffers] = useState(false);
  const [showOfferForm, setShowOfferForm] = useState(false);
  const { mutate: complete, isPending: isCompleting, isError: completeFailed } = useCompleteHelpRequest();

  const isOwner = user?.id === request.owner.id;
  const isOpenForOffers = request.moderationStatus === "APPROVED" && request.status === "OPEN";

  return (
    <article className="vh-card">
      <HeartIcon size={40} color="#E3304C" className="vh-card__peek" />

      <div className="vh-card__body">
      {canEdit && <RequestLadder request={request} />}

      <div className="vh-card__main">
      <div className="vh-card__row">
        <span className="vh-chip vh-chip--pink">קטגוריה: {request.category.name}</span>
        <span className={statusChip(request.status)}>סטטוס הבקשה: {getStatusLabel(request.status)}</span>
        {canEdit && (
          <span className={moderationChip(request.moderationStatus)}>
            סטטוס אישור: {getModerationLabel(request.moderationStatus)}
            {request.underReModeration && " (נערכה אחרי אישור, ממתינה לבדיקה חוזרת)"}
          </span>
        )}
      </div>

      <h2 className="vh-card__title">{request.title}</h2>
      <p className="vh-card__text">{request.description}</p>

      <p className="vh-meta">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg>
        אזור: {request.region}
      </p>
      {request.neededBy && (
        <p className="vh-meta">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="4" /><path d="M8 3v4M16 3v4M3 10h18" /></svg>
          נדרש עד: {new Date(request.neededBy).toLocaleString("he-IL")}
        </p>
      )}

      <div className="vh-card__row vh-card__row--between">
        <p className="vh-meta">מבקש/ת: {request.owner.name}</p>
        <span className={request.activeOfferCount > 0 ? "vh-chip vh-chip--heart" : "vh-chip"}>
          <HeartIcon size={14} />
          הצעות עזרה פעילות: {request.activeOfferCount}
        </span>
      </div>

      {request.imageCount > 0 && <HelpRequestImages requestId={request.id} />}

      <div className="vh-card__actions">
      {!isOwner && isOpenForOffers && (
          <button
            type="button"
            className={showOfferForm ? "vh-btn vh-btn--plain vh-btn--small" : "vh-btn vh-btn--heart vh-btn--small"}
            aria-expanded={showOfferForm}
            onClick={() => setShowOfferForm((prev) => !prev)}
          >
            {showOfferForm ? "סגירה" : <><HeartIcon size={16} /> הצעת עזרה</>}
          </button>
      )}
      {canEdit && request.moderationStatus === "APPROVED" && (
          <button
            type="button"
            className="vh-btn vh-btn--cloud vh-btn--small"
            aria-expanded={showOffers}
            onClick={() => setShowOffers((prev) => !prev)}
          >
            {showOffers ? "הסתר הצעות" : "הצג הצעות עזרה"}
          </button>
      )}
      {canEdit && request.status === "IN_PROGRESS" && (
        <button type="button" className="vh-btn vh-btn--heart vh-btn--small" disabled={isCompleting} onClick={() => complete(request.id)}>
          סימון הבקשה כהושלמה
        </button>
      )}
      {canEdit && request.status === "OPEN" && (
        <Link to={`/requests/${request.id}/edit`} className="vh-btn vh-btn--soft vh-btn--small">עריכת בקשה</Link>
      )}
      </div>

      {!isOwner && isOpenForOffers && showOfferForm && <OfferHelp requestId={request.id} />}
      {canEdit && request.moderationStatus === "APPROVED" && showOffers && (
        <RequestOffers requestId={request.id} canAccept={request.status === "OPEN"} />
      )}
      {completeFailed && <p className="vh-alert" role="alert">העדכון נכשל. נסו שוב.</p>}

      {request.moderationStatus === "REJECTED" && request.rejectionReason && (
        <section className="vh-rejected">
          <strong>הבקשה נדחתה</strong>
          <p>הסיבה: {request.rejectionReason}</p>
        </section>
      )}
      </div>
      </div>
    </article>
  );
};

export default HelpRequestCard;
