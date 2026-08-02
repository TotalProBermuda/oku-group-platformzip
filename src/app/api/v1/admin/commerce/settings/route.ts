import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import {
  COMMERCE_SETTINGS_ID,
  getCommerceSettings,
} from "@/server/commerce/commerceSettings";

function requireSuperadmin(roles: string[]) {
  if (!roles.includes("SUPERADMIN")) {
    const e = new Error("Forbidden") as Error & { status: number };
    e.status = 403;
    throw e;
  }
}

const optionalStr = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? null : v),
  z.string().max(2000).nullable().optional()
);
const optionalEmail = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? null : v),
  z.string().email().nullable().optional()
);
const emailList = z.array(z.string().email()).max(20).optional();

const PatchBody = z
  .object({
    businessName: optionalStr,
    addressLine1: optionalStr,
    addressLine2: optionalStr,
    city: optionalStr,
    countryRegion: optionalStr,
    currency: z.string().min(3).max(3).optional(),
    timezone: z.string().min(1).max(64).optional(),
    storeStatus: z.enum(["OPEN", "CLOSED", "TEST_MODE"]).optional(),
    capacityManagementEnabled: z.boolean().optional(),
    holdMinutes: z.number().int().min(0).max(240).optional(),
    lowStockThreshold: z.number().int().min(0).max(10000).optional(),
    soldOutThreshold: z.number().int().min(0).max(10000).optional(),
    stockNotificationEmails: emailList,
    hideSoldOutTicketTypes: z.boolean().optional(),
    allowGuestCheckout: z.boolean().optional(),
    requireAccountForMemberships: z.boolean().optional(),
    continueShoppingDestination: z.string().min(1).max(512).optional(),
    emptyCartText: optionalStr,
    checkoutSupportEmail: optionalEmail,
    cancellationPolicyText: optionalStr,
    senderName: optionalStr,
    adminNotificationEmails: emailList,
    debugMode: z.enum(["OFF", "ERRORS_ONLY", "VERBOSE"]).optional(),
  })
  .strict();

export async function GET() {
  try {
    const { roles } = await requireSession();
    requireSuperadmin(roles);
    const settings = await getCommerceSettings();
    return NextResponse.json({ ok: true, data: settings });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e.message },
      { status: e.status || 500 }
    );
  }
}

function diff(prev: Record<string, any>, next: Record<string, any>) {
  const out: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of Object.keys(next)) {
    const a = prev[k];
    const b = next[k];
    if (JSON.stringify(a) !== JSON.stringify(b)) out[k] = { from: a, to: b };
  }
  return out;
}

export async function PATCH(req: Request) {
  try {
    const { userId, roles } = await requireSession();
    requireSuperadmin(roles);

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

    const before = await getCommerceSettings();
    const updated = await prisma.commerceSettings.update({
      where: { id: COMMERCE_SETTINGS_ID },
      data: { ...body, updatedById: userId },
    });

    const changes = diff(before as any, updated as any);
    if (Object.keys(changes).length > 0) {
      await prisma.auditLog
        .create({
          data: {
            actorId: userId,
            action: "commerce.settings.update",
            metadata: {
              changes,
              timestamp: new Date().toISOString(),
            },
          },
        })
        .catch(() => {
          // Non-fatal; the settings change itself succeeded.
        });
    }

    return NextResponse.json({ ok: true, data: updated });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e.message },
      { status: e.status || 500 }
    );
  }
}
