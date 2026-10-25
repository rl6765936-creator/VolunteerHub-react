import { useParams, useNavigate } from "react-router";
import { useForm } from "react-hook-form";
import { useEffect } from "react";
import useHelpRequest from "../hooks/useHelpRequest";
import useUpdateHelpRequest from "../hooks/useUpdateHelpRequest";

type EditHelpRequestForm = {
  title: string;
  description: string;
  region: string;
  addressDetails: string;
};

const EditHelpRequestPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // The address is not part of list items, so the form loads the detail view.
  const { data, isPending, isError } = useHelpRequest(id);
  const { mutate, isPending: isSaving, isError: saveFailed } = useUpdateHelpRequest();

  const request = data?.data;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<EditHelpRequestForm>();

  useEffect(() => {
    if (request) {
      reset({
        title: request.title,
        description: request.description,
        region: request.region,
        addressDetails: request.privateDetails?.addressDetails ?? "",
      });
    }
  }, [request, reset]);

  if (isPending) return <p>טוען בקשה...</p>;
  if (isError) return <p>שגיאה בטעינת הבקשה</p>;
  if (!request || !request.viewer.isOwner) return <p>הבקשה לא נמצאה</p>;

  if (request.status !== "OPEN") {
    return <p>ניתן לערוך בקשה רק כשהיא פתוחה</p>;
  }

  const onSubmit = (values: EditHelpRequestForm) => {
    if (!id) return;

    mutate(
      {
        requestId: id,
        data: {
          title: values.title,
          description: values.description,
          region: values.region,
          // An empty field clears the address (the server expects null for that).
          addressDetails: values.addressDetails.trim() || null,
        },
      },
      {
        onSuccess: () => {
          navigate("/my-requests");
        },
      }
    );
  };

  return (
    <main>
      <h1>עריכת בקשת עזרה</h1>

      {request.moderationStatus !== "PENDING_REVIEW" && (
        <p>שימו לב: שמירת שינויים תחזיר את הבקשה לבדיקת מנהל, והיא תוסתר מהרשימה הציבורית עד לאישור.</p>
      )}

      <form onSubmit={handleSubmit(onSubmit)}>
        <div>
          <label htmlFor="title">כותרת</label>
          <input
            id="title"
            {...register("title", {
              required: "יש להזין כותרת",
              validate: (value) => value.trim().length >= 3 || "לפחות 3 תווים",
              maxLength: { value: 120, message: "עד 120 תווים" },
            })}
          />
          {errors.title && <p>{errors.title.message}</p>}
        </div>

        <div>
          <label htmlFor="description">תיאור</label>
          <textarea
            id="description"
            {...register("description", {
              required: "יש להזין תיאור",
              validate: (value) => value.trim().length >= 10 || "לפחות 10 תווים",
              maxLength: { value: 4000, message: "עד 4000 תווים" },
            })}
          />
          {errors.description && <p>{errors.description.message}</p>}
        </div>

        <div>
          <label htmlFor="region">אזור</label>
          <input
            id="region"
            {...register("region", {
              required: "יש להזין אזור",
              validate: (value) => value.trim().length >= 2 || "לפחות 2 תווים",
              maxLength: { value: 80, message: "עד 80 תווים" },
            })}
          />
          {errors.region && <p>{errors.region.message}</p>}
        </div>

        <div>
          <label htmlFor="addressDetails">כתובת מדויקת (לא חובה)</label>
          <input
            id="addressDetails"
            {...register("addressDetails", {
              maxLength: { value: 300, message: "עד 300 תווים" },
            })}
          />
          {errors.addressDetails && <p>{errors.addressDetails.message}</p>}
        </div>

        {saveFailed && <p role="alert">שמירת השינויים נכשלה. נסה/י שוב.</p>}

        <button type="submit" disabled={isSaving}>
          {isSaving ? "שומר שינויים..." : "שמירת שינויים"}
        </button>

        <button type="button" onClick={() => navigate("/my-requests")}>
          ביטול
        </button>
      </form>
    </main>
  );
};

export default EditHelpRequestPage;
