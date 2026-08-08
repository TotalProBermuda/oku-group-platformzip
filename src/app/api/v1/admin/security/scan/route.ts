import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/server/auth/adminGuard";
import { runAuditAnomalyScan } from "@/server/audit/anomalyAlerter";
import { prisma } from "@/lib/prisma";
import { scrubErrorMessage } from "@/server/security/logScrub";

// Manual "scan now" trigger for the admin security dashboard. The
// 15-min BullMQ worker job is the primary path; this exists so an
// on-call engineer can re-run a scan immediately after addressing a
// signal without waiting for the next tick. Audit-logs the actor.
export async function POST(req: Request) {
  try {
    const { userId } = await requireAdminPermission(req, "admin:security:read");
    const result = await runAuditAnomalyScan();
    try {
      await prisma.auditLog.create({
        data: {
          actorId: userId,
          action: "admin.security.scan.manual",
          metadata: {
            signalsDetected: result.signalsDetected,
            signalsAlerted: result.signalsAlerted,
            signalsSuppressed: result.signalsSuppressed,
            startedAt: result.startedAt,
            finishedAt: result.finishedAt,
          },
        },
      });
    } catch {
      // Audit failure must not block the scan response.
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (e: unknown) {
    const status = (e as { status?: number })?.status ?? 500;
    return NextResponse.json(
      { ok: false, error: scrubErrorMessage(e) },
      { status },
    );
  }
}
