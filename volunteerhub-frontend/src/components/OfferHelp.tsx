import { useState } from "react";
import { Link } from "react-router";
import useAuth from "../hooks/useAuth";
import { useCreateOffer } from "../hooks/useCreateOffer";

type Props = {
  requestId: string;
};

export default function OfferHelp({ requestId }: Props) {
  const [message, setMessage] = useState("");
  const { token } = useAuth();
  const createOfferMutation = useCreateOffer(requestId);

  if (!token) {
    return <Link to="/login" className="vh-btn vh-btn--soft vh-btn--small">יש להתחבר כדי להציע עזרה.</Link>;
  }

  if (createOfferMutation.isSuccess) {
    return <p className="vh-success" role="status">ההצעה נשלחה. המבקש/ת יקבלו הודעה.</p>;
  }

  const handleSubmit = (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const text = message.trim();
    if (text.length < 5 || createOfferMutation.isPending) return;
    createOfferMutation.mutate(text);
  };

  return (
    <form className="vh-offer-form" onSubmit={handleSubmit}>
      <textarea
        className="vh-input"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="איך תוכל/י לעזור?"
        aria-label="הודעת הצעת העזרה"
        minLength={5}
        maxLength={1000}
        required
      />

      <button
        type="submit"
        className="vh-btn vh-btn--heart vh-btn--small"
        disabled={message.trim().length < 5 || createOfferMutation.isPending}
      >
        {createOfferMutation.isPending ? "שולח..." : "שליחת הצעת עזרה"}
      </button>

      {createOfferMutation.isError && (
        <p className="vh-alert" role="alert">השליחה נכשלה (ייתכן שכבר הצעת עזרה לבקשה זו).</p>
      )}
    </form>
  );
}
