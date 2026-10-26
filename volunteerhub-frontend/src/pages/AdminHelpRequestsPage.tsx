import { useState } from "react";
import HelpRequestCard from "../components/HelpRequestCard";
import { useApproveHelpRequest } from "../hooks/useApproveHelpRequest";
import { useAdminHelpRequests } from "../hooks/useAdminHelpRequests";
import { useRejectHelpRequest } from "../hooks/useRejectHelpRequest";
import HeartIcon from "../design/HeartIcon";
import RejectReasonBox from "../design/RejectReasonBox";

export default function AdminHelpRequestsPage() {
    const { data, isLoading, isError } = useAdminHelpRequests();
    const { mutate: approve, isPending, variables, isError: approveFailed } = useApproveHelpRequest();
    const { mutate: reject, isPending: isRejecting, isError: rejectFailed } = useRejectHelpRequest();
    const [rejectingId, setRejectingId] = useState<string | null>(null);

    const handleReject = (requestId: string, reason: string) => {
        if (reason.length < 5 || reason.length > 500) return;

        reject({ requestId, reason }, { onSuccess: () => setRejectingId(null) });
    };

    if (isLoading) {
        return <p className="vh-state">טוען בקשות...</p>;
    }

    if (isError) {
        return <p className="vh-state vh-state--error">שגיאה בטעינת הבקשות</p>;
    }

    const requests = data?.data ?? [];

    return (
        <main>
            <div className="vh-page-head" style={{ justifyContent: "flex-start", alignItems: "center" }}>
                <span className="vh-count-heart" aria-hidden="true">
                    <HeartIcon size={110} color="#E3304C" className="vh-beat" />
                    <span>{data?.meta.total ?? 0}</span>
                </span>
                <div className="vh-page-head__text">
                    <h1 className="vh-title">ניהול בקשות עזרה ממתינות</h1>
                    <p className="vh-subtitle">מספר בקשות ממתינות: {data?.meta.total ?? 0}</p>
                </div>
            </div>

            {approveFailed && <p className="vh-alert" role="alert">האישור נכשל (ייתכן שהבקשה כבר טופלה או נסגרה).</p>}
            {rejectFailed && <p className="vh-alert" role="alert">הדחייה נכשלה (ייתכן שהבקשה כבר נדחתה).</p>}

            {requests.length === 0 ? (
                <p className="vh-state">אין בקשות שממתינות לאישור. השמיים נקיים.</p>
            ) : (
                <div className="vh-list">
                    {requests.map((request) => (
                        <div key={request.id} className="vh-list">
                            <HelpRequestCard request={request} />
                            {rejectingId === request.id ? (
                                <div className="vh-card">
                                    <RejectReasonBox
                                        requestId={request.id}
                                        isPending={isRejecting}
                                        onSubmit={(reason) => handleReject(request.id, reason)}
                                        onCancel={() => setRejectingId(null)}
                                    />
                                </div>
                            ) : (
                                <div className="vh-card__actions">
                                    <button
                                        type="button"
                                        className="vh-btn vh-btn--heart"
                                        onClick={() => approve(request.id)}
                                        disabled={isPending}
                                    >
                                        <HeartIcon size={18} color="#fff" />
                                        {isPending && variables === request.id ? "מאשר..." : "אישור ופרסום"}
                                    </button>
                                    <button
                                        type="button"
                                        className="vh-btn vh-btn--soft"
                                        onClick={() => setRejectingId(request.id)}
                                        disabled={isRejecting}
                                    >
                                        דחייה עם סיבה
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </main>
    );
}
