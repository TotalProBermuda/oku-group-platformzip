import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { revokeInvuToken } from "@/server/services/invu/invuAuthService";

function isSuperadmin(session: any) {
  return session?.user?.roles?.some((r: string) => r === "SUPERADMIN");
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isSuperadmin(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { credentialId } = await req.json();
    if (!credentialId) return NextResponse.json({ error: "credentialId is required" }, { status: 400 });

    await revokeInvuToken(credentialId, {
      userId: session.user?.id ?? undefined,
      ip: req.headers.get("x-forwarded-for") ?? undefined,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Disconnect failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
