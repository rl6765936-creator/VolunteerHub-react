import StepLadder from "./StepLadder";

const LABELS = ["עוד לא התחלנו לטפס", "שליבה ראשונה", "באמצע הדרך", "כמעט למעלה", "הגעתם ללב"];

const PasswordStrength = ({ password }: { password: string }) => {
  const checks = [
    password.length >= 8,
    password.length >= 12,
    /\d/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ];
  const score = checks.filter(Boolean).length;

  return (
    <div className="vh-field">
      <StepLadder
        orientation="horizontal"
        ariaLabel={`חוזק הסיסמה: ${LABELS[score]}`}
        steps={checks.map((_, i) => ({ label: `rung-${i}`, done: score > i }))}
      />
      <span className="vh-hint">{LABELS[score]} · לפחות 8 תווים. ספרות וסימנים מטפסים גבוה יותר.</span>
    </div>
  );
};

export default PasswordStrength;
