import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encryptSecret, isEncryptionAvailable, maskSecret } from "@/server/security/encryption";

function randRefCode(name: string) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = (name.toUpperCase().replace(/[^A-Z0-9]/g, "") || "INF").slice(0, 3);
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Token required" }, { status: 400 });

  const invite = await prisma.influencerInvite.findUnique({
    where: { token },
    include: { series: { select: { id: true, title: true, heroImageUrl: true } } },
  });

  if (!invite) return NextResponse.json({ error: "Invalid invite link" }, { status: 404 });
  if (invite.status !== "PENDING") return NextResponse.json({ error: "This invite has already been used or revoked", status: invite.status }, { status: 410 });
  if (invite.expiresAt < new Date()) {
    await prisma.influencerInvite.update({ where: { id: invite.id }, data: { status: "EXPIRED" } });
    return NextResponse.json({ error: "This invite has expired" }, { status: 410 });
  }

  return NextResponse.json({
    ok: true,
    invite: {
      id: invite.id,
      invitedEmail: invite.invitedEmail,
      invitedName: invite.invitedName,
      commissionRateBps: invite.commissionRateBps,
      commissionPct: invite.commissionRateBps / 100,
      series: invite.series,
      expiresAt: invite.expiresAt,
    },
  });
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Token required" }, { status: 400 });

  const invite = await prisma.influencerInvite.findUnique({
    where: { token },
    include: { series: { select: { id: true, title: true } } },
  });

  if (!invite) return NextResponse.json({ error: "Invalid invite link" }, { status: 404 });
  if (invite.status !== "PENDING") return NextResponse.json({ error: "This invite has already been used or revoked" }, { status: 410 });
  if (invite.expiresAt < new Date()) {
    await prisma.influencerInvite.update({ where: { id: invite.id }, data: { status: "EXPIRED" } });
    return NextResponse.json({ error: "This invite has expired" }, { status: 410 });
  }

  const rawBody = await req.json().catch(() => ({}));
  const body = rawBody && typeof rawBody === "object" && !Array.isArray(rawBody)
    ? rawBody as Record<string, any>
    : {};
  const {
    name, profileImageUrl, shortBio, instagramUrl, tiktokUrl, websiteUrl,
    whatsapp, preferredLanguage, bankName, accountHolderName, accountType,
    currency, swiftBic, bankAccountNumber, bankAccountNumberConfirmation,
  } = body;

  // The invitation address is the identity anchor; never let a public invite
  // submission redirect acceptance to a different account.
  const userEmail = invite.invitedEmail.trim().toLowerCase();
  const userName = typeof name === "string" ? name.trim() : invite.invitedName;
  const normalizedBankName = typeof bankName === "string" ? bankName.trim() : "";
  const normalizedHolder = typeof accountHolderName === "string" ? accountHolderName.trim() : "";
  const normalizedAccountType = accountType === "CHECKING" || accountType === "SAVINGS" ? accountType : null;
  const normalizedCurrency = typeof currency === "string" ? currency.trim().toUpperCase() : "";
  const normalizedSwift = typeof swiftBic === "string" ? swiftBic.trim().toUpperCase() : "";
  const normalizedAccountNumber = typeof bankAccountNumber === "string"
    ? bankAccountNumber.replace(/[\s-]/g, "")
    : "";
  const normalizedConfirmation = typeof bankAccountNumberConfirmation === "string"
    ? bankAccountNumberConfirmation.replace(/[\s-]/g, "")
    : "";

  if (body.payoutAuthorization !== true) {
    return NextResponse.json({ error: "Confirm the bank-details authorization to continue." }, { status: 400 });
  }
  if (!userName || userName.length > 120) {
    return NextResponse.json({ error: "Enter a valid full name." }, { status: 400 });
  }
  if (!normalizedBankName || normalizedBankName.length > 120) {
    return NextResponse.json({ error: "Enter the name of your bank." }, { status: 400 });
  }
  if (!normalizedHolder || normalizedHolder.length > 120) {
    return NextResponse.json({ error: "Enter the account holder name exactly as shown by your bank." }, { status: 400 });
  }
  if (!normalizedAccountType) {
    return NextResponse.json({ error: "Select checking or savings." }, { status: 400 });
  }
  if (!/^[A-Z]{3}$/.test(normalizedCurrency)) {
    return NextResponse.json({ error: "Enter a valid 3-letter account currency." }, { status: 400 });
  }
  if (!/^[A-Z0-9]{5,34}$/i.test(normalizedAccountNumber)) {
    return NextResponse.json({ error: "Enter a valid bank account number (5–34 letters or numbers)." }, { status: 400 });
  }
  if (normalizedAccountNumber !== normalizedConfirmation) {
    return NextResponse.json({ error: "The account numbers do not match." }, { status: 400 });
  }
  if (normalizedSwift && !/^[A-Z0-9]{8}(?:[A-Z0-9]{3})?$/.test(normalizedSwift)) {
    return NextResponse.json({ error: "Enter a valid 8- or 11-character SWIFT/BIC, or leave it blank." }, { status: 400 });
  }
  if (!isEncryptionAvailable()) {
    return NextResponse.json(
      { error: "Secure bank-detail storage is temporarily unavailable. Please try again later." },
      { status: 503 },
    );
  }
  const encryptedAccountNumber = encryptSecret(normalizedAccountNumber);
  const accountNumberLast4 = maskSecret(normalizedAccountNumber).last4;

  const user = await prisma.$transaction(async (tx) => {
    let existingUser = await tx.user.findUnique({ where: { email: userEmail } });

    if (!existingUser) {
      existingUser = await tx.user.create({
        data: {
          email: userEmail,
          name: userName,
          status: "ACTIVE",
          roles: { create: [{ roleKey: "INFLUENCER" }] },
        },
      });
    } else {
      const hasRole = await tx.userRole.findUnique({ where: { userId_roleKey: { userId: existingUser.id, roleKey: "INFLUENCER" } } });
      if (!hasRole) {
        await tx.userRole.create({ data: { userId: existingUser.id, roleKey: "INFLUENCER" } });
      }
      if (userName && !existingUser.name) {
        await tx.user.update({ where: { id: existingUser.id }, data: { name: userName } });
      }
    }

    let profile = await tx.influencerProfile.findUnique({ where: { userId: existingUser.id } });
    if (!profile) {
      let refCode = randRefCode(userName);
      let attempts = 0;
      while (await tx.influencerProfile.findUnique({ where: { refCode } }) && attempts++ < 10) {
        refCode = randRefCode(userName);
      }

      profile = await tx.influencerProfile.create({
        data: {
          userId: existingUser.id,
          refCode,
          displayName: userName,
          commissionRateBps: invite.commissionRateBps,
          approvalStatus: "APPROVED",
          approved: true,
          profileImageUrl: profileImageUrl || null,
          shortBio: shortBio || null,
          instagramUrl: instagramUrl || null,
          tiktokUrl: tiktokUrl || null,
          websiteUrl: websiteUrl || null,
          whatsapp: whatsapp || null,
          preferredLanguage: preferredLanguage || null,
        },
      });
    } else {
      profile = await tx.influencerProfile.update({
        where: { id: profile.id },
        data: {
          commissionRateBps: invite.commissionRateBps,
          ...(profileImageUrl ? { profileImageUrl } : {}),
          ...(shortBio ? { shortBio } : {}),
          ...(instagramUrl ? { instagramUrl } : {}),
          ...(tiktokUrl ? { tiktokUrl } : {}),
          ...(websiteUrl ? { websiteUrl } : {}),
          ...(whatsapp ? { whatsapp } : {}),
          ...(preferredLanguage ? { preferredLanguage } : {}),
        },
      });
    }

    // Bank coordinates are stored encrypted and never returned or logged in
    // plaintext. New referrals start with no extra KYC documents required;
    // Finance can request evidence later only where a documented rule applies.
    const beneficiary = await tx.beneficiaryProfile.findUnique({ where: { userId: existingUser.id } });
    const submittedBankDetails = {
      banescoAccountNumberEncrypted: encryptedAccountNumber,
      banescoAccountLast4: accountNumberLast4,
      bankName: normalizedBankName,
      accountHolderName: normalizedHolder,
      accountType: normalizedAccountType,
      currency: normalizedCurrency,
      swiftBic: normalizedSwift || null,
    };
    let beneficiaryStatus: string;
    if (!beneficiary) {
      await tx.beneficiaryProfile.create({
        data: {
          userId: existingUser.id,
          ...submittedBankDetails,
          proofOfAddressStatus: "NOT_REQUIRED",
          identificationStatus: "NOT_REQUIRED",
          taxOrRucStatus: "NOT_REQUIRED",
          sourceOfFundsStatus: "NOT_REQUIRED",
          bankReadinessStatus: "READY_FOR_REVIEW",
        },
      });
      beneficiaryStatus = "READY_FOR_REVIEW";
    } else {
      const docsComplete = [beneficiary.proofOfAddressStatus, beneficiary.identificationStatus,
        beneficiary.taxOrRucStatus, beneficiary.sourceOfFundsStatus]
        .every((status) => status === "NOT_REQUIRED" || status === "RECEIVED" || status === "VERIFIED");
      beneficiaryStatus = beneficiary.bankReadinessStatus === "ON_HOLD" || beneficiary.bankReadinessStatus === "REJECTED"
        ? beneficiary.bankReadinessStatus
        : docsComplete ? "READY_FOR_REVIEW" : "MISSING_INFO";
      await tx.beneficiaryProfile.update({
        where: { userId: existingUser.id },
        data: {
          ...submittedBankDetails,
          bankReadinessStatus: beneficiaryStatus as any,
          okuApprovedAt: null,
          okuApprovedById: null,
          bankReadyAt: null,
          bankReadyById: null,
        },
      });
    }
    await tx.auditLog.create({
      data: {
        actorId: existingUser.id,
        action: "beneficiary.profile.invite_submission",
        metadata: {
          source: "influencer_invite",
          changedFields: ["bankName", "accountHolderName", "accountType", "currency", "swiftBic", "bankAccountNumber"],
          accountNumberChanged: true,
          payoutAuthorization: true,
          payoutAuthorizationAcceptedAt: new Date().toISOString(),
        },
      },
    });

    if (invite.seriesId) {
      await tx.series.update({
        where: { id: invite.seriesId },
        data: { influencerId: profile.id },
      }).catch(() => {});
    }

    await tx.influencerInvite.update({
      where: { id: invite.id },
      data: { status: "ACCEPTED" },
    });

    return existingUser;
  });

  const beneficiary = await prisma.beneficiaryProfile.findUnique({
    where: { userId: user.id },
    select: { bankReadinessStatus: true, banescoAccountLast4: true },
  });
  return NextResponse.json({
    ok: true,
    userId: user.id,
    email: user.email,
    payoutSetup: {
      status: beneficiary?.bankReadinessStatus ?? "MISSING_INFO",
      accountLast4: beneficiary?.banescoAccountLast4 ?? null,
      payoutEligible: beneficiary?.bankReadinessStatus === "BANK_READY",
    },
  });
}
