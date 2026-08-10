import { NextRequest, NextResponse } from "next/server";
import { encode } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { isDemoModeEnabled, DEMO_DISABLED_MESSAGE } from "@/lib/demoMode";
import { resolveAuthSecret } from "@/lib/authSecret";
import { sameSiteForEnv } from "@/lib/cookieSecurity";
import { sanitizeCallbackUrlForRoles } from "@/lib/routePolicy";

const ALLOWED_DEMO_DOMAIN = "oku.local";

function publicBase(): string {
  // NEXTAUTH_URL is set to the public Replit dev domain in .env.local.
  // We CANNOT use req.url because Next.js receives requests via the internal
  // reverse-proxy address (localhost:5000), so req.url is always localhost.
  const url = process.env.NEXTAUTH_URL ?? process.env.REPLIT_DEV_DOMAIN;
  if (url) {
    try {
      const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
      return parsed.origin;
    } catch {}
  }
  return "http://localhost:5000";
}

export async function GET(req: NextRequest) {
  if (!isDemoModeEnabled()) {
    return NextResponse.json(
      { ok: false, error: DEMO_DISABLED_MESSAGE },
      { status: 403 },
    );
  }

  const { searchParams } = req.nextUrl;
  const email = searchParams.get("email") ?? "";
  const callbackUrl = searchParams.get("callbackUrl") ?? "/en";

  const base = publicBase();
  const loginUrl = `${base}/en/login`;

  if (!email.endsWith(`@${ALLOWED_DEMO_DOMAIN}`)) {
    return NextResponse.redirect(loginUrl);
  }

  const user = await prisma.user.findUnique({
    where: { email },
    include: { roles: true },
  });

  if (!user) return NextResponse.redirect(loginUrl);

  const roles = user.roles.map((r) => r.roleKey);
  const secret = resolveAuthSecret();
  const maxAge = 30 * 24 * 60 * 60;
  const COOKIE_NAME = "next-auth.session-token";

  const token = await encode({
    token: {
      sub: user.id,
      userId: user.id,
      email: user.email,
      name: user.name ?? user.email,
      picture: user.imageUrl ?? null,
      roles,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + maxAge,
    },
    secret,
    maxAge,
    salt: COOKIE_NAME,
  } as any);

  // Build destination using the public base — never localhost.
  // If a stale callback points to a portal this persona cannot access, land on
  // the role's correct dashboard instead of bouncing through middleware.
  const safeCallbackUrl = sanitizeCallbackUrlForRoles(callbackUrl, roles);
  const dest = `${base}${safeCallbackUrl}`;

  const res = NextResponse.redirect(dest);

  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: sameSiteForEnv(),
    secure: true,
    path: "/",
    maxAge,
  });

  return res;
}
