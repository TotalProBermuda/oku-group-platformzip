import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";
import {
  getReferralActorById,
  updateReferralActor,
} from "@/server/referrals/referralActorService";
import { ReferralActorStatus } from "@prisma/client";
import { z } from "zod/v3";

const UpdateBody = z.object({
  displayName: z.string().trim().min(1).optional(),
  organizationName: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  whatsapp: z.string().optional(),
  status: z.nativeEnum(ReferralActorStatus).optional(),
  metadataJson: z.record(z.unknown()).optional(),
}).strict();

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { roles } = await requireSession();
    requirePermission(roles, "admin:audit:read");

    const actor = await getReferralActorById(id);
    if (!actor) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    return NextResponse.json({ ok: true, actor });
  } catch (e: unknown) {
    const status = typeof e === "object" && e !== null && "status" in e && typeof e.status === "number" ? e.status : 500;
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Internal error" }, { status });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { roles } = await requireSession();
    requirePermission(roles, "admin:audit:read");

    const parsed = UpdateBody.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid referral actor update" }, { status: 400 });
    const actor = await updateReferralActor(id, parsed.data);
    return NextResponse.json({ ok: true, actor });
  } catch (e: unknown) {
    const status = typeof e === "object" && e !== null && "status" in e && typeof e.status === "number" ? e.status : 500;
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Internal error" }, { status });
  }
}
