import HelpRequestCard from "../components/HelpRequestCard";
import { useApproveHelpRequest } from "../hooks/useApproveHelpRequest";
import { useAdminHelpRequests } from "../hooks/useAdminHelpRequests";
import { useRejectHelpRequest } from "../hooks/useRejectHelpRequest";

export default function AdminHelpRequestsPage() {
    const { data, isLoading, isError } = useAdminHelpRequests();
    const { mutate: approve, isPending, variables, isError: approveFailed } = useApproveHelpRequest();
    const { mutate: reject, isPending: isRejecting, isError: rejectFailed } = useRejectHelpRequest();

    const handleReject = (requestId: string) => {
        const reason = window.prompt("הכנס/י סיבת דחייה (5 עד 500 תווים):")?.trim();

        if (!reason) return;

        // Same limits as the server, so the admin gets a clear message instead of a failed request.
        if (reason.length < 5 || reason.length > 500) {
            alert("סיבת הדחייה חייבת להכיל בין 5 ל־500 תווים");
            return;
        }

        reject({ requestId, reason });
    };

    if (isLoading) {
        return <p>טוען בקשות...</p>;
    }

    if (isError) {
        return <p>שגיאה בטעינת הבקשות</p>;
    }

    const requests = data?.data ?? [];

    return (
        <main>
            <h1>ניהול בקשות עזרה ממתינות</h1>

            <p>מספר בקשות ממתינות: {data?.meta.total ?? 0}</p>

            {approveFailed && <p role="alert">האישור נכשל (ייתכן שהבקשה כבר טופלה או נסגרה).</p>}
            {rejectFailed && <p role="alert">הדחייה נכשלה (ייתכן שהבקשה כבר נדחתה).</p>}

            {requests.length === 0 ? (
                <p>אין בקשות שממתינות לאישור 🎉</p>
            ) : (
                <div>
                    {requests.map((request) => (
                        <div key={request.id}>
                            <HelpRequestCard request={request} />
                            <button
                                type="button"
                                onClick={() => approve(request.id)}
                                disabled={isPending}
                            >
                                {isPending && variables === request.id ? "מאשר..." : "✅ אישור"}
                            </button>
                            <button
                                type="button"
                                onClick={() => handleReject(request.id)}
                                disabled={isRejecting}
                            >
                                ❌ דחייה
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </main>
    );
}
