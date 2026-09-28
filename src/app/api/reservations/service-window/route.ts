import { NextResponse } from "next/server";
import { getCommerceSettings } from "@/server/commerce/commerceSettings";
import { serviceStartForCalendarDate } from "@/server/reservations/serviceWindow";

function slotsBetween(startMinutes: number, endMinutes: number): string[] {
  const slots: string[] = [];
  for (let minutes = startMinutes; minutes <= endMinutes; minutes += 30) {
    slots.push(`${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`);
  }
  return slots;
}

// Public, non-sensitive configuration for guest reservation surfaces. The
// source of truth remains CommerceSettings and is edited by superadmins only.
export async function GET(request: Request) {
  try {
    const settings = await getCommerceSettings();
    const date = new URL(request.url).searchParams.get("date");
    const serviceStartMinutes = serviceStartForCalendarDate(
      date,
      settings.reservationServiceStartMinutes,
    );
    return NextResponse.json(
      {
        serviceStartMinutes,
        serviceEndMinutes: settings.reservationServiceEndMinutes,
        slots: slotsBetween(serviceStartMinutes, settings.reservationServiceEndMinutes),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json({ error: "Reservation availability is temporarily unavailable." }, { status: 503 });
  }
}
