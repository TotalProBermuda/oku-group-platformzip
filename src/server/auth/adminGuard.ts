// Central admin auth boundary. Wraps `requireSession` + permission/role
// checks and — crucially — emits `auth.admin.denied` AuditLog rows on every
// 401/403 result so the audit-anomaly detector (`anomalyDetector.ts`
// pattern F) can spot credential-stuffing bursts on `/api/v1/admin/*`.
//
// Two entry points:
//
//   await requireAdminPermission(req, "admin:tickets:write")
//   await requireAdminRoles(req, ["SUPERADMIN", "ADMIN_COMMERCIAL"])
//
// On success: returns `{ session, userId, roles }` (the same shape as
// `requireSession`). On failure: writes an `auth.admin.denied` audit row
// and throws an Error with `.status` set to 401 or 403, matching the
// existing route-error contract used across `src/app/api/v1/admin/**`.

import { requireSession, getOptionalSession } from "@/server/auth/session";
import { hasPermission } from "@/lib/permissions";
import type { PermissionKey, RoleKey } from "@/types/roles";
import { recordAdminAccessDenied } from "@/server/audit/recordAdminAccessDenied";

export class AdminAuthError extends Error {
  status: 401 | 403;
  constructor(status: 401 | 403, message: string) {
    super(message);
    this.status = status;
  }
}

interface RouteHint {
  method: string;
  url: string;
  headers?: Headers;
}

function describe(req: Request | RouteHint): RouteHint {
  if (req instanceof Request) {
    let path = req.url;
    try {
      path = new URL(req.url).pathname;
    } catch {
      // leave as-is
    }
    return { method: req.method, url: path, headers: req.headers };
  }
  return req;
}

function clientIp(headers?: Headers): string | null {
  if (!headers) return null;
  const xf = headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0]!.trim();
  return headers.get("x-real-ip");
}

/**
 * Require an authenticated admin holding `permission`. Emits
 * `auth.admin.denied` on 401 (no session) or 403 (wrong roles) and throws.
 */
export async function requireAdminPermission(
  req: Request | RouteHint,
  permission: PermissionKey,
) {
  const hint = describe(req);
  const route = `${hint.method} ${hint.url}`;
  const ip = clientIp(hint.headers);

  const opt = await getOptionalSession();
  if (!opt) {
    await recordAdminAccessDenied({
      route,
      status: 401,
      ip,
      reason: "missing-session",
    });
    throw new AdminAuthError(401, "Unauthorized");
  }
  if (!hasPermission(opt.roles, permission)) {
    await recordAdminAccessDenied({
      actorId: opt.userId,
      route,
      status: 403,
      ip,
      reason: `missing-permission:${permission}`,
    });
    throw new AdminAuthError(403, "Forbidden");
  }
  // Round-trip through requireSession so callers also benefit from its
  // stale-JWT user-id resolution.
  return requireSession();
}

/**
 * Require an authenticated admin whose role set intersects `allowedRoles`.
 * For routes that historically did `roles.includes("SUPERADMIN")`-style
 * checks rather than going through the permission system.
 */
export async function requireAdminRoles(
  req: Request | RouteHint,
  allowedRoles: RoleKey[],
) {
  const hint = describe(req);
  const route = `${hint.method} ${hint.url}`;
  const ip = clientIp(hint.headers);

  const opt = await getOptionalSession();
  if (!opt) {
    await recordAdminAccessDenied({
      route,
      status: 401,
      ip,
      reason: "missing-session",
    });
    throw new AdminAuthError(401, "Unauthorized");
  }
  const allowed = opt.roles.some((r) => allowedRoles.includes(r));
  if (!allowed) {
    await recordAdminAccessDenied({
      actorId: opt.userId,
      route,
      status: 403,
      ip,
      reason: `missing-role:${allowedRoles.join("|")}`,
    });
    throw new AdminAuthError(403, "Forbidden");
  }
  return requireSession();
}
