"use client";

import { useState } from "react";
import { Search, ChevronDown, ChevronRight, GripVertical } from "lucide-react";
import { GROUPS, getWidgetsByGroup, WidgetGroup, widgetRegistry } from "@/lib/hiring/widgetRegistry";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";

type Props = {
  onAddWidget: (widgetKey: string) => void;
};

export default function WidgetSidebar({ onAddWidget }: Props) {
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Set<WidgetGroup>>(
    new Set(["Compliance", "Advanced", "Custom"])
  );

  const q = search.toLowerCase();

  const toggle = (g: WidgetGroup) => {
    setCollapsed((prev) => {
      const s = new Set(prev);
      s.has(g) ? s.delete(g) : s.add(g);
      return s;
    });
  };

  const filteredGroups = GROUPS.map((g) => ({
    group: g,
    widgets: getWidgetsByGroup(g).filter(
      (w) => !q || w.label.toLowerCase().includes(q) || w.key.includes(q)
    ),
  })).filter((g) => g.widgets.length > 0);

  return (
    <aside
      style={{
        width: 280,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "#fff",
        borderRight: "1px solid #e8e2dd",
        overflow: "hidden",
      }}
    >
      {/* Search */}
      <div style={{ padding: "14px 16px", borderBottom: "1px solid #f0ece8" }}>
        <div style={{ position: "relative" }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#b5aca6" }} />
          <input
            type="text"
            placeholder="Search widgets…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: "100%",
              padding: "7px 10px 7px 32px",
              fontSize: 13,
              color: "#1f1a17",
              background: "#f5f1ee",
              border: "1px solid transparent",
              borderRadius: 10,
              outline: "none",
              transition: "border-color 0.15s",
              boxSizing: "border-box",
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "#c41e3a")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "transparent")}
          />
        </div>
      </div>

      {/* Widget groups */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 12px 16px" }}>
        {filteredGroups.map(({ group, widgets }) => {
          const open = !collapsed.has(group) || !!q;
          return (
            <div key={group} style={{ marginBottom: 4 }}>
              <button
                onClick={() => toggle(group)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "6px 4px",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  borderRadius: 6,
                  transition: "background 0.1s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#f5f1ee")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#7d7269", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                    {group}
                  </span>
                  <span style={{ fontSize: 11, color: "#b5aca6", background: "#f0ece8", borderRadius: 10, padding: "1px 6px" }}>
                    {widgets.length}
                  </span>
                </div>
                {open ? <ChevronDown size={12} color="#b5aca6" /> : <ChevronRight size={12} color="#b5aca6" />}
              </button>

              {open && (
                <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 2 }}>
                  {widgets.map((w) => (
                    <DraggableWidgetCard
                      key={w.key}
                      widgetKey={w.key}
                      label={w.label}
                      icon={<w.icon size={14} />}
                      isCompliance={w.isCompliance ?? false}
                      onAdd={() => onAddWidget(w.key)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}

function DraggableWidgetCard({
  widgetKey,
  label,
  icon,
  isCompliance,
  onAdd,
}: {
  widgetKey: string;
  label: string;
  icon: React.ReactNode;
  isCompliance: boolean;
  onAdd: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `widget::${widgetKey}`,
    data: { type: "WIDGET", widgetKey },
  });

  const style = transform ? { transform: CSS.Translate.toString(transform) } : {};

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 10px",
        borderRadius: 10,
        background: hovered ? (isCompliance ? "#fff9ef" : "#f5f1ee") : "transparent",
        border: `1px solid ${hovered ? (isCompliance ? "#f0c070" : "#e8e2dd") : "transparent"}`,
        cursor: isDragging ? "grabbing" : "pointer",
        opacity: isDragging ? 0.5 : 1,
        transition: "background 0.1s, border-color 0.1s",
        userSelect: "none",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onAdd}
    >
      <span
        style={{
          color: isCompliance ? "#b45309" : "#7d7269",
          display: "flex",
          alignItems: "center",
          flexShrink: 0,
        }}
      >
        {icon}
      </span>
      <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: isCompliance ? "#92400e" : "#1f1a17" }}>
        {label}
      </span>
      {isCompliance && (
        <span style={{ fontSize: 9, fontWeight: 800, color: "#b45309", letterSpacing: "0.05em" }}>LOCK</span>
      )}
      <span
        {...attributes}
        {...listeners}
        style={{ cursor: "grab", color: "#b5aca6", display: "flex" }}
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical size={13} />
      </span>
    </div>
  );
}
