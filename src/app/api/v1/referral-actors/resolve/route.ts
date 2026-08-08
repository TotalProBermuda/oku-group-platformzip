import { NextRequest, NextResponse } from "next/server";
import { resolveActorFromCode } from "@/server/referrals/referralActorService";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.json({ ok: false, error: "code param is required" }, { status: 400 });
  }

  const result = await resolveActorFromCode(code);

  if (!result) {
    return NextResponse.json({ ok: false, found: false }, { status: 404 });
  }

  return NextResponse.json({ ok: true, found: true, ...result });
}
