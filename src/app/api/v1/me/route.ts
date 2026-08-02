import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const { userId, roles } = await requireSession();
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { profile: true } });
  return NextResponse.json({ ok: true, data: { user, roles } });
}
