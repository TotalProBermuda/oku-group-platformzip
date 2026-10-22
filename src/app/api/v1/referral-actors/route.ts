import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";
import {
  createReferralActor,
  listReferralActors,
} from "@/server/referrals/referralActorService";
import { ReferralActorType, ReferralActorStatus } from "@prisma/client";
import { z } from "zod";

const CreateBody = z.object({
  actorType: z.nativeEnum(ReferralActorType),
  displayName: z.string().trim().min(1),
  organizationName: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  whatsapp: z.string().optional(),
  userId: z.string().optional(),
  metadataJson: z.record(z.unknown()).optional(),
}).strict();

export async function GET(req: NextRequest) {
  try {
    const { roles } = await requireSession();
    requirePermission(roles, "admin:audit:read");

    const { searchParams } = new URL(req.url);
    const actorTypeValue = searchParams.get("actorType");
    const statusValue = searchParams.get("status");
    const actorType = actorTypeValue ? z.nativeEnum(ReferralActorType).safeParse(actorTypeValue) : null;
    const status = statusValue ? z.nativeEnum(ReferralActorStatus).safeParse(statusValue) : null;
    if (actorType && !actorType.success) return NextResponse.json({ ok: false, error: "Invalid actorType" }, { status: 400 });
    if (status && !status.success) return NextResponse.json({ ok: false, error: "Invalid status" }, { status: 400 });
    const page = parseInt(searchParams.get("page") ?? "1");
    const limit = parseInt(searchParams.get("limit") ?? "50");

    const result = await listReferralActors({ actorType: actorType?.data, status: status?.data, page, limit });
    return NextResponse.json({ ok: true, ...result });
  } catch (e: unknown) {
    const status = typeof e === "object" && e !== null && "status" in e && typeof e.status === "number" ? e.status : 500;
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Internal error" }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { roles } = await requireSession();
    requirePermission(roles, "admin:audit:read");

    const parsed = CreateBody.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid referral actor" }, { status: 400 });
    const { actorType, displayName, organizationName, phone, email, whatsapp, userId, metadataJson } = parsed.data;

    const actor = await createReferralActor({ actorType, displayName, organizationName, phone, email, whatsapp, userId, metadataJson });
    return NextResponse.json({ ok: true, actor }, { status: 201 });
  } catch (e: unknown) {
    const status = typeof e === "object" && e !== null && "status" in e && typeof e.status === "number" ? e.status : 500;
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Internal error" }, { status });
  }
}
