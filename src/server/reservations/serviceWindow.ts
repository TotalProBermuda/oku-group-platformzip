import type { WebsiteContent } from "@/server/content/websiteContent";
import { minutesFromTime, operatingDayForDate } from "@/server/content/websiteContent";

export function dateKeyInTimezone(instant: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function minutesInTimezone(instant: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  return hour * 60 + minute;
}

export function reservationIsWithinOperatingHours(content: WebsiteContent, instant: Date): boolean {
  const timezone = content.operationalCalendar.timezone;
  const date = dateKeyInTimezone(instant, timezone);
  const minutes = minutesInTimezone(instant, timezone);
  const day = operatingDayForDate(content, date);
  if (day.closed) return false;
  return day.shifts.some((shift) => {
    const start = minutesFromTime(shift.start);
    const end = minutesFromTime(shift.end);
    return minutes >= start && minutes < end;
  });
}
