"use client";

type FilterOption = { label: string; value: string };

type FilterDef = {
  key: string;
  label: string;
  options: FilterOption[];
  value: string;
  onChange: (val: string) => void;
};

export default function StickyFilterBar({
  filters,
  onReset,
  children,
}: {
  filters: FilterDef[];
  onReset?: () => void;
  children?: React.ReactNode;
}) {
  const hasActive = filters.some((f) => f.value && f.value !== "all" && f.value !== "");

  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 20,
        background: "#faf8f6",
        borderBottom: "1px solid var(--color-border)",
        padding: "10px 0 10px",
        marginBottom: 20,
      }}
    >
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {filters.map((filter) => (
          <div key={filter.key} style={{ position: "relative" }}>
            <select
              value={filter.value || "all"}
              onChange={(e) => filter.onChange(e.target.value === "all" ? "" : e.target.value)}
              style={{
                appearance: "none",
                padding: "7px 28px 7px 12px",
                fontSize: 13,
                fontWeight: filter.value && filter.value !== "all" ? 700 : 500,
                borderRadius: 20,
                border: `1.5px solid ${filter.value && filter.value !== "all" ? "var(--color-crimson)" : "var(--color-border)"}`,
                background: filter.value && filter.value !== "all" ? "#fdf0f0" : "#fff",
                color: filter.value && filter.value !== "all" ? "var(--color-crimson)" : "var(--color-text-muted)",
                cursor: "pointer",
                outline: "none",
                transition: "all 0.15s",
              }}
            >
              <option value="all">{filter.label}</option>
              {filter.options.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <div style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", fontSize: 10, color: "inherit" }}>▾</div>
          </div>
        ))}

        {children}

        {hasActive && onReset && (
          <button
            type="button"
            onClick={onReset}
            style={{ fontSize: 12, color: "var(--color-text-muted)", background: "transparent", border: "none", cursor: "pointer", padding: "7px 8px", textDecoration: "underline" }}
          >
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}
