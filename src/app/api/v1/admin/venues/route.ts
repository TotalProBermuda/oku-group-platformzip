import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
};

function isAdmin(session: any) {
  return session?.user?.roles?.some((r: string) =>
    ["SUPERADMIN", "FB_DIRECTOR", "ADMIN_COMMERCIAL"].includes(r)
  );
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: NO_STORE_HEADERS });

  const venues = await prisma.venue.findMany({
    select: { id: true, name: true, slug: true, city: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ venues }, { headers: NO_STORE_HEADERS });
}
