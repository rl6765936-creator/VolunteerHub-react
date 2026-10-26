import { Link } from "react-router";
import { useForm, useWatch } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";
import useRegister from "../hooks/useRegister";
import type { RegisterRequest } from "../types/auth";
import PasswordStrength from "../design/PasswordStrength";
import heartCloudLadder from "../design/assets/heart-cloud-ladder.png";

const schema = yup.object({
  name: yup.string().trim().min(2, "לפחות 2 תווים").max(80, "עד 80 תווים").required("חובה להזין שם"),
  email: yup.string().email("כתובת אימייל לא תקינה").required("חובה להזין אימייל"),
  password: yup.string().min(8, "לפחות 8 תווים").max(128, "עד 128 תווים").required("חובה להזין סיסמה"),
});

const Register = () => {
  const { mutate, isPending, isError } = useRegister();

  const {register,handleSubmit,control,formState: { errors },} = useForm<RegisterRequest>({
    resolver: yupResolver(schema),
  });
  const password = useWatch({ control, name: "password" });

  return (
    <section className="vh-auth">
      <form className="vh-form vh-form--narrow" onSubmit={handleSubmit((data) => mutate(data))}>
        <div className="vh-form__head">
          <h1 className="vh-title">מצטרפים לסולם</h1>
          <p className="vh-subtitle">רגע אחד של הרשמה, והרבה רגעים של טוב.</p>
        </div>

        <div className="vh-field">
          <label className="vh-label" htmlFor="name">שם מלא</label>
          <input id="name" className="vh-input" autoComplete="name" {...register("name")} />
          <p className="vh-error">{errors.name?.message}</p>
        </div>

        <div className="vh-field">
          <label className="vh-label" htmlFor="email">אימייל</label>
          <input id="email" className="vh-input" type="email" dir="ltr" autoComplete="email" {...register("email")} />
          <p className="vh-error">{errors.email?.message}</p>
        </div>

        <div className="vh-field">
          <label className="vh-label" htmlFor="password">סיסמה</label>
          <input id="password" className="vh-input" type="password" dir="ltr" autoComplete="new-password" {...register("password")} />
          <PasswordStrength password={password ?? ""} />
          <p className="vh-error">{errors.password?.message}</p>
        </div>

        {isError && <p className="vh-alert" role="alert">ההרשמה נכשלה. נסו שוב.</p>}

        <button type="submit" className="vh-btn vh-btn--heart" disabled={isPending}>
          {isPending ? "יוצרים חשבון..." : "יצירת חשבון"}
        </button>
        <p className="vh-hint" style={{ justifyContent: "center" }}>כבר רשומים? <Link to="/login">להתחברות</Link></p>
      </form>

      <div className="vh-auth__visual" aria-hidden="true">
        <div className="vh-photo">
          <img src={heartCloudLadder} alt="" />
        </div>
      </div>
    </section>
  );
};

export default Register;
