import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminRoles } from "@/server/auth/adminGuard";
import { testCybersourceConnection } from "@/server/cybersource/client";
import {
  PROVIDER_CYBERSOURCE,
  toSafeCybersourceView,
} from "@/server/payments/cybersourceCredentialService";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { userId } = await requireAdminRoles(req, ["SUPERADMIN"]);

    let result;
    try {
      result = await testCybersourceConnection();
    } catch (e: any) {
      result = {
        ok: false,
        env: "test" as const,
        status: null,
        message: e?.message || "Cybersource is not configured.",
      };
    }

    const now = new Date();

    // Persist the test result before returning.
    //
    // Use upsert so the write succeeds even if the row was never initialised
    // (e.g. if the settings form GET has never been called for this environment).
    // A successful response MUST only be returned after lastTestStatus /
    // lastTestedAt / lastTestMessage are committed — the readiness banner and
    // card badge both read DB state, so a transient live result that is not
    // persisted creates a visible contradiction that does not resolve on reload.
    let persistedCred;
    try {
      persistedCred = await prisma.cybersourceGatewayCredential.upsert({
        where: { provider: PROVIDER_CYBERSOURCE },
        update: {
          lastTestStatus: result.ok ? "passed" : "failed",
          lastTestMessage: result.message.slice(0, 500),
          lastTestedAt: now,
        },
        create: {
          provider: PROVIDER_CYBERSOURCE,
          lastTestStatus: result.ok ? "passed" : "failed",
          lastTestMessage: result.message.slice(0, 500),
          lastTestedAt: now,
        },
      });
    } catch (persistErr: any) {
      // Audit the live probe outcome even though the test state cannot be saved.
      try {
        await prisma.auditLog.create({
          data: {
            actorId: userId,
            action: "payment.gateway.cybersource.test.persistence_failed",
            metadata: {
              provider: PROVIDER_CYBERSOURCE,
              environment: result.env,
              httpStatus: result.status,
              liveOk: result.ok,
              message: result.message.slice(0, 500),
              persistenceError: persistErr?.message ?? "unknown",
              timestamp: now.toISOString(),
            },
          },
        });
      } catch {
        // non-fatal
      }
      return NextResponse.json(
        {
          ok: false,
          error: "persistence_failed",
          data: {
            gatewayOk: result.ok,
            environment: result.env,
            httpStatus: result.status,
            message: result.message,
            timestamp: now.toISOString(),
            persistenceFailed: true,
          },
        },
        { status: 500 }
      );
    }

    // Audit the persisted result (non-fatal — credential write must not be
    // rolled back if the audit log is temporarily unavailable).
    try {
      await prisma.auditLog.create({
        data: {
          actorId: userId,
          action: result.ok
            ? "payment.gateway.cybersource.test.succeeded"
            : "payment.gateway.cybersource.test.failed",
          metadata: {
            provider: PROVIDER_CYBERSOURCE,
            environment: result.env,
            httpStatus: result.status,
            message: result.message.slice(0, 500),
            timestamp: now.toISOString(),
          },
        },
      });
    } catch {
      // non-fatal
    }

    // Build the response from the upserted row so gateway.lastTest.status
    // always matches what is in the DB — never a stale pre-write snapshot.
    return NextResponse.json({
      ok: true,
      data: {
        gatewayOk: result.ok,
        environment: result.env,
        httpStatus: result.status,
        message: result.message,
        timestamp: now.toISOString(),
        gateway: toSafeCybersourceView(persistedCred),
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e.message },
      { status: e.status || 500 }
    );
  }
}
