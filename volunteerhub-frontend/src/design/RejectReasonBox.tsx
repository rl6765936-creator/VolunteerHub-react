import { useState } from "react";

type RejectReasonBoxProps = {
  requestId: string;
  isPending: boolean;
  onSubmit: (reason: string) => void;
  onCancel: () => void;
};

const MIN = 5;
const MAX = 500;

const RejectReasonBox = ({ requestId, isPending, onSubmit, onCancel }: RejectReasonBoxProps) => {
  const [reason, setReason] = useState("");
  const text = reason.trim();
  const valid = text.length >= MIN && text.length <= MAX;
  const fieldId = `reject-reason-${requestId}`;

  return (
    <div className="vh-reject-box">
      <label className="vh-label" htmlFor={fieldId}>סיבת הדחייה</label>
      <textarea
        id={fieldId}
        className="vh-input"
        value={reason}
        maxLength={MAX}
        placeholder="למשל: חסרים פרטים על המיקום או על התאריך"
        onChange={(e) => setReason(e.target.value)}
        autoFocus
      />
      <span className="vh-count" style={{ color: valid ? "#1C6247" : "#8E1730" }}>
        {text.length} / {MAX} · לפחות {MIN}
      </span>
      <div className="vh-card__actions">
        <button type="button" className="vh-btn vh-btn--heart vh-btn--small" disabled={!valid || isPending} onClick={() => onSubmit(text)}>
          {isPending ? "שולח..." : "שליחת הדחייה"}
        </button>
        <button type="button" className="vh-btn vh-btn--plain vh-btn--small" onClick={onCancel}>
          ביטול
        </button>
      </div>
    </div>
  );
};

export default RejectReasonBox;
