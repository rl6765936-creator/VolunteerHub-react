import { useRequestOffers } from "../hooks/useRequestOffers";
import { useAcceptOffer } from "../hooks/useAcceptOffer";
import type { OfferStatus } from "../types/offer";

const getOfferStatusLabel = (status: OfferStatus) => {
  switch (status) {
    case "PENDING":
      return "ממתינה";
    case "ACCEPTED":
      return "התקבלה";
    case "DECLINED":
      return "נדחתה";
    case "WITHDRAWN":
      return "בוטלה";
  }
};

type Props = {
  requestId: string;
  /** Offers can be accepted only while the request is approved and open. */
  canAccept: boolean;
};

/** The offers on one of my requests (owner view). */
export default function RequestOffers({ requestId, canAccept }: Props) {
  const { data, isPending, isError } = useRequestOffers(requestId);
  const acceptMutation = useAcceptOffer(requestId);

  if (isPending) return <p>טוען הצעות...</p>;
  if (isError) return <p>שגיאה בטעינת ההצעות</p>;

  const offers = data.data;

  return (
    <section>
      <h3>הצעות עזרה</h3>

      {offers.length === 0 && <p>עדיין אין הצעות עזרה</p>}

      {offers.map((offer) => (
        <div key={offer.id}>
          <strong>{offer.volunteer.name}</strong>
          <p>{offer.message}</p>
          <p>סטטוס: {getOfferStatusLabel(offer.status)}</p>

          {/* The server sends the contact details only on the accepted offer. */}
          {offer.contact && (
            <p>
              פרטי קשר: {offer.contact.email}
              {offer.contact.phone && ` | ${offer.contact.phone}`}
            </p>
          )}

          {canAccept && offer.status === "PENDING" && (
            <button
              type="button"
              disabled={acceptMutation.isPending}
              onClick={() => acceptMutation.mutate(offer.id)}
            >
              ✅ קבלת ההצעה
            </button>
          )}
        </div>
      ))}

      {acceptMutation.isError && <p role="alert">קבלת ההצעה נכשלה. נסו שוב.</p>}
    </section>
  );
}
