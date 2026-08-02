import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminRoles } from "@/server/auth/adminGuard";
import { testCybersourceConnection } from "@/server/cybersource/client";
import {
  PROVIDER_CYBERSOURCE,
  toSafeCybersourceView,
  getOrInitCybersourceCredential,
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
    try {
      await prisma.cybersourceGatewayCredential.update({
        where: { provider: PROVIDER_CYBERSOURCE },
        data: {
          lastTestStatus: result.ok ? "passed" : "failed",
          lastTestMessage: result.message.slice(0, 500),
          lastTestedAt: now,
        },
      });
    } catch {
      // ignore — record may not exist if init failed
    }

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

    const cred = await getOrInitCybersourceCredential();
    return NextResponse.json({
      ok: true,
      data: {
        gatewayOk: result.ok,
        environment: result.env,
        httpStatus: result.status,
        message: result.message,
        timestamp: now.toISOString(),
        gateway: toSafeCybersourceView(cred),
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e.message },
      { status: e.status || 500 }
    );
  }
}
