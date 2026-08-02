"use client";

import Link from "next/link";
import { useId, useState } from "react";

interface KpiTooltipCopy {
  definition: string;
  source: string;
  narrative: string;
}

interface KpiTileProps {
  label: string;
  value: React.ReactNode;
  color?: string;
  href?: string;
  tooltip?: KpiTooltipCopy;
  tooltipLabels?: { definition: string; source: string; narrative: string };
}

export default function KpiTile({
  label,
  value,
  color = "#0f172a",
  href,
  tooltip,
  tooltipLabels = { definition: "What it measures", source: "Data source", narrative: "Narrative" },
}: KpiTileProps) {
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const tipId = useId();
  const open = (hover || focus) && !!tooltip;

  const cardStyle: React.CSSProperties = {
    position: "relative",
    background: "#fff",
    borderRadius: 14,
    padding: 20,
    border: "1px solid",
    borderColor: focus ? color : "#e2e8f0",
    boxShadow: hover || focus ? "0 6px 20px rgba(15,23,42,0.08)" : "0 1px 2px rgba(15,23,42,0.04)",
    transform: hover ? "translateY(-2px)" : "none",
    transition: "transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease",
    cursor: href ? "pointer" : tooltip ? "help" : "default",
    height: "100%",
  };

  const inner = (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div style={{ fontSize: 28, fontWeight: 900, color, lineHeight: 1.1 }}>{value}</div>
        {tooltip && (
          <span
            aria-hidden
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: "#94a3b8",
              border: "1px solid #cbd5e1",
              borderRadius: 999,
              width: 16,
              height: 16,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            i
          </span>
        )}
      </div>
      <div
        style={{
          fontSize: 11,
          color: "#94a3b8",
          marginTop: 6,
          textTransform: "uppercase",
          letterSpacing: "0.07em",
          fontWeight: 600,
        }}
      >
        {label}
      </div>

      {tooltip && (
        <div
          id={tipId}
          role="tooltip"
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            left: 0,
            maxWidth: 320,
            minWidth: 240,
            background: "#0f172a",
            color: "#f8fafc",
            borderRadius: 10,
            padding: "12px 14px",
            fontSize: 12,
            lineHeight: 1.5,
            boxShadow: "0 12px 32px rgba(15,23,42,0.25)",
            zIndex: 30,
            pointerEvents: "none",
            opacity: open ? 1 : 0,
            visibility: open ? "visible" : "hidden",
            transition: "opacity 140ms ease",
          }}
        >
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color, marginBottom: 2 }}>
              {tooltipLabels.definition}
            </div>
            <div>{tooltip.definition}</div>
          </div>
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#64748b", marginBottom: 2 }}>
              {tooltipLabels.source}
            </div>
            <div style={{ color: "#cbd5e1" }}>{tooltip.source}</div>
          </div>
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#64748b", marginBottom: 2 }}>
              {tooltipLabels.narrative}
            </div>
            <div style={{ color: "#cbd5e1" }}>{tooltip.narrative}</div>
          </div>
        </div>
      )}
    </>
  );

  const handlers = {
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
  };

  if (href) {
    return (
      <Link
        href={href}
        aria-describedby={tooltip ? tipId : undefined}
        {...handlers}
        style={{ ...cardStyle, display: "block", textDecoration: "none", color: "inherit" }}
      >
        {inner}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={(e) => e.preventDefault()}
      aria-describedby={tooltip ? tipId : undefined}
      {...handlers}
      style={{
        ...cardStyle,
        cursor: "pointer",
        textAlign: "left",
        width: "100%",
        font: "inherit",
        appearance: "none",
      }}
    >
      {inner}
    </button>
  );
}
