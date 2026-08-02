import { NextRequest, NextResponse } from "next/server";
import { validateToken, markDeclined } from "@/server/invitation/tokenService";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await validateToken(token);
  if (!result.valid) {
    return NextResponse.json({ error: result.reason }, { status: 404 });
  }
  await markDeclined(token, "WEB");
  return NextResponse.json({ ok: true, status: "DECLINED" });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await validateToken(token);
  if (!result.valid) {
    return NextResponse.json({ error: result.reason }, { status: 404 });
  }
  await markDeclined(token, "EMAIL");
  return NextResponse.redirect(
    new URL(`/invite/${token}/declined`, process.env.NEXTAUTH_URL ?? "http://localhost:5000")
  );
}
