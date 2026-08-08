import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/server/auth/session";
import { authenticateTest } from "@/server/authorizeNet/client";
import { getResendClient } from "@/server/invitation/resend";
import { prisma } from "@/lib/prisma";
import { decryptSecret, isEncryptionAvailable } from "@/server/security/encryption";
import { getLaunchReadiness } from "@/server/launchReadiness/getLaunchReadiness";

function requireSuperadmin(roles: string[]) {
  if (!roles.includes("SUPERADMIN")) {
    const e = new Error("Forbidden") as Error & { status: number };
    e.status = 403;
    throw e;
  }
}

function envPresent(name: string): boolean {
  const v = process.env[name];
  return typeof v === "string" && v.length > 0;
}

async function getRecentPaymentAudits(): Promise<
  Array<{
    id: string;
    action: string;
    createdAt: string;
    orderId: string | null;
    amountCents: number | null;
    gatewayMessage: string | null;
    actor: { id: string; name: string | null; email: string | null } | null;
    activeGatewayChange: { before: string | null; after: string | null; reason: string | null } | null;
  }>
> {
  type AuditRow = {
    id: string;
    actorId: string;
    action: string;
    metadata: unknown;
    createdAt: Date;
  };
  const rows: AuditRow[] = await prisma.auditLog
    .findMany({
      where: {
        action: {
          in: [
            "order.refund.succeeded",
            "order.refund.failed",
            "order.void.succeeded",
            "order.void.failed",
            "payment.gateway.authnet.update",
            "payment.gateway.authnet.test.succeeded",
            "payment.gateway.authnet.test.failed",
            "payment.gateway.active.changed",
            "payment.gateway.active.changed.rejected",
          ],
        },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    })
    .catch((): AuditRow[] => []);

  const actorIds = Array.from(
    new Set(rows.map((r) => r.actorId).filter((v): v is string => typeof v === "string" && v.length > 0)),
  );
  const actorRows = actorIds.length
    ? await prisma.user
        .findMany({
          where: { id: { in: actorIds } },
          select: { id: true, name: true, email: true },
        })
        .catch(() => [] as Array<{ id: string; name: string | null; email: string | null }>)
    : [];
  const actorMap = new Map(actorRows.map((u) => [u.id, u]));

  return rows.map((r) => {
    const m = (r.metadata ?? {}) as Record<string, unknown>;
    const isActiveChange =
      r.action === "payment.gateway.active.changed" ||
      r.action === "payment.gateway.active.changed.rejected";
    return {
      id: r.id,
      action: r.action,
      createdAt: r.createdAt.toISOString(),
      orderId: (m.orderId as string | null) ?? null,
      amountCents: typeof m.amountCents === "number" ? (m.amountCents as number) : null,
      gatewayMessage:
        (m.gatewayErrorMessage as string | null) ??
        (m.message as string | null) ??
        (typeof m.gatewayVoidTransId === "string"
          ? `void txid: ${m.gatewayVoidTransId}`
          : typeof m.gatewayRefundTransId === "string"
          ? `refund txid: ${m.gatewayRefundTransId}`
          : null),
      actor: actorMap.get(r.actorId) ?? null,
      activeGatewayChange: isActiveChange
        ? {
            before: typeof m.before === "string" ? (m.before as string) : null,
            after:
              typeof m.after === "string"
                ? (m.after as string)
                : typeof m.attempted === "string"
                ? (m.attempted as string)
                : null,
            reason: typeof m.reason === "string" ? (m.reason as string) : null,
          }
        : null,
    };
  });
}

async function getLastTestResults(): Promise<{
  authNet: { ok: boolean | null; message: string | null; timestamp: string | null };
  email: { ok: boolean | null; message: string | null; timestamp: string | null; to: string | null };
}> {
  const [authNetLog, emailLog] = await Promise.all([
    prisma.auditLog
      .findFirst({
        where: { action: { in: ["launch.readiness.authnet_test", "launch.readiness.authnet_test.failed"] } },
        orderBy: { createdAt: "desc" },
      })
      .catch(() => null),
    prisma.auditLog
      .findFirst({
        where: { action: { in: ["launch.readiness.email_test", "launch.readiness.email_test.failed"] } },
        orderBy: { createdAt: "desc" },
      })
      .catch(() => null),
  ]);

  const a = (authNetLog?.metadata ?? null) as Record<string, unknown> | null;
  const e = (emailLog?.metadata ?? null) as Record<string, unknown> | null;
  return {
    authNet: {
      ok: a ? Boolean(a.ok) : null,
      message: a ? ((a.message as string | null) ?? (a.error as string | null) ?? null) : null,
      timestamp: authNetLog?.createdAt?.toISOString() ?? null,
    },
    email: {
      ok: e ? Boolean(e.ok) : null,
      message: e ? ((e.error as string | null) ?? (e.ok ? "Sent" : null)) : null,
      timestamp: emailLog?.createdAt?.toISOString() ?? null,
      to: e ? ((e.to as string | null) ?? null) : null,
    },
  };
}

/**
 * Projects the legacy JSON shape FROM the shared readiness snapshot. The
 * snapshot is the canonical source for env / payments / email gate state;
 * this function only adds the legacy-only fields (recent audits, last-test
 * results, refund/ticketing route metadata, ticket count) that the existing
 * `/admin/payments` UI consumes.
 */
async function buildStatus(snapshot: Awaited<ReturnType<typeof getLaunchReadiness>>) {
  const activeGateway = snapshot.activeGateway;
  const envAuthNetEnv = (process.env.AUTHORIZE_NET_ENV || "sandbox").toLowerCase();
  const [ticketCount, lastTests, recentPaymentAudits, dbCred] =
    await Promise.all([
      prisma.ticket.count().catch(() => null),
      getLastTestResults(),
      getRecentPaymentAudits(),
      prisma.paymentGatewayCredential
        .findUnique({ where: { provider: "AUTHORIZE_NET" } })
        .catch(() => null),
    ]);
  // Derived from the snapshot — env presence and resend resolvability are
  // computed once in the shared service, never recomputed here.
  const gateByName = new Map(snapshot.gates.map((g) => [g.name, g]));
  const gatePass = (name: string): boolean =>
    gateByName.get(name)?.status === "pass";
  const resendUsable = gatePass("email.resend_configured");

  // Credential presence: DB-stored encrypted credential takes precedence over
  // env vars. We require not just presence but decryptability — otherwise a
  // rotated APP_ENCRYPTION_KEY would make the UI claim "configured" while
  // runtime silently falls back to env.
  let dbCredUsable = false;
  if (
    !!dbCred &&
    dbCred.isActive &&
    dbCred.enableGateway &&
    !!dbCred.apiLoginIdEncrypted &&
    !!dbCred.transactionKeyEncrypted &&
    isEncryptionAvailable()
  ) {
    try {
      decryptSecret(dbCred.apiLoginIdEncrypted);
      decryptSecret(dbCred.transactionKeyEncrypted);
      dbCredUsable = true;
    } catch {
      dbCredUsable = false;
    }
  }
  const apiLoginIdConfigured = dbCredUsable || envPresent("AUTHORIZE_NET_API_LOGIN_ID");
  const transactionKeyConfigured =
    dbCredUsable || envPresent("AUTHORIZE_NET_TRANSACTION_KEY");
  const effectiveEnv = dbCredUsable
    ? dbCred!.environment === "production"
      ? "production"
      : "sandbox"
    : envAuthNetEnv === "production"
    ? "production"
    : "sandbox";

  // Payments P5a — readiness banner blockers must reflect ONLY the active
  // checkout provider. Authorize.net env-var presence is no longer a top-level
  // blocker when Cybersource is active. Inactive provider status is still
  // exposed under `payments.providers` for the System Checks tab.
  const activeProviderBlockers = activeGateway?.blockers ?? [];
  const providerSummaries = activeGateway
    ? {
        authNet: {
          configured: activeGateway.providers.AUTHORIZE_NET.configured,
          environment: activeGateway.providers.AUTHORIZE_NET.environment,
          source: activeGateway.providers.AUTHORIZE_NET.source,
          selectable: activeGateway.providers.AUTHORIZE_NET.selectable,
          blockers: activeGateway.providers.AUTHORIZE_NET.blockers,
          lastTest: activeGateway.providers.AUTHORIZE_NET.lastTest,
        },
        cybersource: {
          configured: activeGateway.providers.CYBERSOURCE.configured,
          environment: activeGateway.providers.CYBERSOURCE.environment,
          source: activeGateway.providers.CYBERSOURCE.source,
          selectable: activeGateway.providers.CYBERSOURCE.selectable,
          blockers: activeGateway.providers.CYBERSOURCE.blockers,
          lastTest: activeGateway.providers.CYBERSOURCE.lastTest,
        },
      }
    : null;

  return {
    payments: {
      // Legacy keys — preserved for older callers; readiness banner reads
      // `activeProviderBlockers` instead.
      apiLoginIdConfigured,
      transactionKeyConfigured,
      envConfigured: envPresent("AUTHORIZE_NET_ENV"),
      mode: effectiveEnv,
      isProduction: effectiveEnv === "production",
      credentialSource: dbCredUsable ? "db" : apiLoginIdConfigured ? "env" : null,
      // P5a — active-gateway-aware blockers + per-provider visibility.
      activeProviderBlockers,
      providers: providerSummaries,
    },
    activeGateway,
    email: {
      resendApiKeyConfigured: resendUsable,
      fromEmailConfigured: envPresent("RESEND_FROM_EMAIL"),
    },
    lastTests,
    recentPaymentAudits,
    refunds: {
      routePath: "/api/v1/admin/orders/refund",
      voidRoutePath: "/api/v1/admin/orders/{id}/cancel",
      gatewayFirstEnforced: true,
      partialRefundsSupported: true,
      partialRefundOrderStatus: "PARTIALLY_REFUNDED",
    },
    ticketingRoutes: {
      attendeesPage: "/admin/experiences/[id]/attendees",
      staffCheckInPage: "/staff/check-in",
      validateRoute: "/api/v1/checkin/validate",
      manualCheckInRoute: "/api/v1/checkin/manual",
      hostScanRoute: "/api/v1/host/scan",
      resendConfirmationRoute: "/api/v1/admin/orders/{id}/resend-confirmation",
    },
    auth: {
      nextAuthSecretConfigured: gatePass("auth.nextauth_secret"),
      nextAuthUrlConfigured: gatePass("auth.nextauth_url"),
      publicAppUrlConfigured: gatePass("auth.public_app_url"),
    },
    runtime: {
      redisConfigured: envPresent("REDIS_URL"),
      databaseUrlConfigured: gatePass("environment.database_url"),
      nodeEnv: process.env.NODE_ENV ?? "development",
    },
    flags: {
      demoModeEnabled: !gatePass("flags.demo_mode_disabled"),
    },
    ticketing: {
      ticketModelReachable: ticketCount !== null,
      ticketCount: ticketCount ?? 0,
      checkInRoute: "/api/v1/checkin/validate",
      scannerPage: "/admin/experiences/[id]/attendees",
      resendConfirmationRoute: "/api/v1/admin/orders/{id}/resend-confirmation",
      rfid: { configured: false, note: "Future module / Not configured" },
    },
  };
}

export async function GET() {
  try {
    const { roles } = await requireSession();
    requireSuperadmin(roles);
    const readiness = await getLaunchReadiness();
    const status = await buildStatus(readiness);
    return NextResponse.json({ ok: true, data: { ...status, readiness } });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e.message },
      { status: e.status || 500 }
    );
  }
}

const ActionBody = z.discriminatedUnion("action", [
  z.object({ action: z.literal("test-authnet") }),
  z.object({
    action: z.literal("send-test-email"),
    to: z.string().email().optional(),
  }),
]);

export async function POST(req: Request) {
  try {
    const { userId, roles, session } = await requireSession();
    requireSuperadmin(roles);

    let body: z.infer<typeof ActionBody>;
    try {
      body = ActionBody.parse(await req.json());
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid request body" }, { status: 400 });
    }

    if (body.action === "test-authnet") {
      const startedAt = new Date();
      try {
        const result = await authenticateTest();
        await prisma.auditLog
          .create({
            data: {
              actorId: userId,
              action: "launch.readiness.authnet_test",
              metadata: {
                ok: result.ok,
                env: result.env,
                resultCode: result.resultCode,
                message: result.message,
                startedAt: startedAt.toISOString(),
                finishedAt: new Date().toISOString(),
              },
            },
          })
          .catch(() => {});
        return NextResponse.json({
          ok: true,
          data: {
            gatewayOk: result.ok,
            env: result.env,
            resultCode: result.resultCode,
            message: result.message,
            timestamp: new Date().toISOString(),
          },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await prisma.auditLog
          .create({
            data: {
              actorId: userId,
              action: "launch.readiness.authnet_test.failed",
              metadata: { error: message, timestamp: new Date().toISOString() },
            },
          })
          .catch(() => {});
        return NextResponse.json(
          { ok: false, error: message, data: { gatewayOk: false, timestamp: new Date().toISOString() } },
          { status: 200 } // surface in UI rather than throwing
        );
      }
    }

    if (body.action === "send-test-email") {
      const to = body.to ?? session.user?.email;
      if (!to) {
        return NextResponse.json(
          { ok: false, error: "No recipient email available" },
          { status: 400 }
        );
      }
      try {
        const { client, fromEmail } = await getResendClient();
        const sent = await client.emails.send({
          from: fromEmail,
          to,
          subject: "OKÜ — Launch Readiness Test Email",
          text:
            "This is a test email sent from the OKÜ Launch Readiness Control Center. " +
            "If you received this, Resend is configured correctly.\n\n" +
            `Sent at: ${new Date().toISOString()}`,
        });
        const errorMessage = (sent as { error?: { message?: string } | null })?.error?.message ?? null;
        const ok = !errorMessage;
        await prisma.auditLog
          .create({
            data: {
              actorId: userId,
              action: "launch.readiness.email_test",
              metadata: {
                ok,
                to,
                fromEmail,
                error: errorMessage,
                timestamp: new Date().toISOString(),
              },
            },
          })
          .catch(() => {});
        return NextResponse.json({
          ok,
          data: { to, fromEmail, error: errorMessage, timestamp: new Date().toISOString() },
          ...(errorMessage ? { error: errorMessage } : {}),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await prisma.auditLog
          .create({
            data: {
              actorId: userId,
              action: "launch.readiness.email_test.failed",
              metadata: { error: message, to, timestamp: new Date().toISOString() },
            },
          })
          .catch(() => {});
        return NextResponse.json(
          { ok: false, error: message, data: { to, timestamp: new Date().toISOString() } },
          { status: 200 }
        );
      }
    }

    return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e.message },
      { status: e.status || 500 }
    );
  }
}
