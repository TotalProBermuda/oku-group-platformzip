export const PANAMA_TIME_ZONE = "America/Panama";

/** Format an instant for a `datetime-local` control using the venue's clock. */
export function panamaDateTimeLocalInput(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PANAMA_TIME_ZONE,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(value);
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

/** Convert a Panama-local `datetime-local` value into an unambiguous UTC instant. */
export function panamaDateTimeLocalIso(value: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(value);
  if (!match) throw new Error("Choose a valid Panama date and time.");
  const instant = new Date(`${match[1]}T${match[2]}:00-05:00`);
  if (Number.isNaN(instant.getTime()) || panamaDateTimeLocalInput(instant) !== value) {
    throw new Error("Choose a valid Panama date and time.");
  }
  return instant.toISOString();
}

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
