import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const series = await prisma.series.findUnique({
    where: { slug },
    select: { id: true, capacityTotal: true, capacitySold: true, capacityReserved: true, availableSeatsMode: true, status: true },
  });
  if (!series) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const remaining = Math.max(0, series.capacityTotal - series.capacitySold - series.capacityReserved);
  const total     = series.capacityTotal || 1;
  const pct       = remaining / total;

  let label = "";
  if (series.availableSeatsMode === "EXACT") {
    label = remaining > 0 ? `${remaining} seats remaining` : "Sold out";
  } else if (series.availableSeatsMode === "APPROXIMATE") {
    if (remaining === 0)    label = "Sold out";
    else if (pct < 0.10)   label = "Almost sold out";
    else if (pct < 0.30)   label = "Limited seats remaining";
    else                   label = "Seats available";
  }

  return NextResponse.json({ remaining, total: series.capacityTotal, label, mode: series.availableSeatsMode, status: series.status });
}
