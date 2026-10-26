type Step = {
  label: string;
  done: boolean;
};

type StepLadderProps = {
  steps: Step[];
  ariaLabel: string;
  orientation?: "vertical" | "horizontal";
  big?: boolean;
  broken?: boolean;
  showLabels?: boolean;
};

const StepLadder = ({
  steps,
  ariaLabel,
  orientation = "vertical",
  big = false,
  broken = false,
  showLabels = false,
}: StepLadderProps) => {
  const classes = [
    "vh-ladder",
    `vh-ladder--${orientation}`,
    big ? "vh-ladder--big" : "",
    broken ? "vh-ladder--broken" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className={classes} role="img" aria-label={ariaLabel}>
      <div className="vh-ladder__rails">
        {steps.map((step) => (
          <span key={step.label} className={step.done ? "vh-rung vh-rung--lit" : "vh-rung"} />
        ))}
      </div>
      {showLabels && (
        <div className="vh-ladder__labels" aria-hidden="true">
          {steps.map((step) => (
            <span key={step.label}>{step.label}</span>
          ))}
        </div>
      )}
    </div>
  );
};

export default StepLadder;
