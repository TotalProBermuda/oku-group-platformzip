import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { getHostQueue } from "@/server/host/hostService";
import { prisma } from "@/lib/prisma";

export async function GET() {
  await requireSession();
  const venue = await prisma.venue.findFirst();
  if (!venue) return NextResponse.json({ ok: true, data: { reservations: [], waitlist: [], zones: [] } });
  const data = await getHostQueue(venue.id);
  return NextResponse.json({ ok: true, data });
}
