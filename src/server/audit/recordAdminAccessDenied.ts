// Helper for emitting `auth.admin.denied` AuditLog rows. Pattern F of the
// audit-log anomaly detector (`anomalyDetector.ts`) reads these rows to
// surface 401/403 clusters on /api/v1/admin/* — without them, the only
// signal of a credential-stuffing burst is raw request logs (which are
// volatile and not queryable from the admin UI).
//
// Best-effort: a failure to write the audit row never breaks the request
// handler that called us.

import { prisma } from "@/lib/prisma";

export interface AdminAccessDeniedInput {
  /** Best-effort actor identity. Use the session user id if any, else "anonymous". */
  actorId?: string | null;
  /** Request method + path, e.g. "GET /api/v1/admin/orders". Caller-supplied so the helper avoids importing Next types. */
  route: string;
  /** 401 (no/invalid session) or 403 (wrong role). */
  status: 401 | 403;
  /** Best-effort client IP, from `x-forwarded-for` or the runtime hint. */
  ip?: string | null;
  /** Optional reason — e.g. "missing-session", "wrong-role:ATTENDEE". */
  reason?: string;
}

export async function recordAdminAccessDenied(
  input: AdminAccessDeniedInput,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: input.actorId || "anonymous",
        action: "auth.admin.denied",
        ip: input.ip ?? null,
        metadata: {
          route: input.route,
          status: input.status,
          reason: input.reason ?? null,
        },
      },
    });
  } catch (e) {
    console.error("[auth.admin.denied] failed to record", input.route, e);
  }
}
