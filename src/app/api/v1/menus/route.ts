import { NextResponse } from "next/server";
import { getFoodMenuByVenueDb, getDrinksMenuByVenueDb, getMenusByVenueDb } from "@/server/menus/menuService";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const venue = url.searchParams.get("venue") as "oku" | "catch" | "terrace" | null;
  const type = url.searchParams.get("type"); // "food" | "drinks" | null

  if (!venue || !["oku", "catch", "terrace"].includes(venue)) {
    return NextResponse.json({ ok: false, error: "Invalid or missing venue" }, { status: 400 });
  }

  if (type === "food") {
    const menu = await getFoodMenuByVenueDb(venue);
    return NextResponse.json({ ok: true, data: menu });
  }
  if (type === "drinks") {
    const menu = await getDrinksMenuByVenueDb(venue);
    return NextResponse.json({ ok: true, data: menu });
  }
  const menus = await getMenusByVenueDb(venue);
  return NextResponse.json({ ok: true, data: menus });
}
