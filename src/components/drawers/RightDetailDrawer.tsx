"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

export interface DrawerTab {
  key: string;
  label: string;
  badge?: number | string;
}

interface RightDetailDrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  badge?: React.ReactNode;
  tabs?: DrawerTab[];
  activeTab?: string;
  onTabChange?: (key: string) => void;
  width?: number;
  children: React.ReactNode;
  footer?: React.ReactNode;
  loading?: boolean;
}

export default function RightDetailDrawer({
  open,
  onClose,
  title,
  subtitle,
  badge,
  tabs,
  activeTab,
  onTabChange,
  width = 540,
  children,
  footer,
  loading = false,
}: RightDetailDrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const panelWidth = typeof window !== "undefined"
    ? Math.min(width, window.innerWidth - 32)
    : width;

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(26,22,20,0.38)",
          backdropFilter: "blur(2px)",
          zIndex: 300,
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "opacity 0.22s",
        }}
      />

      <div
        ref={panelRef}
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: panelWidth,
          background: "var(--color-surface)",
          boxShadow: "-8px 0 40px rgba(26,22,20,0.14)",
          zIndex: 301,
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.28s cubic-bezier(0.25,0.8,0.25,1)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "18px 22px 0",
            borderBottom: tabs && tabs.length > 0 ? "none" : "1px solid var(--color-border)",
            flexShrink: 0,
            background: "var(--color-surface)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              marginBottom: 12,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                {title && (
                  <h3
                    style={{
                      fontFamily: "var(--font-heading)",
                      fontSize: 17,
                      fontWeight: 600,
                      margin: 0,
                      color: "var(--color-text)",
                      lineHeight: 1.3,
                    }}
                  >
                    {title}
                  </h3>
                )}
                {badge}
              </div>
              {subtitle && (
                <p
                  style={{
                    fontSize: 12,
                    color: "var(--color-text-secondary)",
                    margin: "3px 0 0",
                    fontFamily: "monospace",
                  }}
                >
                  {subtitle}
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              style={{
                flexShrink: 0,
                width: 30,
                height: 30,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "transparent",
                border: "1px solid var(--color-border)",
                borderRadius: 6,
                cursor: "pointer",
                color: "var(--color-text-muted)",
                marginLeft: 12,
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background =
                  "var(--color-border-light)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background =
                  "transparent";
              }}
              aria-label="Close"
            >
              <X size={14} />
            </button>
          </div>

          {tabs && tabs.length > 0 && (
            <div
              style={{
                display: "flex",
                gap: 0,
                marginTop: 6,
                borderBottom: "1px solid var(--color-border)",
              }}
            >
              {tabs.map((tab) => {
                const isActive = tab.key === activeTab;
                return (
                  <button
                    key={tab.key}
                    onClick={() => onTabChange?.(tab.key)}
                    style={{
                      padding: "8px 14px",
                      background: "none",
                      border: "none",
                      borderBottom: isActive
                        ? "2px solid var(--color-primary)"
                        : "2px solid transparent",
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: isActive ? 700 : 500,
                      color: isActive
                        ? "var(--color-primary)"
                        : "var(--color-text-secondary)",
                      transition: "color 0.15s",
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                      whiteSpace: "nowrap",
                      marginBottom: -1,
                    }}
                  >
                    {tab.label}
                    {tab.badge !== undefined && (
                      <span
                        style={{
                          background: isActive
                            ? "var(--color-primary)"
                            : "var(--color-border)",
                          color: isActive ? "#fff" : "var(--color-text-secondary)",
                          fontSize: 9,
                          fontWeight: 700,
                          borderRadius: 10,
                          padding: "1px 5px",
                          lineHeight: 1.5,
                        }}
                      >
                        {tab.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "20px 22px",
          }}
        >
          {loading ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 12,
                animation: "pulse 1.5s ease-in-out infinite",
              }}
            >
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  style={{
                    height: i === 1 ? 24 : 16,
                    background: "var(--color-border-light)",
                    borderRadius: 6,
                    width: i === 2 ? "60%" : i === 4 ? "45%" : "100%",
                  }}
                />
              ))}
            </div>
          ) : (
            children
          )}
        </div>

        {footer && (
          <div
            style={{
              borderTop: "1px solid var(--color-border)",
              padding: "14px 22px",
              flexShrink: 0,
              background: "#fafaf9",
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </>
  );
}
