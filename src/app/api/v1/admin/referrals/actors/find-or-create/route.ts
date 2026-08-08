import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/server/auth/session";
import { prisma } from "@/lib/prisma";
import { ReferralActorType } from "@prisma/client";
import {
  findOrLinkReferralActor,
} from "@/server/referrals/referralActorDedupeService";

const ADMIN_ROLES = new Set(["SUPERADMIN", "ADMIN_FINANCE"]);

const Body = z.object({
  actorType: z.nativeEnum(ReferralActorType),
  displayName: z.string().min(1).max(120),
  organizationName: z.string().max(120).optional().nullable(),
  email: z.string().email().optional().nullable(),
  phone: z.string().max(40).optional().nullable(),
  whatsapp: z.string().max(40).optional().nullable(),
  userId: z.string().optional().nullable(),
});

/**
 * POST /api/v1/admin/referrals/actors/find-or-create
 *
 * De-duplicates: returns the existing ReferralActor when an inviter (admin
 * or partner) tries to add a person who is already in the system. This
 * prevents two sibling actors when two operators independently invite the
 * same taxi driver.
 *
 * Returns `{ ok, status, matchField, actor }`. Audited.
 *
 * Convention: HTTP 409 is reserved exclusively for cross-user identity
 * conflicts (`merge_required`). Same-user idempotent matches always
 * return HTTP 200 — the call is a no-op, not an error.
 */
export async function POST(req: Request) {
  let userId: string;
  let roles: string[];
  try {
    ({ userId, roles } = await requireSession());
  } catch (e) {
    const status = (e as { status?: number }).status ?? 401;
    return NextResponse.json({ error: "Unauthorized" }, { status });
  }

  if (!roles.some((r) => ADMIN_ROLES.has(r))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
  }

  if (!parsed.data.email && !parsed.data.phone && !parsed.data.whatsapp && !parsed.data.userId) {
    return NextResponse.json(
      { error: "At least one of email, phone, whatsapp, or userId must be provided." },
      { status: 400 },
    );
  }

  const result = await findOrLinkReferralActor(
    {
      actorType: parsed.data.actorType,
      displayName: parsed.data.displayName,
      organizationName: parsed.data.organizationName,
      email: parsed.data.email ?? undefined,
      phone: parsed.data.phone ?? undefined,
      whatsapp: parsed.data.whatsapp ?? undefined,
      userId: parsed.data.userId ?? undefined,
      initiatedByUserId: userId,
    },
    { isProvisioningCall: true },
  );

  // Convention: merge_required = cross-user identity conflict → 409.
  // Same-user idempotent matches (found_existing_linked etc.) → 200.
  if (result.status === "merge_required") {
    return NextResponse.json(
      {
        ok: false,
        code: "merge_required",
        candidateActorId: result.candidateActorId,
        candidateActorUserId: result.candidateActorUserId ?? null,
        matchField: result.matchField,
      },
      { status: 409 },
    );
  }

  if (result.status === "blocked") {
    return NextResponse.json(
      { ok: false, error: `Actor provisioning blocked: ${result.reason}` },
      { status: 409 },
    );
  }

  const actor = await prisma.referralActor.findUniqueOrThrow({
    where: { id: result.actorId },
  });

  const matched =
    result.status === "found_existing_linked" ||
    result.status === "found_existing_unlinked" ||
    result.status === "linked" ||
    result.status === "reactivated_link";

  return NextResponse.json({
    ok: true,
    // Canonical dedupe status and match signal — additive, existing keys preserved.
    status: result.status,
    matchField: result.matchField,
    // Legacy fields preserved for back-compat.
    matched,
    matchKey: result.matchField,
    actor,
  });
}
