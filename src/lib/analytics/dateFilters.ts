export type DateRangePreset =
  | "today"
  | "yesterday"
  | "this_week"
  | "last_7_days"
  | "this_month"
  | "last_30_days"
  | "custom";

export type DateRangeInput = {
  preset?: DateRangePreset;
  startDate?: string;
  endDate?: string;
};

export type DateRange = {
  from: Date;
  to: Date;
  label: string;
};

export function resolveDateRange(input?: DateRangeInput): DateRange {
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);

  const preset = input?.preset ?? "last_30_days";

  switch (preset) {
    case "today":
      return { from: todayStart, to: todayEnd, label: "Today" };
    case "yesterday": {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      return { from: startOfDay(y), to: endOfDay(y), label: "Yesterday" };
    }
    case "this_week": {
      const dow = now.getDay();
      const monday = new Date(now);
      monday.setDate(now.getDate() - ((dow + 6) % 7));
      return { from: startOfDay(monday), to: todayEnd, label: "This Week" };
    }
    case "last_7_days": {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      return { from: startOfDay(d), to: todayEnd, label: "Last 7 Days" };
    }
    case "this_month": {
      const m = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: startOfDay(m), to: todayEnd, label: "This Month" };
    }
    case "last_30_days": {
      const d = new Date(now);
      d.setDate(d.getDate() - 30);
      return { from: startOfDay(d), to: todayEnd, label: "Last 30 Days" };
    }
    case "custom": {
      const from = input?.startDate ? new Date(input.startDate) : (() => { const d = new Date(now); d.setDate(d.getDate() - 30); return d; })();
      const to = input?.endDate ? endOfDay(new Date(input.endDate)) : todayEnd;
      return { from, to, label: `${fmtDate(from)} – ${fmtDate(to)}` };
    }
    default:
      return { from: startOfDay(new Date(now.setDate(now.getDate() - 30))), to: todayEnd, label: "Last 30 Days" };
  }
}

export const DATE_PRESET_OPTIONS: { label: string; value: DateRangePreset }[] = [
  { label: "Today",        value: "today" },
  { label: "Yesterday",    value: "yesterday" },
  { label: "This Week",    value: "this_week" },
  { label: "Last 7 Days",  value: "last_7_days" },
  { label: "This Month",   value: "this_month" },
  { label: "Last 30 Days", value: "last_30_days" },
  { label: "Custom Range", value: "custom" },
];

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}
function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}
function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
