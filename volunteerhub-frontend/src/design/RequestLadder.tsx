import type { HelpRequest } from "../types/helpRequest";
import StepLadder from "./StepLadder";

/**
 * Shows how far a request has climbed: sent → approved → in progress → completed.
 * Only reads fields the API already returns (moderationStatus, status); no new data.
 */
const RequestLadder = ({ request }: { request: HelpRequest }) => {
  const approved = request.moderationStatus === "APPROVED" || request.status === "IN_PROGRESS" || request.status === "COMPLETED";
  const inProgress = request.status === "IN_PROGRESS" || request.status === "COMPLETED";
  const completed = request.status === "COMPLETED";

  const steps = [
    { label: "נשלחה", done: true },
    { label: "אושרה", done: approved && !request.underReModeration },
    { label: "בטיפול", done: inProgress },
    { label: "הושלמה", done: completed },
  ];

  const current = completed
    ? "הושלמה"
    : inProgress
      ? "בטיפול"
      : request.moderationStatus === "REJECTED"
        ? "נדחתה"
        : approved && !request.underReModeration
          ? "אושרה ומחכה להצעות"
          : "ממתינה לאישור מנהל";

  return (
    <StepLadder
      steps={steps}
      ariaLabel={`שלב הבקשה: ${current}`}
      broken={request.moderationStatus === "REJECTED" || request.status === "CANCELLED"}
      showLabels
    />
  );
};

export default RequestLadder;
