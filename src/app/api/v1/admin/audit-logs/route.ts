import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function isSuperadmin(session: any) {
  return session?.user?.roles?.some((r: string) => r === "SUPERADMIN");
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isSuperadmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const actionPrefix = req.nextUrl.searchParams.get("actionPrefix") ?? "";
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") ?? "20", 10), 100);

  const logs = await prisma.auditLog.findMany({
    where: actionPrefix ? { action: { startsWith: actionPrefix } } : undefined,
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return NextResponse.json({ logs });
}
