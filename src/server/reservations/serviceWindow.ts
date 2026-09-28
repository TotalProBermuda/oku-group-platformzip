const WEEKEND_OPEN_MINUTES = 14 * 60;

function isFridayThroughSunday(day: number): boolean {
  return day === 0 || day === 5 || day === 6;
}

export function serviceStartForCalendarDate(
  date: string | null,
  configuredStartMinutes: number,
): number {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return configuredStartMinutes;
  const [year, month, day] = date.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return isFridayThroughSunday(weekday) ? WEEKEND_OPEN_MINUTES : configuredStartMinutes;
}

export function serviceStartForInstant(
  instant: Date,
  timezone: string,
  configuredStartMinutes: number,
): number {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
  }).format(instant);
  return ["Fri", "Sat", "Sun"].includes(weekday)
    ? WEEKEND_OPEN_MINUTES
    : configuredStartMinutes;
}
