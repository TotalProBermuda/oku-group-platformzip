"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { MoreHorizontal, Loader2 } from "lucide-react";

export interface ActionItem {
  key: string;
  label: string;
  icon?: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
  hidden?: boolean;
  loading?: boolean;
  onClick: () => void | Promise<void>;
}

interface ActionMenuProps {
  items: ActionItem[];
  trigger?: React.ReactNode;
  align?: "left" | "right";
  size?: "sm" | "md";
}

export default function ActionMenu({
  items,
  trigger,
  align = "right",
  size = "sm",
}: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleItemClick = useCallback(
    async (item: ActionItem, e: React.MouseEvent) => {
      e.stopPropagation();
      if (item.disabled || loadingKey) return;
      setOpen(false);
      const result = item.onClick();
      if (result instanceof Promise) {
        setLoadingKey(item.key);
        try {
          await result;
        } finally {
          setLoadingKey(null);
        }
      }
    },
    [loadingKey]
  );

  const visibleItems = items.filter((i) => !i.hidden);
  if (visibleItems.length === 0) return null;

  const btnSize = size === "sm" ? 28 : 34;
  const iconSize = size === "sm" ? 15 : 18;

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((p) => !p); }}
        style={{
          width: btnSize,
          height: btnSize,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: open ? "var(--color-border)" : "transparent",
          border: "1px solid " + (open ? "var(--color-border)" : "transparent"),
          borderRadius: 6,
          cursor: "pointer",
          color: "var(--color-text-secondary)",
          transition: "background 0.15s, border-color 0.15s",
          flexShrink: 0,
        }}
        onMouseEnter={(e) => {
          if (!open) {
            (e.currentTarget as HTMLButtonElement).style.background =
              "var(--color-border-light)";
            (e.currentTarget as HTMLButtonElement).style.borderColor =
              "var(--color-border)";
          }
        }}
        onMouseLeave={(e) => {
          if (!open) {
            (e.currentTarget as HTMLButtonElement).style.background =
              "transparent";
            (e.currentTarget as HTMLButtonElement).style.borderColor =
              "transparent";
          }
        }}
        aria-label="Open action menu"
      >
        {loadingKey ? (
          <Loader2 size={iconSize} style={{ animation: "spin 1s linear infinite" }} />
        ) : trigger ? (
          trigger
        ) : (
          <MoreHorizontal size={iconSize} />
        )}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            [align === "right" ? "right" : "left"]: 0,
            minWidth: 176,
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: 10,
            boxShadow:
              "0 8px 24px rgba(26,22,20,0.12), 0 2px 6px rgba(26,22,20,0.06)",
            zIndex: 200,
            overflow: "hidden",
            animation: "menuFadeIn 0.12s ease",
          }}
        >
          {visibleItems.map((item, i) => {
            const prev = visibleItems[i - 1];
            const separator = prev && !prev.danger && item.danger;
            return (
              <div key={item.key}>
                {separator && (
                  <div
                    style={{
                      height: 1,
                      background: "var(--color-border-light)",
                      margin: "4px 0",
                    }}
                  />
                )}
                <button
                  onClick={(e) => handleItemClick(item, e)}
                  disabled={item.disabled || !!loadingKey}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    width: "100%",
                    padding: "9px 14px",
                    background: "none",
                    border: "none",
                    cursor: item.disabled ? "not-allowed" : "pointer",
                    fontSize: 13,
                    fontWeight: 500,
                    color: item.danger
                      ? "var(--color-danger)"
                      : item.disabled
                      ? "var(--color-text-muted)"
                      : "var(--color-text)",
                    opacity: item.disabled ? 0.5 : 1,
                    textAlign: "left",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={(e) => {
                    if (!item.disabled)
                      (e.currentTarget as HTMLButtonElement).style.background =
                        item.danger ? "var(--color-danger-bg)" : "#f8f5f3";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background =
                      "none";
                  }}
                >
                  {item.icon && (
                    <span style={{ flexShrink: 0, opacity: 0.7 }}>
                      {item.icon}
                    </span>
                  )}
                  {loadingKey === item.key ? (
                    <Loader2
                      size={12}
                      style={{ animation: "spin 1s linear infinite" }}
                    />
                  ) : null}
                  {item.label}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
