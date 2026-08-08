import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { validateAndCheckIn } from "@/server/checkin/checkInService";
import { hasPermission } from "@/lib/permissions";
import type { RoleKey } from "@/types/roles";

export async function POST(req: Request) {
  try {
    const { userId, roles } = await requireSession();
    if (!hasPermission((roles ?? []) as RoleKey[], "tickets:checkin")) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { code, deviceInfo, sessionId } = body as {
      code?: string;
      deviceInfo?: string;
      sessionId?: string;
    };

    if (!code?.trim()) {
      return NextResponse.json({ ok: false, error: "code is required" }, { status: 400 });
    }

    const result = await validateAndCheckIn(code.trim().toUpperCase(), userId, {
      method: "QR",
      deviceInfo,
      expectedSessionId: sessionId?.trim() || undefined,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    const status = e.status || 500;
    return NextResponse.json({ ok: false, error: e.message }, { status });
  }
}
