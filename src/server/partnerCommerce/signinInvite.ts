import { prisma } from "@/lib/prisma";
import { issuePasswordlessToken, normalizePasswordlessEmail } from "@/server/auth/passwordless";
import { logAdminAction } from "@/lib/adminAudit";

export async function invitePartnerCommerceSeat(input: { seatId: string; invitedByUserId: string }) {
  const seat = await prisma.partnerCommerceSeat.findUnique({ where: { id: input.seatId }, include: { partner: true } });
  if (!seat) throw new Error("Seller draft not found");
  if (seat.status === "REVOKED") throw new Error("Revoked seller drafts cannot be invited");
  const isResend = Boolean(seat.invitedAt);
  const email = normalizePasswordlessEmail(seat.email);
  const user = await prisma.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({ where: { email }, select: { id: true, status: true } });
    if (existing && existing.status !== "ACTIVE") throw new Error("This account is not active");
    if (existing) {
      await tx.userRole.upsert({
        where: { userId_roleKey: { userId: existing.id, roleKey: "PARTNER_SELLER" } },
        create: { userId: existing.id, roleKey: "PARTNER_SELLER" },
        update: {},
      });
      return existing;
    }
    return tx.user.create({
      data: {
        email,
        name: seat.displayName,
        status: "ACTIVE",
        roles: { create: [{ roleKey: "ATTENDEE" }, { roleKey: "PARTNER_SELLER" }] },
      },
      select: { id: true, status: true },
    });
  });
  const issued = await issuePasswordlessToken({ email, callbackUrl: "/partner/seller", requireExistingUserId: user.id });
  if (!issued.issued) throw new Error("Secure sign-in email could not be issued");
  await prisma.partnerCommerceSeat.update({ where: { id: seat.id }, data: { status: "INVITED", invitedAt: new Date(), provisionedUserId: user.id } });
  await logAdminAction({ targetUserId: user.id, performedByUserId: input.invitedByUserId, action: "PARTNER_COMMERCE_INVITED", summary: `${isResend ? "Reissued" : "Issued"} Partner Commerce sign-in invitation for ${seat.displayName} under ${seat.partner.name}`, reason: isResend ? "Superadmin-requested seller sign-in recovery" : "Superadmin-approved seller onboarding" });
  return { email, userId: user.id, resent: isResend };
}
