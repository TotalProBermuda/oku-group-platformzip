import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdminRoles } from "@/server/auth/adminGuard";
import {
  getActiveCheckoutGateway,
  setActiveCheckoutGateway,
} from "@/server/payments/activeGateway";

export async function GET(req: Request) {
  try {
    await requireAdminRoles(req, ["SUPERADMIN"]);
    const snap = await getActiveCheckoutGateway();
    return NextResponse.json({ ok: true, data: snap });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e.message },
      { status: e.status || 500 },
    );
  }
}

const PatchBody = z.object({
  active: z.enum(["AUTHORIZE_NET", "CYBERSOURCE"]),
  // Required when target environment is production AND it is being changed,
  // to avoid an accidental flip on a live site (see also `productionConfirmAcknowledged`).
  confirm: z.boolean().optional(),
  // P5a — explicit user acknowledgement that the modal checkbox was ticked.
  // Required when the target provider's effective environment is production
  // (regardless of NODE_ENV — guards against switching a live tenant).
  productionConfirmAcknowledged: z.boolean().optional(),
});

/**
 * Strict allowlist for AuditLog metadata so credential bytes can never leak
 * through this route. Anything not on this list is dropped before persistence.
 */
function buildAuditMetadata(
  raw: Record<string, unknown>,
): Prisma.InputJsonValue {
  const allow = new Set([
    "before",
    "after",
    "attempted",
    "environment",
    "productionConfirmAcknowledged",
    "ready",
    "blockers",
    "reason",
    "timestamp",
  ]);
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(raw)) {
    if (allow.has(k)) out[k] = raw[k];
  }
  return out as Prisma.InputJsonValue;
}

export async function PATCH(req: Request) {
  try {
    const { userId } = await requireAdminRoles(req, ["SUPERADMIN"]);

    let body: z.infer<typeof PatchBody>;
    try {
      body = PatchBody.parse(await req.json());
    } catch {
      return NextResponse.json(
        { ok: false, error: "Invalid request body" },
        { status: 400 },
      );
    }

    const before = await getActiveCheckoutGateway();
    if (before.active === body.active) {
      return NextResponse.json({ ok: true, data: before });
    }

    // Per-provider readiness check (Payments P5/P5a). Reject + audit if not ready.
    const target = before.providers[body.active];
    const targetEnv = target.environment;
    if (!target.selectable) {
      const reason =
        target.lockedReason ??
        target.blockers[0] ??
        `${target.label} is not ready for activation`;
      await prisma.auditLog
        .create({
          data: {
            actorId: userId,
            action: "payment.gateway.active.changed.rejected",
            metadata: buildAuditMetadata({
              before: before.active,
              after: body.active,
              attempted: body.active,
              environment: targetEnv,
              reason,
              blockers: target.blockers,
              timestamp: new Date().toISOString(),
            }),
          },
        })
        .catch(() => {});
      return NextResponse.json({ ok: false, error: reason }, { status: 400 });
    }

    // Production guard 1: NODE_ENV=production switches still require confirm:true.
    if (process.env.NODE_ENV === "production" && !body.confirm) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Production switch requires explicit confirmation. Re-send with confirm:true.",
        },
        { status: 400 },
      );
    }

    // Production guard 2 (P5a): activating into a provider whose own
    // environment is "production" requires the explicit modal checkbox
    // acknowledgement, even in dev/staging — guards against switching a tenant
    // whose Cybersource credential is pointed at the live endpoint.
    if (targetEnv === "production" && !body.productionConfirmAcknowledged) {
      return NextResponse.json(
        {
          ok: false,
          error:
            `Activating ${target.label} in production requires acknowledging the production-routing checkbox.`,
        },
        { status: 400 },
      );
    }

    const snap = await setActiveCheckoutGateway(body.active);
    await prisma.auditLog
      .create({
        data: {
          actorId: userId,
          action: "payment.gateway.active.changed",
          metadata: buildAuditMetadata({
            before: before.active,
            after: snap.active,
            environment: snap.activeEnvironment,
            productionConfirmAcknowledged:
              body.productionConfirmAcknowledged === true,
            ready: snap.ready,
            blockers: snap.blockers,
            timestamp: new Date().toISOString(),
          }),
        },
      })
      .catch(() => {});

    return NextResponse.json({ ok: true, data: snap });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e.message },
      { status: e.status || 500 },
    );
  }
}
