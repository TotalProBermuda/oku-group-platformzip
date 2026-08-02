import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminRoles } from "@/server/auth/adminGuard";
import { authenticateTest } from "@/server/authorizeNet/client";

export async function POST(req: Request) {
  try {
    const { userId } = await requireAdminRoles(req, ["SUPERADMIN"]);

    const startedAt = new Date();
    try {
      const result = await authenticateTest();
      await prisma.auditLog
        .create({
          data: {
            actorId: userId,
            action: result.ok
              ? "payment.gateway.authnet.test.succeeded"
              : "payment.gateway.authnet.test.failed",
            metadata: {
              ok: result.ok,
              env: result.env,
              source: result.source,
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
          source: result.source,
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
            action: "payment.gateway.authnet.test.failed",
            metadata: { error: message, timestamp: new Date().toISOString() },
          },
        })
        .catch(() => {});
      return NextResponse.json(
        {
          ok: false,
          error: message,
          data: { gatewayOk: false, timestamp: new Date().toISOString() },
        },
        { status: 200 }
      );
    }
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e.message },
      { status: e.status || 500 }
    );
  }
}
