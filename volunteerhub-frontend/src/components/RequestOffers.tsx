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
  canAccept: boolean;
};

export default function RequestOffers({ requestId, canAccept }: Props) {
  const { data, isPending, isError } = useRequestOffers(requestId);
  const acceptMutation = useAcceptOffer(requestId);

  if (isPending) return <p className="vh-hint">טוען הצעות...</p>;
  if (isError) return <p className="vh-alert">שגיאה בטעינת ההצעות</p>;

  const offers = data.data;

  return (
    <section className="vh-offers">
      <h3>הצעות עזרה</h3>

      {offers.length === 0 && <p className="vh-hint">עדיין אין הצעות עזרה</p>}

      {offers.map((offer) => (
        <div key={offer.id} className="vh-offer">
          <strong>{offer.volunteer.name}</strong>
          <p>{offer.message}</p>
          <p className="vh-meta">סטטוס: {getOfferStatusLabel(offer.status)}</p>

          {offer.contact && (
            <p>
              פרטי קשר: {offer.contact.email}
              {offer.contact.phone && ` | ${offer.contact.phone}`}
            </p>
          )}

          {canAccept && offer.status === "PENDING" && (
            <button
              type="button"
              className="vh-btn vh-btn--heart vh-btn--small"
              disabled={acceptMutation.isPending}
              onClick={() => acceptMutation.mutate(offer.id)}
            >
              קבלת ההצעה
            </button>
          )}
        </div>
      ))}

      {acceptMutation.isError && <p className="vh-alert" role="alert">קבלת ההצעה נכשלה. נסו שוב.</p>}
    </section>
  );
}
