"use client";

import { useEffect, useState } from "react";

export default function SlideOverPanel({
  open,
  onClose,
  title,
  children,
  width = 420,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  width?: number;
}) {
  const [winWidth, setWinWidth] = useState<number>(width);

  useEffect(() => {
    const update = () => setWinWidth(window.innerWidth);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const panelWidth = Math.min(width, winWidth);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)",
          zIndex: 100, opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "opacity 0.25s",
        }}
      />
      {/* Panel */}
      <div
        style={{
          position: "fixed", top: 0, right: 0, bottom: 0,
          width: panelWidth,
          background: "#fff",
          boxShadow: "-4px 0 32px rgba(0,0,0,0.12)",
          zIndex: 101,
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.3s cubic-bezier(0.25,0.8,0.25,1)",
          display: "flex", flexDirection: "column",
          overflowY: "auto",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: "1px solid var(--color-border)", flexShrink: 0 }}>
          {title && (
            <h3 style={{ fontFamily: "var(--font-heading)", fontSize: 18, fontWeight: 500, margin: 0 }}>
              {title}
            </h3>
          )}
          <button
            onClick={onClose}
            style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 20, color: "var(--color-text-muted)", padding: "4px 8px", marginLeft: "auto" }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        {/* Content */}
        <div style={{ flex: 1, padding: "24px", overflowY: "auto" }}>
          {children}
        </div>
      </div>
    </>
  );
}
