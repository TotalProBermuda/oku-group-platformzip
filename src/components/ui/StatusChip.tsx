type StatusChipVariant =
  | "pending" | "confirmed" | "waitlisted" | "acknowledged" | "arrived"
  | "seated" | "completed" | "cancelled" | "no_show" | "active" | "ready"
  | "approved" | "rejected" | "paid" | "suggested" | "open" | "resolved"
  | "en_route" | "closed" | "lost" | "patronized" | "initiated" | "green"
  | "yellow" | "red" | "gray" | "blue";

const CHIP_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  pending:      { bg: "#fef9ec", color: "#92700a", label: "Pending" },
  confirmed:    { bg: "#e8f5e9", color: "#1b5e20", label: "Confirmed" },
  waitlisted:   { bg: "#fff3e0", color: "#e65100", label: "Waitlisted" },
  acknowledged: { bg: "#e3f2fd", color: "#0d47a1", label: "Acknowledged" },
  arrived:      { bg: "#e8f5e9", color: "#1b5e20", label: "Arrived" },
  seated:       { bg: "#1f8a55", color: "#fff", label: "Seated" },
  completed:    { bg: "#1a1614", color: "#fff", label: "Completed" },
  cancelled:    { bg: "#fef2f2", color: "#991b1b", label: "Cancelled" },
  no_show:      { bg: "#fef2f2", color: "#991b1b", label: "No Show" },
  active:       { bg: "#e8f5e9", color: "#1b5e20", label: "Active" },
  ready:        { bg: "#c41e3a", color: "#fff", label: "Ready" },
  approved:     { bg: "#e8f5e9", color: "#1b5e20", label: "Approved" },
  rejected:     { bg: "#fef2f2", color: "#991b1b", label: "Rejected" },
  paid:         { bg: "#1f8a55", color: "#fff", label: "Paid" },
  suggested:    { bg: "#fff3e0", color: "#e65100", label: "Suggested" },
  open:         { bg: "#fff3e0", color: "#e65100", label: "Open" },
  resolved:     { bg: "#f3f4f6", color: "#6b7280", label: "Resolved" },
  en_route:     { bg: "#e3f2fd", color: "#0d47a1", label: "En Route" },
  closed:       { bg: "#f3f4f6", color: "#6b7280", label: "Closed" },
  lost:         { bg: "#fef2f2", color: "#991b1b", label: "Lost" },
  patronized:   { bg: "#1f8a55", color: "#fff", label: "Patronized" },
  initiated:    { bg: "#fef9ec", color: "#92700a", label: "Initiated" },
  green:        { bg: "#e8f5e9", color: "#1b5e20", label: "" },
  yellow:       { bg: "#fef9ec", color: "#92700a", label: "" },
  red:          { bg: "#fef2f2", color: "#991b1b", label: "" },
  gray:         { bg: "#f3f4f6", color: "#6b7280", label: "" },
  blue:         { bg: "#e3f2fd", color: "#0d47a1", label: "" },
};

function normalize(status: string): string {
  return status.toLowerCase().replace(/[\s-]/g, "_");
}

export default function StatusChip({
  status,
  label: labelOverride,
  size = "sm",
}: {
  status: StatusChipVariant | string;
  label?: string;
  size?: "xs" | "sm" | "md";
}) {
  const key = normalize(status);
  const style = CHIP_STYLES[key] ?? { bg: "#f3f4f6", color: "#6b7280", label: status };
  const displayLabel = (labelOverride ?? style.label) || status;

  const padding = size === "xs" ? "2px 7px" : size === "md" ? "5px 14px" : "3px 10px";
  const fontSize = size === "xs" ? 10 : size === "md" ? 13 : 11;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding,
        borderRadius: 20,
        background: style.bg,
        color: style.color,
        fontSize,
        fontWeight: 700,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
      }}
    >
      {displayLabel}
    </span>
  );
}
