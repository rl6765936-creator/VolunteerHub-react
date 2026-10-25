import { Link } from "react-router";
import type { HelpRequest, HelpRequestStatus, ModerationStatus } from "../types/helpRequest";
import HelpRequestImages from "./HelpRequestImages";
import { useState } from "react";
import useAuth from "../hooks/useAuth";
import { useCompleteHelpRequest } from "../hooks/useCompleteHelpRequest";
import OfferHelp from "./OfferHelp";
import RequestOffers from "./RequestOffers";

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
  const { user } = useAuth();
  const [showOffers, setShowOffers] = useState(false);
  const [showOfferForm, setShowOfferForm] = useState(false);
  const { mutate: complete, isPending: isCompleting, isError: completeFailed } = useCompleteHelpRequest();

  const isOwner = user?.id === request.owner.id;
  const isOpenForOffers = request.moderationStatus === "APPROVED" && request.status === "OPEN";

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

      {/* Volunteers: offer help (like the 👍 / comments of VoiceUp's IssueCard). */}
      {!isOwner && isOpenForOffers && (
        <>
          <button
            type="button"
            aria-expanded={showOfferForm}
            onClick={() => setShowOfferForm((prev) => !prev)}
          >
            {showOfferForm ? "סגירה" : "🙋 הצעת עזרה"}
          </button>

          {showOfferForm && <OfferHelp requestId={request.id} />}
        </>
      )}

      {/* Owner: see the offers, accept one, then mark the request as completed. */}
      {canEdit && request.moderationStatus === "APPROVED" && (
        <>
          <button
            type="button"
            aria-expanded={showOffers}
            onClick={() => setShowOffers((prev) => !prev)}
          >
            {showOffers ? "הסתר הצעות" : "הצג הצעות עזרה"}
          </button>

          {showOffers && <RequestOffers requestId={request.id} canAccept={request.status === "OPEN"} />}
        </>
      )}

      {canEdit && request.status === "IN_PROGRESS" && (
        <button type="button" disabled={isCompleting} onClick={() => complete(request.id)}>
          ✅ סימון הבקשה כהושלמה
        </button>
      )}
      {completeFailed && <p role="alert">העדכון נכשל. נסו שוב.</p>}

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
