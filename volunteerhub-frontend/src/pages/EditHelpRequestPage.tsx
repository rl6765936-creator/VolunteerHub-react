import { useParams, useNavigate } from "react-router";
import { useForm, useWatch } from "react-hook-form";
import { useEffect } from "react";
import useHelpRequest from "../hooks/useHelpRequest";
import useUpdateHelpRequest from "../hooks/useUpdateHelpRequest";
import ChangedTag from "../design/ChangedTag";
import HeartIcon from "../design/HeartIcon";

type EditHelpRequestForm = {
  title: string;
  description: string;
  region: string;
  addressDetails: string;
};

const EditHelpRequestPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data, isPending, isError } = useHelpRequest(id);
  const { mutate, isPending: isSaving, isError: saveFailed } = useUpdateHelpRequest();

  const request = data?.data;

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<EditHelpRequestForm>();

  // Design only: compare what is typed with the saved request to show "changed" tags.
  const [title, description, region, addressDetails] = useWatch({
    control,
    name: ["title", "description", "region", "addressDetails"],
  });
  const differs = (value: string | undefined, saved: string | null | undefined) =>
    value !== undefined && value.trim() !== (saved ?? "").trim();
  const changed = {
    title: differs(title, request?.title),
    description: differs(description, request?.description),
    region: differs(region, request?.region),
    addressDetails: differs(addressDetails, request?.privateDetails?.addressDetails),
  };
  const anyChanged = Object.values(changed).some(Boolean);

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

  if (isPending) return <p className="vh-state">טוען בקשה...</p>;
  if (isError) return <p className="vh-state vh-state--error">שגיאה בטעינת הבקשה</p>;
  if (!request || !request.viewer.isOwner) return <p className="vh-state vh-state--error">הבקשה לא נמצאה</p>;

  if (request.status !== "OPEN") {
    return <p className="vh-state">ניתן לערוך בקשה רק כשהיא פתוחה</p>;
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
    <main style={{ maxWidth: 900, margin: "0 auto" }}>
      <div className="vh-page-head">
        <div className="vh-page-head__text">
          <h1 className="vh-title">עריכת בקשת עזרה</h1>
          <p className="vh-subtitle">אפשר לערוך כל עוד הבקשה פתוחה.</p>
        </div>
      </div>

      {request.moderationStatus !== "PENDING_REVIEW" && (
        <p className={anyChanged ? "vh-notice vh-notice--pulse" : "vh-notice"}>
          <HeartIcon size={34} color="#E3304C" />
          שימו לב: שמירת שינויים תחזיר את הבקשה לבדיקת מנהל, והיא תוסתר מהרשימה הציבורית עד לאישור.
        </p>
      )}

      <form className="vh-form" onSubmit={handleSubmit(onSubmit)}>
        <div className="vh-field">
          <label className="vh-label" htmlFor="title">כותרת <ChangedTag show={changed.title} /></label>
          <input
            id="title"
            className="vh-input"
            {...register("title", {
              required: "יש להזין כותרת",
              validate: (value) => value.trim().length >= 3 || "לפחות 3 תווים",
              maxLength: { value: 120, message: "עד 120 תווים" },
            })}
          />
          {errors.title && <p className="vh-error">{errors.title.message}</p>}
        </div>

        <div className="vh-field">
          <label className="vh-label" htmlFor="description">תיאור <ChangedTag show={changed.description} /></label>
          <textarea
            id="description"
            className="vh-input"
            {...register("description", {
              required: "יש להזין תיאור",
              validate: (value) => value.trim().length >= 10 || "לפחות 10 תווים",
              maxLength: { value: 4000, message: "עד 4000 תווים" },
            })}
          />
          {errors.description && <p className="vh-error">{errors.description.message}</p>}
        </div>

        <div className="vh-field">
          <label className="vh-label" htmlFor="region">אזור <ChangedTag show={changed.region} /></label>
          <input
            id="region"
            className="vh-input"
            {...register("region", {
              required: "יש להזין אזור",
              validate: (value) => value.trim().length >= 2 || "לפחות 2 תווים",
              maxLength: { value: 80, message: "עד 80 תווים" },
            })}
          />
          {errors.region && <p className="vh-error">{errors.region.message}</p>}
        </div>

        <div className="vh-field">
          <label className="vh-label" htmlFor="addressDetails">כתובת מדויקת <span className="vh-optional">(לא חובה · שדה ריק מוחק את הכתובת)</span> <ChangedTag show={changed.addressDetails} /></label>
          <input
            id="addressDetails"
            className="vh-input"
            {...register("addressDetails", {
              maxLength: { value: 300, message: "עד 300 תווים" },
            })}
          />
          {errors.addressDetails && <p className="vh-error">{errors.addressDetails.message}</p>}
        </div>

        {saveFailed && <p className="vh-alert" role="alert">שמירת השינויים נכשלה. נסה/י שוב.</p>}

        <div className="vh-card__actions">
        <button type="submit" className="vh-btn vh-btn--heart" disabled={isSaving}>
          {isSaving ? "שומר שינויים..." : "שמירת שינויים"}
        </button>

        <button type="button" className="vh-btn vh-btn--plain" onClick={() => navigate("/my-requests")}>
          ביטול
        </button>
        </div>
      </form>
    </main>
  );
};

export default EditHelpRequestPage;
