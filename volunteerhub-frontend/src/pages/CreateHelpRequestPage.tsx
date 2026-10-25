import { useForm } from "react-hook-form";
import useCreateHelpRequest from "../hooks/useCreateHelpRequest";
import useCategories from "../hooks/useCategories";
import type { CreateHelpRequestRequest } from "../types/helpRequest";
import { useState } from "react";

/** Form values: the inputs always hold strings; empty optional fields are left out of the request. */
type CreateHelpRequestForm = {
    title: string;
    description: string;
    categoryId: string;
    region: string;
    addressDetails: string;
    neededBy: string;
};

/** Called by react-hook-form on submit, not during render. */
const isEmptyOrFuture = (value: string) =>
    !value || new Date(value).getTime() > Date.now() || "התאריך חייב להיות בעתיד";

const CreateHelpRequestPage = () => {
    const { register, handleSubmit, formState: { errors } } = useForm<CreateHelpRequestForm>();

    const { mutate, isPending, isError } = useCreateHelpRequest();
    const [images, setImages] = useState<File[]>([]);
    const { data: categoriesResponse, isPending: categoriesPending, isError: categoriesError, } = useCategories();

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
            <h1>יצירת בקשת עזרה חדשה</h1>

            <form onSubmit={handleSubmit(onSubmit)}>

                <div>
                    <label htmlFor="title">כותרת</label>
                    <input
                        id="title"
                        {...register("title", {
                            required: "יש להזין כותרת",
                            validate: (value) => value.trim().length >= 3 || "הכותרת חייבת להכיל לפחות 3 תווים",
                            maxLength: { value: 120, message: "הכותרת יכולה להכיל עד 120 תווים" },
                        })}
                    />
                    {errors.title && <p>{errors.title.message}</p>}
                </div>

                <div>
                    <label htmlFor="description">תיאור הבקשה</label>
                    <textarea
                        id="description"
                        {...register("description", {
                            required: "יש להזין תיאור",
                            validate: (value) => value.trim().length >= 10 || "התיאור חייב להכיל לפחות 10 תווים",
                            maxLength: { value: 4000, message: "התיאור יכול להכיל עד 4000 תווים" },
                        })} />
                    {errors.description && <p>{errors.description.message}</p>}
                </div>

                <div>
                    <label htmlFor="region">אזור</label>
                    <input
                        id="region"
                        {...register("region", {
                            required: "יש להזין אזור",
                            validate: (value) => value.trim().length >= 2 || "האזור חייב להכיל לפחות 2 תווים",
                            maxLength: { value: 80, message: "האזור יכול להכיל עד 80 תווים" },
                        })}
                    />
                    {errors.region && <p>{errors.region.message}</p>}
                </div>

                <div>
                    <label htmlFor="addressDetails">כתובת מדויקת (לא חובה, תוצג רק למתנדב שיאושר)</label>
                    <input
                        id="addressDetails"
                        {...register("addressDetails", {
                            maxLength: { value: 300, message: "הכתובת יכולה להכיל עד 300 תווים" },
                        })}
                    />
                    {errors.addressDetails && <p>{errors.addressDetails.message}</p>}
                </div>

                <div>
                    <label htmlFor="neededBy">נדרש עד (לא חובה)</label>
                    <input
                        id="neededBy"
                        type="datetime-local"
                        {...register("neededBy", {
                            validate: isEmptyOrFuture,
                        })}
                    />
                    {errors.neededBy && <p>{errors.neededBy.message}</p>}
                </div>

                <div>
                    <label htmlFor="images">תמונות (עד 5)</label>

                    <input
                        id="images"
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

                    {images.map((file, index) => (
                        <p key={`${file.name}-${index}`}>{file.name}</p>
                    ))}
                </div>

                <div>
                    <label htmlFor="categoryId">קטגוריה</label>
                    <select
                        id="categoryId"
                        defaultValue=""
                        disabled={categoriesPending || categoriesError}
                        {...register("categoryId", {
                            required: "יש לבחור קטגוריה",
                        })}
                    >
                        <option value="" disabled>
                            בחר/י קטגוריה
                        </option>

                        {categoriesResponse?.data
                            .filter((category) => category.isActive)
                            .map((category) => (
                                <option key={category.id} value={category.id}>
                                    {category.name}
                                </option>
                            ))}
                    </select>

                    {categoriesPending && <p>טוען קטגוריות...</p>}
                    {categoriesError && <p>שגיאה בטעינת הקטגוריות</p>}
                    {errors.categoryId && <p>{errors.categoryId.message}</p>}
                </div>

                {isError && <p role="alert">שליחת הבקשה נכשלה. נסה/י שוב.</p>}

                <button type="submit" disabled={isPending}>
                    {isPending ? "שולח בקשה..." : "שליחת בקשה"}
                </button>
            </form>
        </main>
    );
};

export default CreateHelpRequestPage;
