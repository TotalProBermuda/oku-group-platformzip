export const PANAMA_TIME_ZONE = "America/Panama";

export function formatPanamaOperationalDate(value: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: PANAMA_TIME_ZONE,
  }).format(value);
}
