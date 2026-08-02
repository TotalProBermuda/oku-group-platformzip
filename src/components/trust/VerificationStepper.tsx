export type StepState = "past" | "current" | "future";

export interface StepDefinition {
  label: string;
  state: StepState;
  caption?: string;
}

export interface VerificationStepperProps {
  steps: StepDefinition[];
  /** Mobile = vertical stack; Desktop = horizontal pill row. */
  orientation?: "vertical" | "horizontal";
}

export function VerificationStepper({
  steps,
  orientation = "vertical",
}: VerificationStepperProps) {
  const isHorizontal = orientation === "horizontal";

  return (
    <ol
      aria-label="Verification progress"
      style={{
        listStyle: "none",
        margin: 0,
        padding: 0,
        display: "flex",
        flexDirection: isHorizontal ? "row" : "column",
        gap: isHorizontal ? 8 : 12,
        flexWrap: isHorizontal ? "wrap" : "nowrap",
      }}
    >
      {steps.map((step, idx) => {
        const isCurrent = step.state === "current";
        const isPast = step.state === "past";
        const circleBg = isPast ? "#1f8a55" : isCurrent ? "#c41e3a" : "#fff";
        const circleColor = isPast || isCurrent ? "#fff" : "#6b7280";
        const circleBorder = isPast
          ? "1px solid #1f8a55"
          : isCurrent
            ? "1px solid #c41e3a"
            : "1px solid #d1d5db";

        return (
          <li
            key={`${idx}-${step.label}`}
            aria-current={isCurrent ? "step" : undefined}
            style={{
              display: "flex",
              flexDirection: isHorizontal ? "column" : "row",
              alignItems: isHorizontal ? "center" : "flex-start",
              gap: isHorizontal ? 6 : 12,
              padding: isHorizontal ? "6px 10px" : 0,
              borderRadius: 6,
              background: isHorizontal && isCurrent ? "#fef2f2" : "transparent",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 24,
                height: 24,
                borderRadius: "50%",
                background: circleBg,
                color: circleColor,
                border: circleBorder,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {isPast ? "✓" : idx + 1}
            </span>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: 14, fontWeight: isCurrent ? 600 : 500 }}>
                {step.label}
                {isPast && (
                  <span
                    style={{
                      position: "absolute",
                      width: 1,
                      height: 1,
                      overflow: "hidden",
                      clip: "rect(0,0,0,0)",
                    }}
                  >
                    {" "}
                    completed
                  </span>
                )}
              </span>
              {step.caption && (
                <span style={{ fontSize: 12, color: "#6b7280" }}>{step.caption}</span>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export default VerificationStepper;
