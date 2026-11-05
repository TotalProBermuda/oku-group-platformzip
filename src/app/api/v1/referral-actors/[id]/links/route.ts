import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";
import { generateReferralLink, getActorLinks, deactivateLink } from "@/server/referrals/referralLinkService";
import { z } from "zod/v3";

const CreateLinkBody = z.object({
  referralAssignmentId: z.string().optional(),
  pathHint: z.string().optional(),
}).strict();
const DeleteLinkBody = z.object({ linkId: z.string().min(1) }).strict();

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { roles } = await requireSession();
    requirePermission(roles, "admin:audit:read");

    const links = await getActorLinks(id);
    return NextResponse.json({ ok: true, links });
  } catch (e: unknown) {
    const status = typeof e === "object" && e !== null && "status" in e && typeof e.status === "number" ? e.status : 500;
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Internal error" }, { status });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { roles } = await requireSession();
    requirePermission(roles, "admin:audit:read");

    const parsed = CreateLinkBody.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid referral link" }, { status: 400 });
    const { referralAssignmentId, pathHint } = parsed.data;

    const link = await generateReferralLink({
      referralActorId: id,
      referralAssignmentId,
      pathHint,
    });

    return NextResponse.json({ ok: true, link }, { status: 201 });
  } catch (e: unknown) {
    const status = typeof e === "object" && e !== null && "status" in e && typeof e.status === "number" ? e.status : 500;
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Internal error" }, { status });
  }
}

export async function DELETE(req: NextRequest, { params: _ }: { params: Promise<{ id: string }> }) {
  try {
    const { roles } = await requireSession();
    requirePermission(roles, "admin:audit:read");

    const parsed = DeleteLinkBody.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ ok: false, error: "linkId is required" }, { status: 400 });

    await deactivateLink(parsed.data.linkId);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const status = typeof e === "object" && e !== null && "status" in e && typeof e.status === "number" ? e.status : 500;
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Internal error" }, { status });
  }
}
