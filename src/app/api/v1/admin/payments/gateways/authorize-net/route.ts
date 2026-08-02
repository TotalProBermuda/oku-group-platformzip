import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdminRoles } from "@/server/auth/adminGuard";
import { isEncryptionAvailable } from "@/server/security/encryption";
import {
  PROVIDER_AUTHORIZE_NET,
  buildAuthNetUpdate,
  getOrInitAuthNetCredential,
  toSafeView,
} from "@/server/payments/gatewayCredentialService";

// Each credential field accepts: omitted (keep), "" (keep), non-empty (set), { clear: true } (wipe).
const ClearOrSecret = z.union([
  z.string(),
  z.object({ clear: z.literal(true) }),
]);

const PatchBody = z
  .object({
    enableGateway: z.boolean().optional(),
    environment: z.enum(["sandbox", "production"]).optional(),
    connectionType: z.enum(["gateway_only", "all_in_one"]).optional(),
    apiLoginId: ClearOrSecret.optional(),
    transactionKey: ClearOrSecret.optional(),
    signatureKey: ClearOrSecret.optional(),
    merchantProviderName: z.string().nullable().optional(),
    merchantId: ClearOrSecret.optional(),
    terminalId: ClearOrSecret.optional(),
    checkoutTitle: z.string().min(1).max(120).optional(),
    checkoutDescription: z.string().max(500).optional(),
    displayCsc: z.boolean().optional(),
    transactionType: z.enum(["charge", "authorize_only"]).optional(),
    detailedDeclines: z.boolean().optional(),
    debugMode: z.enum(["off", "errors", "verbose"]).optional(),
    acceptedCardLogos: z.array(z.string()).max(20).optional(),
  })
  .strict();

export async function PATCH(req: Request) {
  try {
    const { userId } = await requireAdminRoles(req, ["SUPERADMIN"]);

    if (!isEncryptionAvailable()) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Credential editing unavailable. APP_ENCRYPTION_KEY is missing.",
        },
        { status: 400 }
      );
    }

    let body: z.infer<typeof PatchBody>;
    try {
      body = PatchBody.parse(await req.json());
    } catch (err) {
      const message =
        err instanceof z.ZodError
          ? err.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ")
          : "Invalid request body";
      return NextResponse.json({ ok: false, error: message }, { status: 400 });
    }

    const prev = await getOrInitAuthNetCredential();
    const { data, auditDiff } = buildAuthNetUpdate(body, prev);

    const updated = await prisma.paymentGatewayCredential.update({
      where: { provider: PROVIDER_AUTHORIZE_NET },
      data: { ...data, updatedById: userId },
    });

    if (Object.keys(auditDiff).length > 0) {
      await prisma.auditLog
        .create({
          data: {
            actorId: userId,
            action: "payment.gateway.authnet.update",
            metadata: {
              provider: PROVIDER_AUTHORIZE_NET,
              changes: auditDiff,
              timestamp: new Date().toISOString(),
            },
          },
        })
        .catch(() => {});
    }

    return NextResponse.json({ ok: true, data: toSafeView(updated) });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e.message },
      { status: e.status || 500 }
    );
  }
}
