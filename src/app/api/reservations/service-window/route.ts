import { NextResponse } from "next/server";
import { getCommerceSettings } from "@/server/commerce/commerceSettings";

function slotsBetween(startMinutes: number, endMinutes: number): string[] {
  const slots: string[] = [];
  for (let minutes = startMinutes; minutes <= endMinutes; minutes += 30) {
    slots.push(`${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`);
  }
  return slots;
}

// Public, non-sensitive configuration for guest reservation surfaces. The
// source of truth remains CommerceSettings and is edited by superadmins only.
export async function GET() {
  try {
    const settings = await getCommerceSettings();
    return NextResponse.json(
      {
        serviceStartMinutes: settings.reservationServiceStartMinutes,
        serviceEndMinutes: settings.reservationServiceEndMinutes,
        slots: slotsBetween(settings.reservationServiceStartMinutes, settings.reservationServiceEndMinutes),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json({ error: "Reservation availability is temporarily unavailable." }, { status: 503 });
  }
}
