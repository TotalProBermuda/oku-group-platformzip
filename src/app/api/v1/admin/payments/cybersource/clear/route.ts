import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminRoles } from "@/server/auth/adminGuard";
import {
  PROVIDER_CYBERSOURCE,
  toSafeCybersourceView,
} from "@/server/payments/cybersourceCredentialService";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { userId } = await requireAdminRoles(req, ["SUPERADMIN"]);

    const updated = await prisma.cybersourceGatewayCredential.update({
      where: { provider: PROVIDER_CYBERSOURCE },
      data: {
        enabled: false,
        merchantIdEncrypted: null,
        keyIdEncrypted: null,
        sharedSecretEncrypted: null,
        organizationIdEncrypted: null,
        portfolioIdEncrypted: null,
        merchantIdLast4: null,
        keyIdLast4: null,
        sharedSecretLast4: null,
        organizationIdLast4: null,
        portfolioIdLast4: null,
        lastTestStatus: null,
        lastTestMessage: null,
        lastTestedAt: null,
        updatedById: userId,
      },
    });

    try {
      await prisma.auditLog.create({
        data: {
          actorId: userId,
          action: "payment.gateway.cybersource.clear",
          metadata: {
            provider: PROVIDER_CYBERSOURCE,
            merchantIdChanged: true,
            keyIdChanged: true,
            sharedSecretChanged: true,
            organizationIdChanged: true,
            portfolioIdChanged: true,
            enabledAfter: false,
          },
        },
      });
    } catch {
      // non-fatal
    }

    return NextResponse.json({
      ok: true,
      data: { gateway: toSafeCybersourceView(updated) },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e.message },
      { status: e.status || 500 }
    );
  }
}
