import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getInvitationMetrics } from "@/server/invitation/invitationService";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  const roles: string[] = (session?.user as any)?.roles ?? [];
  const isAdmin = roles.some((r) => ["SUPERADMIN", "ADMIN_COMMERCIAL", "ADMIN_IR", "ADMIN_HR"].includes(r));
  if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const metrics = await getInvitationMetrics(id);
  return NextResponse.json(metrics);
}
