"use client";

import { useEffect, useState } from "react";

type CurrencyAmountInputProps = {
  label: string;
  value: number;
  onChange: (minorUnits: number) => void;
  dollarsLabel: string;
  centsLabel: string;
};

function splitMinorUnits(value: number) {
  const safeValue = Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
  return {
    dollars: String(Math.floor(safeValue / 100)),
    cents: String(safeValue % 100).padStart(2, "0"),
  };
}

/** Displays money as human-readable dollars and cents while keeping minor units in the data model. */
export default function CurrencyAmountInput({
  label,
  value,
  onChange,
  dollarsLabel,
  centsLabel,
}: CurrencyAmountInputProps) {
  const initial = splitMinorUnits(value);
  const [dollars, setDollars] = useState(initial.dollars);
  const [cents, setCents] = useState(initial.cents);

  useEffect(() => {
    const next = splitMinorUnits(value);
    setDollars(next.dollars);
    setCents(next.cents);
  }, [value]);

  function update(nextDollars: string, nextCents: string) {
    setDollars(nextDollars);
    setCents(nextCents);
  }

  function commit() {
    const whole = Number.parseInt(dollars || "0", 10);
    const fraction = Number.parseInt(cents || "0", 10);
    const minorUnits = whole * 100 + fraction;
    if (Number.isSafeInteger(minorUnits)) onChange(minorUnits);
  }

  return (
    <fieldset style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
      <legend style={{ fontWeight: 600, marginBottom: 5 }}>{label}</legend>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(88px, 1fr)", gap: 8 }}>
        <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 600 }}>
          {dollarsLabel}
          <span style={{ display: "flex", alignItems: "center", gap: 8, border: "1px solid #d9d0c7", borderRadius: 7, padding: "0 10px", background: "#fffefa" }}>
            <span aria-hidden="true">$</span>
            <input
              aria-label={dollarsLabel}
              inputMode="numeric"
              pattern="[0-9]*"
              type="text"
              value={dollars}
              onChange={(event) => {
                const next = event.target.value.replace(/\D/g, "").slice(0, 10);
                update(next, cents);
              }}
              onBlur={commit}
              style={{ width: "100%", minWidth: 0, boxSizing: "border-box", border: 0, outline: 0, padding: "9px 0", background: "transparent", color: "#27211d", font: "inherit", textAlign: "right" }}
            />
          </span>
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 600 }}>
          {centsLabel}
          <input
            aria-label={centsLabel}
            inputMode="numeric"
            pattern="[0-9]*"
            type="text"
            maxLength={2}
            value={cents}
            onChange={(event) => {
              const next = event.target.value.replace(/\D/g, "").slice(0, 2);
              update(dollars, next);
            }}
            onBlur={commit}
            style={{ width: "100%", minWidth: 0, boxSizing: "border-box", border: "1px solid #d9d0c7", borderRadius: 7, padding: "9px 10px", background: "#fffefa", color: "#27211d", font: "inherit", textAlign: "right" }}
          />
        </label>
      </div>
    </fieldset>
  );
}
