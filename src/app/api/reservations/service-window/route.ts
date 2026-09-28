import { NextResponse } from "next/server";
import { getWebsiteContent, operatingDayForDate, slotsForOperatingDate } from "@/server/content/websiteContent";
import { dateKeyInTimezone } from "@/server/reservations/serviceWindow";

// Public, non-sensitive configuration for guest reservation surfaces. The
// structured operating calendar is edited by superadmins only.
export async function GET(request: Request) {
  try {
    const content = await getWebsiteContent();
    const requestedDate = new URL(request.url).searchParams.get("date");
    const date = requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)
      ? requestedDate
      : dateKeyInTimezone(new Date(), content.operationalCalendar.timezone);
    const operatingDay = operatingDayForDate(content, date);
    return NextResponse.json(
      {
        date,
        timezone: content.operationalCalendar.timezone,
        closed: operatingDay.closed,
        exception: operatingDay.exception?.name ?? null,
        shifts: operatingDay.shifts,
        slots: slotsForOperatingDate(content, date),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json({ error: "Reservation availability is temporarily unavailable." }, { status: 503 });
  }
}
