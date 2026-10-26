import { useForm, useWatch } from "react-hook-form";
import useCreateHelpRequest from "../hooks/useCreateHelpRequest";
import useCategories from "../hooks/useCategories";
import type { CreateHelpRequestRequest } from "../types/helpRequest";
import { useState } from "react";
import FormProgress from "../design/FormProgress";
import HeartIcon from "../design/HeartIcon";

type CreateHelpRequestForm = {
    title: string;
    description: string;
    categoryId: string;
    region: string;
    addressDetails: string;
    neededBy: string;
};

const isEmptyOrFuture = (value: string) =>
    !value || new Date(value).getTime() > Date.now() || "התאריך חייב להיות בעתיד";

const CreateHelpRequestPage = () => {
    const { register, handleSubmit, control, formState: { errors } } = useForm<CreateHelpRequestForm>();

    const { mutate, isPending, isError } = useCreateHelpRequest();
    const [images, setImages] = useState<File[]>([]);
    const { data: categoriesResponse, isPending: categoriesPending, isError: categoriesError, } = useCategories();

    const [title = "", description = "", region = "", categoryId = ""] = useWatch({
        control,
        name: ["title", "description", "region", "categoryId"],
    });
    const progress = [
        title.trim().length >= 3,
        description.trim().length >= 10,
        region.trim().length >= 2,
        Boolean(categoryId),
    ];

    const onSubmit = (values: CreateHelpRequestForm) => {
        const data: CreateHelpRequestRequest = {
            title: values.title,
            description: values.description,
            categoryId: values.categoryId,
            region: values.region,
            ...(values.addressDetails.trim() && { addressDetails: values.addressDetails.trim() }),
            ...(values.neededBy && { neededBy: new Date(values.neededBy).toISOString() }),
        };
        mutate({ data, images });
    };

    return (
        <main>
            <div className="vh-page-head">
                <div className="vh-page-head__text">
                    <h1 className="vh-title">יצירת בקשת עזרה חדשה</h1>
                    <p className="vh-subtitle">כל שדה שממלאים מטפס עוד שליבה. בראש הסולם הבקשה יוצאת לאישור מנהל.</p>
                </div>
            </div>

            <div className="vh-with-progress">
            <FormProgress checks={progress} />

            <form className="vh-form" onSubmit={handleSubmit(onSubmit)}>

                <div className="vh-field">
                    <label className="vh-label" htmlFor="title">כותרת</label>
                    <input
                        id="title"
                        className="vh-input"
                        placeholder="למשל: עזרה בקניות לשכנה"
                        {...register("title", {
                            required: "יש להזין כותרת",
                            validate: (value) => value.trim().length >= 3 || "הכותרת חייבת להכיל לפחות 3 תווים",
                            maxLength: { value: 120, message: "הכותרת יכולה להכיל עד 120 תווים" },
                        })}
                    />
                    <span className="vh-count">{title.length} / 120</span>
                    {errors.title && <p className="vh-error">{errors.title.message}</p>}
                </div>

                <div className="vh-field">
                    <label className="vh-label" htmlFor="description">תיאור הבקשה</label>
                    <textarea
                        id="description"
                        className="vh-input"
                        placeholder="במה בדיוק צריך עזרה, כמה זמן זה לוקח ומה חשוב לדעת"
                        {...register("description", {
                            required: "יש להזין תיאור",
                            validate: (value) => value.trim().length >= 10 || "התיאור חייב להכיל לפחות 10 תווים",
                            maxLength: { value: 4000, message: "התיאור יכול להכיל עד 4000 תווים" },
                        })} />
                    <span className="vh-count">{description.length} / 4000 · לפחות 10</span>
                    {errors.description && <p className="vh-error">{errors.description.message}</p>}
                </div>

                <div className="vh-two-cols">
                <div className="vh-field">
                    <label className="vh-label" htmlFor="region">אזור</label>
                    <input
                        id="region"
                        className="vh-input"
                        placeholder="עיר או שכונה"
                        {...register("region", {
                            required: "יש להזין אזור",
                            validate: (value) => value.trim().length >= 2 || "האזור חייב להכיל לפחות 2 תווים",
                            maxLength: { value: 80, message: "האזור יכול להכיל עד 80 תווים" },
                        })}
                    />
                    {errors.region && <p className="vh-error">{errors.region.message}</p>}
                </div>

                <div className="vh-field">
                    <label className="vh-label" htmlFor="neededBy">נדרש עד <span className="vh-optional">(לא חובה)</span></label>
                    <input
                        id="neededBy"
                        className="vh-input"
                        type="datetime-local"
                        {...register("neededBy", {
                            validate: isEmptyOrFuture,
                        })}
                    />
                    {errors.neededBy && <p className="vh-error">{errors.neededBy.message}</p>}
                </div>
                </div>

                <div className="vh-field">
                    <label className="vh-label" htmlFor="addressDetails">כתובת מדויקת <span className="vh-optional">(לא חובה)</span></label>
                    <input
                        id="addressDetails"
                        className="vh-input"
                        placeholder="רחוב ומספר"
                        {...register("addressDetails", {
                            maxLength: { value: 300, message: "הכתובת יכולה להכיל עד 300 תווים" },
                        })}
                    />
                    <span className="vh-hint">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="3" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
                        תוצג רק למתנדב שיאושר ולמנהלים
                    </span>
                    {errors.addressDetails && <p className="vh-error">{errors.addressDetails.message}</p>}
                </div>

                <fieldset className="vh-cats" disabled={categoriesPending || categoriesError}>
                    <legend>קטגוריה</legend>
                    {categoriesResponse?.data
                        .filter((category) => category.isActive)
                        .map((category) => (
                            <label key={category.id} className="vh-cat">
                                <input
                                    type="radio"
                                    value={category.id}
                                    {...register("categoryId", {
                                        required: "יש לבחור קטגוריה",
                                    })}
                                />
                                <span>{category.name}</span>
                            </label>
                        ))}

                    {categoriesPending && <p className="vh-hint">טוען קטגוריות...</p>}
                    {categoriesError && <p className="vh-alert">שגיאה בטעינת הקטגוריות</p>}
                </fieldset>
                {errors.categoryId && <p className="vh-error">{errors.categoryId.message}</p>}

                <div className="vh-field">
                    <span className="vh-label">תמונות <span className="vh-optional">(עד 5, JPG / PNG / WebP, עד 5MB כל אחת)</span></span>
                    <label className="vh-drop" htmlFor="images">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#E3304C" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="4" /><circle cx="9" cy="10" r="2" /><path d="M21 16l-5-5-8 9" /></svg>
                        <span>לחצו כאן כדי לבחור תמונות</span>
                    </label>

                    <input
                        id="images"
                        className="vh-visually-hidden"
                        type="file"
                        multiple
                        accept="image/jpeg,image/png,image/webp"
                        onChange={(event) => {
                            const files = Array.from(event.target.files ?? []);

                            const allowedTypes = [
                                "image/jpeg",
                                "image/png",
                                "image/webp",
                            ];

                            const valid = files.length <= 5 && files.every(
                                (file) =>
                                    allowedTypes.includes(file.type) &&
                                    file.size <= 5 * 1024 * 1024
                            );

                            if (!valid) {
                                alert("ניתן לבחור עד 5 תמונות JPG, PNG או WebP, עד 5MB לכל תמונה");
                                setImages([]);
                                event.target.value = "";
                                return;
                            }

                            setImages(files);
                        }}
                    />

                    <div className="vh-files">
                    {images.map((file, index) => (
                        <span key={`${file.name}-${index}`} className="vh-chip vh-chip--pink">{file.name}</span>
                    ))}
                    </div>
                </div>

                {isError && <p className="vh-alert" role="alert">שליחת הבקשה נכשלה. נסה/י שוב.</p>}

                <button type="submit" className="vh-btn vh-btn--heart" disabled={isPending}>
                    <HeartIcon size={20} color="#fff" />
                    {isPending ? "שולח בקשה..." : "שליחת בקשה"}
                </button>
            </form>
            </div>
        </main>
    );
};

export default CreateHelpRequestPage;
