"use client";

// Visually-hidden bait field — bots that auto-fill every input land
// here, server then silently 200s via gatePublicPost. Pair with
// `_company: <state>` in the JSON body for controlled forms.
const HONEYPOT_STYLE: React.CSSProperties = {
  position: "absolute",
  left: "-10000px",
  top: "auto",
  width: 1,
  height: 1,
  overflow: "hidden",
  opacity: 0,
  pointerEvents: "none",
};

export function HoneypotField({
  value,
  onChange,
}: {
  value?: string;
  onChange?: (v: string) => void;
}) {
  return (
    <input
      type="text"
      name="_company"
      tabIndex={-1}
      autoComplete="off"
      aria-hidden="true"
      style={HONEYPOT_STYLE}
      value={value ?? ""}
      onChange={(e) => onChange?.(e.target.value)}
    />
  );
}
