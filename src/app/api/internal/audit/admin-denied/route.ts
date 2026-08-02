import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { resolveAuthSecret } from "@/lib/authSecret";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Internal endpoint called by Edge middleware (src/middleware.ts) when an
// `/api/v1/admin/**` request is rejected at 401 (no session) or 403 (wrong
// role). Edge runtime cannot reach Prisma, so middleware fire-and-forget
// POSTs here so detector pattern F has a single stream of `auth.admin.denied`
// AuditLog rows for every admin-API denial — not just the routes that
// happen to use `requireAdminPermission` / `requireAdminRoles` directly.
//
// Authenticated by an HMAC-SHA256 signature of the raw body using
// `NEXTAUTH_SECRET` so external callers cannot forge denial rows.

const SECRET = resolveAuthSecret();

export async function POST(req: Request) {
  const raw = await req.text();
  const sigHeader = req.headers.get("x-oku-signature") ?? "";

  const expected = createHmac("sha256", SECRET).update(raw).digest("hex");
  let ok = false;
  try {
    const a = Buffer.from(sigHeader, "hex");
    const b = Buffer.from(expected, "hex");
    ok = a.length === b.length && timingSafeEqual(a, b);
  } catch {
    ok = false;
  }
  if (!ok) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let payload: {
    actorId?: string | null;
    status?: number;
    path?: string;
    method?: string;
    roles?: string[];
    requiredRoles?: string[];
    ip?: string | null;
  } = {};
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }

  const status = payload.status === 403 ? 403 : 401;
  await prisma.auditLog
    .create({
      data: {
        // AuditLog.actorId is non-nullable; use "anonymous" sentinel for
        // unauthenticated 401 denials so the row still lands in the table
        // and detector pattern F can cluster it by IP.
        actorId: payload.actorId ?? "anonymous",
        action: "auth.admin.denied",
        ip: payload.ip ?? null,
        metadata: {
          status,
          path: payload.path ?? null,
          method: payload.method ?? null,
          roles: payload.roles ?? [],
          requiredRoles: payload.requiredRoles ?? [],
          source: "middleware",
        },
      },
    })
    .catch(() => {});

  return NextResponse.json({ ok: true });
}
