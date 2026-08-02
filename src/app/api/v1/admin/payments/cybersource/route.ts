import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import { requireAdminRoles } from "@/server/auth/adminGuard";
import { isEncryptionAvailable } from "@/server/security/encryption";
import {
  PROVIDER_CYBERSOURCE,
  buildCybersourceUpdate,
  getOrInitCybersourceCredential,
  toSafeCybersourceView,
} from "@/server/payments/cybersourceCredentialService";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireAdminRoles(req, ["SUPERADMIN"]);
    const cred = await getOrInitCybersourceCredential();
    return NextResponse.json({
      ok: true,
      data: {
        encryptionAvailable: isEncryptionAvailable(),
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

const ClearOrSecret = z.union([z.string(), z.object({ clear: z.literal(true) })]);

const PatchBody = z
  .object({
    enabled: z.boolean().optional(),
    environment: z.enum(["test", "production"]).optional(),
    merchantId: ClearOrSecret.optional(),
    keyId: ClearOrSecret.optional(),
    sharedSecret: ClearOrSecret.optional(),
    organizationId: ClearOrSecret.optional(),
    portfolioId: ClearOrSecret.optional(),
    checkoutTitle: z.string().min(1).max(80).optional(),
    checkoutDescription: z.string().max(240).optional(),
    acceptedCardLogos: z.array(z.string()).max(20).optional(),
    cardSecurityCodeEnabled: z.boolean().optional(),
    detailedDeclineMessagesEnabled: z.boolean().optional(),
    debugMode: z.enum(["OFF", "ERRORS_ONLY", "VERBOSE"]).optional(),
  })
  .strict();

export async function PATCH(req: Request) {
  try {
    const { userId } = await requireAdminRoles(req, ["SUPERADMIN"]);

    if (!isEncryptionAvailable()) {
      return NextResponse.json(
        {
          ok: false,
          error: "Credential editing unavailable. APP_ENCRYPTION_KEY is missing.",
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

    const prev = await getOrInitCybersourceCredential();

    // If enabling, require credentials are saved AFTER this PATCH applies.
    // Account for `{clear:true}` payloads that would remove an existing value
    // in the same request — those must NOT be allowed to satisfy the gate.
    if (body.enabled === true) {
      const isClear = (v: unknown) =>
        typeof v === "object" && v !== null && (v as any).clear === true;
      const isNewValue = (v: unknown) =>
        typeof v === "string" && v.trim().length > 0;
      const willHave = (
        field: "merchantId" | "keyId" | "sharedSecret",
        prevEnc: string | null
      ) => {
        const incoming = body[field];
        if (incoming === undefined) return !!prevEnc;
        if (isClear(incoming)) return false;
        if (isNewValue(incoming)) return true;
        return !!prevEnc;
      };
      const willHaveMerchantId = willHave("merchantId", prev.merchantIdEncrypted);
      const willHaveKeyId = willHave("keyId", prev.keyIdEncrypted);
      const willHaveSecret = willHave("sharedSecret", prev.sharedSecretEncrypted);
      if (!willHaveMerchantId || !willHaveKeyId || !willHaveSecret) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Cybersource cannot be enabled until Merchant ID, Key ID, and Shared Secret are saved.",
          },
          { status: 400 }
        );
      }
    }

    const { data, auditDiff } = buildCybersourceUpdate(body, prev);

    const updated = await prisma.cybersourceGatewayCredential.update({
      where: { provider: PROVIDER_CYBERSOURCE },
      data: { ...data, updatedById: userId },
    });

    try {
      await prisma.auditLog.create({
        data: {
          actorId: userId,
          action: "payment.gateway.cybersource.update",
          metadata: auditDiff as any,
        },
      });
    } catch {
      // Non-fatal — credential update must not be blocked by audit log failure.
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
