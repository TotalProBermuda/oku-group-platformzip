import { decode } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isValidLocale } from "@/i18n/config";
import { detectLocaleFromHeader } from "@/i18n/utils";
import type { Locale } from "@/types/i18n";
import { logRequest } from "@/server/security/requestLogger";

const ROLE_ROUTES: { prefix: string; allowed: string[] }[] = [
  { prefix: "/admin/ir",           allowed: ["SUPERADMIN", "ADMIN_IR"] },
  { prefix: "/admin/hr",           allowed: ["SUPERADMIN", "ADMIN_HR"] },
  { prefix: "/admin/payouts",      allowed: ["SUPERADMIN", "ADMIN_COMMERCIAL", "ADMIN_FINANCE"] },
  { prefix: "/admin/orders",       allowed: ["SUPERADMIN", "ADMIN_COMMERCIAL"] },
  { prefix: "/admin/series",       allowed: ["SUPERADMIN", "ADMIN_COMMERCIAL"] },
  { prefix: "/admin/experiences",  allowed: ["SUPERADMIN", "ADMIN_COMMERCIAL"] },
  { prefix: "/admin/analytics",    allowed: ["SUPERADMIN", "ADMIN_COMMERCIAL"] },
  { prefix: "/admin/users",        allowed: ["SUPERADMIN", "ADMIN_COMMERCIAL"] },
  { prefix: "/admin",              allowed: ["SUPERADMIN", "ADMIN_COMMERCIAL", "ADMIN_IR", "ADMIN_HR"] },
  { prefix: "/influencer",         allowed: ["SUPERADMIN", "INFLUENCER"] },
  { prefix: "/partner",            allowed: ["SUPERADMIN", "PARTNER"] },
  { prefix: "/investor",           allowed: ["SUPERADMIN", "INVESTOR"] },
  { prefix: "/staff",              allowed: ["SUPERADMIN", "STAFF_OKU", "STAFF_CATCH", "RESTAURANT_HOST", "ADMIN_COMMERCIAL"] },
  // All referrer-capable roles — must mirror REFERRER_CAPABLE_ROLES in
  // src/app/api/v1/referrer/dashboard/route.ts (Edge runtime cannot import it).
  { prefix: "/referrer",           allowed: ["SUPERADMIN", "REFERRER", "TAXI_DRIVER", "HOTEL_CONCIERGE", "CONCIERGE", "TOUR_GUIDE", "PROMOTER", "PRIVATE_NETWORK", "INFLUENCER_SUB_REFERRER", "INFLUENCER", "PARTNER"] },
  { prefix: "/host/streetside",     allowed: ["SUPERADMIN", "STREETSIDE_HOST"] },
  { prefix: "/host/dashboard",     allowed: ["SUPERADMIN", "RESTAURANT_HOST"] },
  { prefix: "/host",               allowed: ["SUPERADMIN", "RESTAURANT_HOST", "STREETSIDE_HOST"] },
  { prefix: "/account",            allowed: ["SUPERADMIN", "ADMIN_COMMERCIAL", "ADMIN_IR", "ADMIN_HR", "INFLUENCER", "PARTNER", "INVESTOR", "STAFF_OKU", "STAFF_CATCH", "ATTENDEE"] },
  { prefix: "/my",                 allowed: ["SUPERADMIN", "ADMIN_COMMERCIAL", "ADMIN_IR", "ADMIN_HR", "INFLUENCER", "PARTNER", "INVESTOR", "STAFF_OKU", "STAFF_CATCH", "ATTENDEE"] },
];

const PROTECTED_PREFIXES = [
  "/admin", "/influencer", "/partner", "/investor",
  "/staff", "/referrer", "/host", "/my", "/account",
];

const PUBLIC_PATHS = [
  "/restaurants", "/experiences", "/series", "/careers",
  "/jobs", "/login", "/reservations", "/checkout",
];

// The cookie name and salt must match exactly what demo-login uses in encode().
const SESSION_COOKIE = "next-auth.session-token";
// Inline fail-closed copy (Edge runtime imports must be cheap and self-contained).
// Mirrors src/lib/authSecret.ts intentionally so the policy is identical.
function resolveAuthSecret(): string {
  const s = process.env.NEXTAUTH_SECRET;
  if (s && s.length > 0) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error("NEXTAUTH_SECRET is required in production. Refusing to boot middleware with an insecure default.");
  }
  return "replace-me";
}
const SECRET = resolveAuthSecret();

// Any role in this set is allowed to *reach* an `/api/v1/admin/**` route at
// the middleware layer. Per-route handlers still apply finer SUPERADMIN-only /
// permission-key checks (which emit their own `auth.admin.denied` rows via
// `requireAdminPermission` / `requireAdminRoles` in src/server/auth/adminGuard.ts).
// Middleware here is the universal chokepoint that guarantees detector pattern
// F (audit-anomaly RUNBOOK §1.2) sees a denial row even from routes that have
// not yet been migrated to the shared guard.
const ADMIN_API_ALLOWED_ROLES = new Set([
  "SUPERADMIN",
  "ADMIN_COMMERCIAL",
  "ADMIN_IR",
  "ADMIN_HR",
  "ADMIN_FINANCE",
]);

const ADMIN_API_PREFIX = "/api/v1/admin/";

function getClientIp(req: NextRequest): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || null;
  return req.headers.get("x-real-ip");
}

async function recordAdminApiDenial(
  req: NextRequest,
  status: 401 | 403,
  actorId: string | null,
  roles: string[],
): Promise<void> {
  // Fire-and-forget POST to the Node-runtime internal endpoint, signed with
  // NEXTAUTH_SECRET so external callers can't forge denial rows. We never
  // await the response — if Sentry pages 60s late, that's still well inside
  // the detector's 15-min scan window.
  try {
    const body = JSON.stringify({
      actorId,
      status,
      path: req.nextUrl.pathname,
      method: req.method,
      roles,
      ip: getClientIp(req),
    });
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(body));
    const sig = Array.from(new Uint8Array(sigBuf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const origin = req.nextUrl.origin;
    void fetch(`${origin}/api/internal/audit/admin-denied`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-oku-signature": sig,
      },
      body,
    }).catch(() => {});
  } catch {
    // never let denial logging break the response
  }
}

function getLocaleFromRequest(req: NextRequest): Locale {
  const cookieLocale = req.cookies.get("oku_locale")?.value;
  if (cookieLocale && isValidLocale(cookieLocale)) return cookieLocale;
  const acceptLang = req.headers.get("accept-language");
  return detectLocaleFromHeader(acceptLang);
}

async function getSession(req: NextRequest) {
  // NOTE: next-auth's getToken() does NOT forward the `salt` param to decode(),
  // so calling getToken({ salt }) is a no-op — the wrong HKDF key is derived and
  // decryption always returns null. We call decode() directly instead.
  const cookieValue = req.cookies.get(SESSION_COOKIE)?.value;
  if (!cookieValue) return null;
  try {
    return await decode({
      token: cookieValue,
      secret: SECRET,
      salt: SESSION_COOKIE,
    } as any);
  } catch {
    return null;
  }
}

export async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  // ── 0. Universal denial logging for /api/v1/admin/** ──────────────────────
  // Runs *before* locale handling because admin API paths never carry locale
  // prefixes. Denial rows feed detector pattern F (audit-anomaly RUNBOOK §1.2).
  if (pathname.startsWith(ADMIN_API_PREFIX)) {
    const token = await getSession(req);
    if (!token) {
      void recordAdminApiDenial(req, 401, null, []);
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      );
    }
    const roles: string[] = (token.roles as string[]) ?? [];
    const hasAdminRole = roles.some((r) => ADMIN_API_ALLOWED_ROLES.has(r));
    if (!hasAdminRole) {
      const actorId = (token.sub as string | undefined) ?? null;
      void recordAdminApiDenial(req, 403, actorId, roles);
      return NextResponse.json(
        { ok: false, error: "Forbidden" },
        { status: 403 },
      );
    }
    // Fall through — per-route handlers still apply finer SUPERADMIN-only or
    // permission-key checks, which emit their own `auth.admin.denied` rows
    // when migrated to `requireAdminPermission` / `requireAdminRoles`.
    return NextResponse.next();
  }

  // Request log — every payload scrubbed by scrubLogPayload before stdout.
  // Lives in middleware (vs. per-route) so a future route forgetting to
  // log still leaves a sanitized trail of who hit what. Authorization /
  // Cookie / set-cookie header values are replaced wholesale.
  try {
    logRequest({
      method: req.method,
      url: pathname + (req.nextUrl.search || ""),
      headers: req.headers,
    });
  } catch {
    // never let logging break a request
  }

  // Strip locale prefix for logic checks — e.g. /en/admin/ir → /admin/ir
  const localeMatch = pathname.match(/^\/(en|es|pt)(\/|$)/);
  const strippedPath = localeMatch
    ? pathname.slice(localeMatch[1].length + 1) || "/"
    : pathname;
  const detectedLocale: Locale = localeMatch
    ? (localeMatch[1] as Locale)
    : getLocaleFromRequest(req);

  // ── 1. Redirect bare public paths to locale-prefixed versions ─────────────
  const isPublicPath = PUBLIC_PATHS.some(
    (p) => strippedPath === p || strippedPath.startsWith(`${p}/`)
  );
  if (isPublicPath && !localeMatch) {
    const url = req.nextUrl.clone();
    url.pathname = `/${detectedLocale}${pathname}`;
    return NextResponse.redirect(url);
  }

  // ── 2. Auth check for protected routes ────────────────────────────────────
  const pathForCheck = localeMatch ? strippedPath : pathname;

  // Explicitly public paths that live under normally-protected prefixes
  const PUBLIC_EXCEPTIONS = ["/influencer/accept-invite"];
  const isPublicException = PUBLIC_EXCEPTIONS.some(
    (p) => pathForCheck === p || pathForCheck.startsWith(`${p}?`)
  );

  const needsAuth = !isPublicException && PROTECTED_PREFIXES.some(
    (p) => pathForCheck === p || pathForCheck.startsWith(`${p}/`)
  );

  if (needsAuth) {
    const token = await getSession(req);

    if (!token) {
      const url = req.nextUrl.clone();
      url.pathname = `/${detectedLocale}/login`;
      url.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(url);
    }

    // ── 3. Role-based access control ────────────────────────────────────────
    const roles: string[] = (token.roles as string[]) ?? [];
    for (const rule of ROLE_ROUTES) {
      if (pathForCheck.startsWith(rule.prefix)) {
        const allowed = roles.some((r) => rule.allowed.includes(r));
        if (!allowed) {
          const url = req.nextUrl.clone();
          url.pathname = `/${detectedLocale}/login`;
          url.searchParams.set("callbackUrl", pathname);
          return NextResponse.redirect(url);
        }
        break;
      }
    }
  }

  // ── 4. Pass through — set x-locale header for layouts ───────────────────
  // Forward request headers so React Server Components (e.g. not-found.tsx
  // which receives no params) can read the active locale via headers().
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-locale", detectedLocale);
  requestHeaders.set("x-pathname", pathname);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("x-locale", detectedLocale);
  response.headers.set("x-pathname", pathForCheck);

  // If a session cookie is present but invalid, clear it now so subsequent
  // requests from this device don't keep triggering JWT_SESSION_ERROR logs.
  const rawCookie = req.cookies.get(SESSION_COOKIE)?.value;
  if (rawCookie) {
    const decoded = await getSession(req);
    if (!decoded) {
      response.cookies.set(SESSION_COOKIE, "", {
        httpOnly: true,
        sameSite: process.env.NODE_ENV === "production" ? "lax" : "none",
        secure: true,
        path: "/",
        maxAge: 0,
      });
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/(en|es|pt)",
    "/(en|es|pt)/:path*",
    "/admin/:path*",
    "/influencer/:path*",
    "/partner/:path*",
    "/investor/:path*",
    "/staff/:path*",
    "/referrer/:path*",
    "/host/:path*",
    "/my/:path*",
    "/account/:path*",
    "/restaurants/:path*",
    "/experiences/:path*",
    "/series/:path*",
    "/careers/:path*",
    "/jobs/:path*",
    "/login",
    "/reservations/:path*",
    "/checkout/:path*",
    "/api/v1/admin/:path*",
  ],
};
