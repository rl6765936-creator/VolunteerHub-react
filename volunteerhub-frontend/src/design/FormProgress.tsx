import StepLadder from "./StepLadder";

type FormProgressProps = {
  checks: boolean[];
};

const LABELS = ["בואו נתחיל לטפס", "שליבה ראשונה", "חצי הדרך", "עוד שליבה אחת", "מוכן לשליחה"];

const FormProgress = ({ checks }: FormProgressProps) => {
  const done = checks.filter(Boolean).length;
  const ready = done === checks.length;
  const label = LABELS[Math.min(Math.round((done / checks.length) * (LABELS.length - 1)), LABELS.length - 1)];

  return (
    <aside className="vh-progress" aria-label="התקדמות במילוי">
      <svg
        className={ready ? "vh-goal-heart vh-beat" : "vh-goal-heart vh-goal-heart--dim"}
        width="90"
        height="81"
        viewBox="0 0 200 180"
        aria-hidden="true"
      >
        <defs>
          <radialGradient id="vh-goal-red" cx="36%" cy="28%" r="78%">
            <stop offset="0" stopColor="#FF8396" />
            <stop offset=".55" stopColor="#E3304C" />
            <stop offset="1" stopColor="#AF1A35" />
          </radialGradient>
        </defs>
        <path
          d="M100 170 C 40 125 5 90 5 52 C 5 22 28 5 54 5 C 75 5 92 17 100 34 C 108 17 125 5 146 5 C 172 5 195 22 195 52 C 195 90 160 125 100 170 Z"
          fill="url(#vh-goal-red)"
        />
        <ellipse cx="58" cy="44" rx="22" ry="12" fill="#fff" opacity=".55" transform="rotate(-28 58 44)" />
      </svg>
      <StepLadder
        big
        ariaLabel={`מולאו ${done} מתוך ${checks.length} שדות חובה`}
        steps={checks.map((ok, i) => ({ label: `field-${i}`, done: ok }))}
      />
      <span className="vh-progress__label" aria-live="polite">{label}</span>
    </aside>
  );
};

export default FormProgress;
