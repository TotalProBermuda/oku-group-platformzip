import { NextRequest, NextResponse } from "next/server";
import {
  checkRateLimitAsync,
  clientIp,
  isBotSubmission,
  rateLimitedResponse,
} from "@/server/rateLimit";
import {
  isValidPasswordlessEmail,
  issuePasswordlessToken,
  normalizePasswordlessEmail,
  passwordlessEmailRateLimitKey,
} from "@/server/auth/passwordless";

export const runtime = "nodejs";

const GENERIC_RESPONSE = {
  ok: true,
  message: "If this email can sign in, a secure link will arrive shortly.",
};

export async function POST(req: NextRequest) {
  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > 4096) {
    return NextResponse.json({ ok: false, error: "Request body too large" }, { status: 413 });
  }
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (origin && host) {
    try {
      if (new URL(origin).host !== host) {
        return NextResponse.json({ ok: false, error: "Invalid request origin" }, { status: 403 });
      }
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid request origin" }, { status: 403 });
    }
  }

  let body: { email?: unknown; callbackUrl?: unknown; locale?: unknown; _company?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(GENERIC_RESPONSE);
  }

  if (isBotSubmission(body)) {
    return NextResponse.json(GENERIC_RESPONSE);
  }

  const email = normalizePasswordlessEmail(body.email);
  const ip = clientIp(req);
  const requireDistributed = process.env.NODE_ENV === "production";
  const [ipLimit, emailLimit] = await Promise.all([
    checkRateLimitAsync({
      key: `passwordless:ip:${ip}`,
      windowMs: 15 * 60 * 1000,
      limit: 5,
      requireDistributed,
    }),
    checkRateLimitAsync({
      key: `passwordless:email:${passwordlessEmailRateLimitKey(email)}`,
      windowMs: 15 * 60 * 1000,
      limit: 3,
      requireDistributed,
    }),
  ]);
  if (!ipLimit.ok) return rateLimitedResponse(ipLimit);
  if (!emailLimit.ok) return rateLimitedResponse(emailLimit);

  if (!isValidPasswordlessEmail(email)) {
    return NextResponse.json(GENERIC_RESPONSE);
  }

  try {
    await issuePasswordlessToken({
      email,
      callbackUrl: body.callbackUrl,
      locale: body.locale,
    });
  } catch (error) {
    // Keep the public response indistinguishable. Never log email addresses or
    // bearer credentials from this endpoint.
    console.error(
      "[passwordless] request failed",
      error instanceof Error ? error.name : "UnknownError",
    );
  }

  return NextResponse.json(GENERIC_RESPONSE);
}