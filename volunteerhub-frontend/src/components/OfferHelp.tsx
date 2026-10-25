import { useState } from "react";
import { Link } from "react-router";
import useAuth from "../hooks/useAuth";
import { useCreateOffer } from "../hooks/useCreateOffer";

type Props = {
  requestId: string;
};

/** Adapted from VoiceUp's IssueComments form: a volunteer writes how they can help. */
export default function OfferHelp({ requestId }: Props) {
  const [message, setMessage] = useState("");
  const { token } = useAuth();
  const createOfferMutation = useCreateOffer(requestId);

  if (!token) {
    return <Link to="/login">יש להתחבר כדי להציע עזרה.</Link>;
  }

  if (createOfferMutation.isSuccess) {
    return <p>✅ ההצעה נשלחה. המבקש/ת יקבלו הודעה.</p>;
  }

  const handleSubmit = (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const text = message.trim();
    if (text.length < 5 || createOfferMutation.isPending) return;
    createOfferMutation.mutate(text);
  };

  return (
    <form onSubmit={handleSubmit}>
      <textarea
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
        disabled={message.trim().length < 5 || createOfferMutation.isPending}
      >
        {createOfferMutation.isPending ? "שולח..." : "שליחת הצעת עזרה"}
      </button>

      {createOfferMutation.isError && (
        <p role="alert">השליחה נכשלה (ייתכן שכבר הצעת עזרה לבקשה זו).</p>
      )}
    </form>
  );
}
