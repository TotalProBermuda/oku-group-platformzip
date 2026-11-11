import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminRoles } from "@/server/auth/adminGuard";

/** PII-minimal linked-record summary used before a recoverable account archive. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminRoles(req, ["SUPERADMIN"]);
    const { id } = await params;
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        roles: { select: { roleKey: true } },
        membership: { select: { tier: true, status: true } },
        referrer: {
          select: {
            referrerType: true,
            referralCode: true,
            isActive: true,
            _count: { select: { attributions: true, commissions: true } },
            referralActor: {
              select: { status: true, _count: { select: { links: true, assignments: true, commissions: true } } },
            },
          },
        },
        beneficiaryProfile: { select: { bankName: true, bankReadinessStatus: true } },
      },
    });
    if (!user) return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
    const [orders, tickets] = await Promise.all([
      prisma.order.count({ where: { userId: id } }),
      prisma.ticket.count({ where: { userId: id } }),
    ]);
    return NextResponse.json({
      ok: true,
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        status: user.status,
        roles: user.roles.map(({ roleKey }) => roleKey),
        orders,
        tickets,
        membership: user.membership,
        referrer: user.referrer ? {
          type: user.referrer.referrerType,
          referralCode: user.referrer.referralCode,
          active: user.referrer.isActive,
          attributions: user.referrer._count.attributions,
          legacyCommissions: user.referrer._count.commissions,
          referralActorStatus: user.referrer.referralActor?.status ?? null,
          links: user.referrer.referralActor?._count.links ?? 0,
          assignments: user.referrer.referralActor?._count.assignments ?? 0,
          actorCommissions: user.referrer.referralActor?._count.commissions ?? 0,
        } : null,
        beneficiary: user.beneficiaryProfile ? {
          bankName: user.beneficiaryProfile.bankName,
          readinessStatus: user.beneficiaryProfile.bankReadinessStatus,
        } : null,
      },
    });
  } catch (e: unknown) {
    const error = e as { message?: string; status?: number };
    return NextResponse.json({ ok: false, error: error.message || "Unable to load account impact." }, { status: error.status || 500 });
  }
}
