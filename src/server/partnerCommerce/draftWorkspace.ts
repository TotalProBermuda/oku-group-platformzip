import { PartnerCommerceRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const MAX_SEAT_NAME_LENGTH = 120;
const MAX_SEAT_EMAIL_LENGTH = 254;

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export async function getPartnerCommerceWorkspace(userId: string) {
  const partner = await prisma.partnerProfile.findUnique({
    where: { userId },
    select: {
      id: true,
      name: true,
      approved: true,
      commerceChannels: {
        orderBy: { createdAt: "desc" },
        select: { id: true, label: true, status: true, createdAt: true },
      },
      commerceSeats: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true, displayName: true, email: true, commercialRole: true,
          status: true, requestedScopeJson: true, notes: true, createdAt: true,
        },
      },
    },
  });
  return partner;
}

export async function createPartnerDirectChannelDraft(input: { userId: string }) {
  const partner = await prisma.partnerProfile.findUnique({ where: { userId: input.userId } });
  if (!partner) throw new Error("Partner profile not found");

  return prisma.partnerCommerceChannel.upsert({
    where: { partnerId_label: { partnerId: partner.id, label: "Partner direct" } },
    create: {
      partnerId: partner.id,
      label: "Partner direct",
      createdByUserId: input.userId,
      status: "DRAFT",
    },
    update: {},
    select: { id: true, label: true, status: true, createdAt: true },
  });
}

export async function createPartnerSellerDraft(input: {
  userId: string;
  displayName: string;
  email: string;
  commercialRole: PartnerCommerceRole;
  notes?: string;
}) {
  const partner = await prisma.partnerProfile.findUnique({ where: { userId: input.userId }, select: { id: true } });
  if (!partner) throw new Error("Partner profile not found");

  const displayName = input.displayName.trim();
  const email = normalizeEmail(input.email);
  if (!displayName || displayName.length > MAX_SEAT_NAME_LENGTH) throw new Error("Enter a valid seller name");
  if (!email || email.length > MAX_SEAT_EMAIL_LENGTH || !email.includes("@")) throw new Error("Enter a valid seller email");

  return prisma.partnerCommerceSeat.create({
    data: {
      partnerId: partner.id,
      createdByUserId: input.userId,
      displayName,
      email,
      commercialRole: input.commercialRole,
      notes: input.notes?.trim() || null,
      // DRAFT is material: this does not email, invite, grant access, create
      // attribution, create a commission, or collect a bank detail.
      status: "DRAFT",
    },
    select: { id: true, displayName: true, email: true, commercialRole: true, status: true, createdAt: true },
  });
}
