
import { useState } from 'react';
import { Link } from 'react-router';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import UseLogin from '../hooks/useLogin';
import HeartIcon from '../design/HeartIcon';
import heartCloudLadder from '../design/assets/heart-cloud-ladder.png';

const schema = yup
  .object()
  .shape({
    email: yup.string().email("כתובת אימייל לא תקינה").required("חובה להזין אימייל"),
    password: yup.string().max(128, "סיסמה ארוכה מדי").required("חובה להזין סיסמה")})
  .required();

const Login=()=>{
const login=UseLogin()
const [showPassword, setShowPassword] = useState(false);
const {register,handleSubmit,formState: { errors }} = useForm({
  resolver: yupResolver(schema),
});

  return (
    <section className="vh-auth">
      <div className="vh-auth__visual" aria-hidden="true">
        <div className="vh-photo">
          <img src={heartCloudLadder} alt="" />
        </div>
      </div>

<form className="vh-form vh-form--narrow" onSubmit={handleSubmit((data) =>login.mutate(data))}>
      <div className="vh-form__head">
        <h1 className="vh-title">שמחים לראות אותך</h1>
        <p className="vh-subtitle">עוד מדרגה אחת, ואתם בפנים.</p>
      </div>

      <div className="vh-field">
        <label className="vh-label" htmlFor="login-email">אימייל</label>
    <input id="login-email" className="vh-input" type="email" dir="ltr" autoComplete="email" {...register('email')} />
      {errors.email && <p className="vh-error">{errors.email.message}</p>}
      </div>

      <div className="vh-field">
        <label className="vh-label" htmlFor="login-password">סיסמה</label>
        <div className="vh-input-wrap">
      <input id="login-password" className="vh-input" type={showPassword ? "text" : "password"} dir="ltr" autoComplete="current-password" {...register('password')} />
          <button
            type="button"
            className="vh-eye"
            aria-label={showPassword ? "הסתרת הסיסמה" : "הצגת הסיסמה"}
            aria-pressed={showPassword}
            onClick={() => setShowPassword((prev) => !prev)}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
          </button>
        </div>
      {errors.password && <p className="vh-error">{errors.password.message}</p>}
      </div>

      {login.isPending && <p className="vh-hint">מתחבר...</p>}
    {login.isError && <p className="vh-alert" role="alert">ההתחברות נכשלה</p>}
<button type="submit" className="vh-btn vh-btn--heart" disabled={login.isPending}>
  <HeartIcon size={20} color="#fff" />
  {login.isPending ? "מתחבר..." : "התחברות"}
</button>
      <p className="vh-hint" style={{ justifyContent: "center" }}>עדיין אין לך חשבון? <Link to="/register">להרשמה</Link></p>
    </form>
    </section>
  );
};

export default Login
