/**
 * Reads the most recent `launch.readiness.alert.test_sent` audit rows for
 * the "Recent test alerts" panel on /admin/launch-readiness (Task #138).
 *
 * These rows record dry-run sends triggered by the SUPERADMIN "Send test
 * alert" button. Unlike the production alert rows, the recipient address
 * IS surfaced here — it is always the acting SUPERADMIN's own email, so
 * there is no PII concern, and showing it is the entire point of the
 * panel (operator wants to confirm "yes, the email landed at <me>").
 */
import { prisma } from "@/lib/prisma";

export type RecentLaunchReadinessTestAlert = {
  id: string;
  createdAt: string;
  /** Email the test alert was addressed to (the acting operator). */
  recipient: string | null;
  /** Display name / email of the actor who pressed the button. */
  actorLabel: string | null;
  /** True when the email transport reported a successful send. */
  ok: boolean;
  /** Sanitized short error message when send failed. */
  errorMessage: string | null;
};

function truncate(s: string, max = 200): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export async function getRecentLaunchReadinessTestAlerts(
  limit = 5,
): Promise<RecentLaunchReadinessTestAlert[]> {
  const rows = await prisma.auditLog
    .findMany({
      where: { action: "launch.readiness.alert.test_sent" },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        actorId: true,
        createdAt: true,
        metadata: true,
      },
    })
    .catch((err) => {
      console.warn(
        "[launch-readiness-test-alerts-panel] failed to read recent test alerts:",
        err instanceof Error ? err.message : err,
      );
      return [] as Array<{
        id: string;
        actorId: string;
        createdAt: Date;
        metadata: unknown;
      }>;
    });

  if (rows.length === 0) return [];

  const actorIds = Array.from(new Set(rows.map((r) => r.actorId).filter(Boolean)));
  const actors = actorIds.length
    ? await prisma.user
        .findMany({
          where: { id: { in: actorIds } },
          select: { id: true, name: true, email: true },
        })
        .catch(() => [] as Array<{ id: string; name: string | null; email: string | null }>)
    : [];
  const actorById = new Map(actors.map((u) => [u.id, u]));

  return rows.map((r) => {
    const md = (r.metadata ?? {}) as Record<string, unknown>;
    const ok = md.ok === true;
    const to = typeof md.to === "string" ? md.to : null;
    const rawError = typeof md.error === "string" ? md.error : null;
    const actor = actorById.get(r.actorId);
    const actorLabel = actor?.name?.trim() || actor?.email || null;
    return {
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      recipient: to,
      actorLabel,
      ok,
      errorMessage: rawError ? truncate(rawError) : null,
    };
  });
}
