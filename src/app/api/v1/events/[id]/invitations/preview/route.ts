import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { previewAudienceCount } from "@/server/invitation/audienceService";
import { InviteAudienceMode } from "@prisma/client";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await params;
  const session = await getServerSession(authOptions);
  const roles: string[] = (session?.user as any)?.roles ?? [];
  const isAdmin = roles.some((r) => ["SUPERADMIN", "FB_DIRECTOR", "ADMIN_IR", "ADMIN_HR"].includes(r));
  if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const mode = req.nextUrl.searchParams.get("mode") as InviteAudienceMode;
  if (!mode || !Object.values(InviteAudienceMode).includes(mode)) {
    return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
  }

  const count = await previewAudienceCount(mode);
  return NextResponse.json({ count, mode });
}
