import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { prisma } from "@/lib/prisma";
import { runLaunchReadinessAlertTestSend } from "@/server/launchReadiness/launchReadinessAlertService";
import { checkRateLimitAsync } from "@/server/rateLimit";

const TEST_ALERT_LIMIT = 5;
const TEST_ALERT_WINDOW_MS = 60_000;

export async function POST() {
  try {
    const { userId, roles, session } = await requireSession();
    if (!roles.includes("SUPERADMIN")) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }
    const to = session.user?.email;
    if (!to) {
      return NextResponse.json(
        { ok: false, error: "Your account has no email address on file." },
        { status: 400 },
      );
    }

    const rl = await checkRateLimitAsync({
      key: `launch-readiness:test-alert:${userId}`,
      limit: TEST_ALERT_LIMIT,
      windowMs: TEST_ALERT_WINDOW_MS,
    });
    if (!rl.ok) {
      const retryAfter = rl.retryAfterSeconds ?? 60;
      return NextResponse.json(
        {
          ok: false,
          error: `Too many test alerts. Please wait ${retryAfter}s before trying again.`,
          retryAfterSeconds: retryAfter,
        },
        { status: 429, headers: { "Retry-After": String(retryAfter) } },
      );
    }

    const result = await runLaunchReadinessAlertTestSend({ to });
    const ok = result.action === "test_sent";

    await prisma.auditLog
      .create({
        data: {
          actorId: userId,
          action: "launch.readiness.alert.test_sent",
          metadata: {
            ok,
            to,
            currentVerdict: result.current,
            delivered: result.delivered,
            failed: result.failed,
            error: ok ? null : (result.error ?? null),
            timestamp: new Date().toISOString(),
          },
        },
      })
      .catch((err) => {
        console.warn(
          "[launch-readiness-alert] failed to write test_sent audit row:",
          err instanceof Error ? err.message : err,
        );
      });

    return NextResponse.json(
      {
        ok,
        data: {
          to,
          currentVerdict: result.current,
          delivered: result.delivered,
          failed: result.failed,
          timestamp: new Date().toISOString(),
        },
        ...(ok ? {} : { error: result.error ?? "Send failed" }),
      },
      { status: 200 },
    );
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number };
    return NextResponse.json(
      { ok: false, error: err.message ?? "Internal error" },
      { status: err.status ?? 500 },
    );
  }
}
