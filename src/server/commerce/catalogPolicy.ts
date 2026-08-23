import { prisma } from "@/lib/prisma";

type CheckoutItem = { ticketTypeId?: string; addonId?: string; qty: number };

export class CatalogPolicyError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 403) {
    super(message);
    this.name = "CatalogPolicyError";
  }
}

/**
 * Authoritative checkout policy. Public pages may hide products for a better
 * experience, but this service is the boundary that prevents a crafted request
 * from buying a hidden, expired, inactive, foreign, or invite-only product.
 */
export async function assertCheckoutCatalogPolicy(input: {
  userId: string;
  sessionId: string;
  items: CheckoutItem[];
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const session = await prisma.session.findUnique({
    where: { id: input.sessionId },
    include: {
      series: {
        select: {
          id: true,
          status: true,
          minMembershipTier: true,
          isFounderOnly: true,
          commercialOwnerInfluencerId: true,
          influencerId: true,
        },
      },
    },
  });
  if (!session) throw new CatalogPolicyError("SESSION_NOT_FOUND", "Session not found", 404);
  if (session.status !== "SCHEDULED") {
    throw new CatalogPolicyError("SESSION_UNAVAILABLE", "This session is not available for purchase.");
  }
  if (session.series.status !== "PUBLISHED") {
    throw new CatalogPolicyError("EXPERIENCE_NOT_PUBLIC", "This experience is not available for purchase.");
  }

  const ticketQuantities = aggregate(input.items, "ticketTypeId");
  const addonQuantities = aggregate(input.items, "addonId");
  if (ticketQuantities.size === 0) {
    throw new CatalogPolicyError("TICKET_REQUIRED", "Select at least one ticket.", 400);
  }

  const [membership, user, tickets, addons] = await Promise.all([
    prisma.membership.findFirst({ where: { userId: input.userId, status: "ACTIVE" }, select: { tier: true } }),
    prisma.user.findUnique({ where: { id: input.userId }, select: { email: true } }),
    prisma.ticketType.findMany({ where: { id: { in: [...ticketQuantities.keys()] } } }),
    prisma.experienceAddon.findMany({ where: { id: { in: [...addonQuantities.keys()] } } }),
  ]);

  if (tickets.length !== ticketQuantities.size) {
    throw new CatalogPolicyError("INVALID_TICKET", "One or more ticket types do not exist.", 400);
  }
  if (addons.length !== addonQuantities.size) {
    throw new CatalogPolicyError("INVALID_ADDON", "One or more add-ons do not exist.", 400);
  }

  const email = user?.email?.toLowerCase();
  const [newsletter, invitations] = await Promise.all([
    email
      ? prisma.newsletterSubscription.findFirst({ where: { email, isActive: true }, select: { id: true } })
      : null,
    prisma.eventInvitation.findMany({
      where: {
        seriesId: session.series.id,
        status: { notIn: ["DECLINED"] },
        OR: [{ recipientUserId: input.userId }, ...(email ? [{ recipientEmail: email }] : [])],
      },
      select: { id: true },
    }),
  ]);

  const tierRank: Record<string, number> = { EXPLORER: 0, INSIDER: 1, PATRON: 2, FOUNDER: 3 };
  const memberRank = membership ? (tierRank[membership.tier] ?? -1) : -1;
  const requiredRank = session.series.minMembershipTier
    ? (tierRank[session.series.minMembershipTier] ?? Number.MAX_SAFE_INTEGER)
    : -1;
  if (memberRank < requiredRank || (session.series.isFounderOnly && membership?.tier !== "FOUNDER")) {
    throw new CatalogPolicyError("INSUFFICIENT_MEMBERSHIP", "This experience requires a higher membership tier.");
  }

  for (const ticket of tickets) {
    const qty = ticketQuantities.get(ticket.id)!;
    if (ticket.seriesId !== session.series.id) {
      throw new CatalogPolicyError("TICKET_SCOPE_MISMATCH", "A ticket does not belong to this experience.", 400);
    }
    if (ticket.ticketStatus !== "ACTIVE") throw new CatalogPolicyError("TICKET_INACTIVE", "This ticket is not available.");
    if ((ticket.saleStartsAt && now < ticket.saleStartsAt) || (ticket.saleEndsAt && now > ticket.saleEndsAt)) {
      throw new CatalogPolicyError("TICKET_OUTSIDE_SALE_WINDOW", "This ticket is not currently on sale.");
    }
    if (qty < ticket.minPerOrder || qty > ticket.maxPerOrder) {
      throw new CatalogPolicyError("TICKET_ORDER_LIMIT", `Ticket quantity for ${ticket.name} must be between ${ticket.minPerOrder} and ${ticket.maxPerOrder}.`, 400);
    }
    if (ticket.typeCapacity !== null && ticket.soldCount + qty > ticket.typeCapacity) {
      throw new CatalogPolicyError("TICKET_SOLD_OUT", `${ticket.name} is sold out.`);
    }
    if ((ticket.requiresMembership || ticket.earlyAccessOnly || ticket.visibilityMode === "MEMBERS_ONLY") && !membership) {
      throw new CatalogPolicyError("MEMBERSHIP_REQUIRED", "This ticket is reserved for active members.");
    }
    if (ticket.visibilityMode === "HIDDEN") {
      throw new CatalogPolicyError("TICKET_HIDDEN", "This ticket is not available.");
    }
    if (ticket.visibilityMode === "NEWSLETTER_ONLY" && !newsletter) {
      throw new CatalogPolicyError("NEWSLETTER_REQUIRED", "This ticket is available to newsletter subscribers only.");
    }
    if (ticket.visibilityMode === "INVITE_ONLY" && invitations.length === 0) {
      throw new CatalogPolicyError("INVITATION_REQUIRED", "A valid invitation is required for this ticket.");
    }
  }

  for (const addon of addons) {
    const qty = addonQuantities.get(addon.id)!;
    if (addon.seriesId !== session.series.id) {
      throw new CatalogPolicyError("ADDON_SCOPE_MISMATCH", "An add-on does not belong to this experience.", 400);
    }
    if (!addon.isActive) throw new CatalogPolicyError("ADDON_INACTIVE", "This add-on is not available.");
    if (addon.capacity !== null && addon.soldCount + qty > addon.capacity) {
      throw new CatalogPolicyError("ADDON_SOLD_OUT", `${addon.name} is sold out.`);
    }
    if (addon.requiresMembership && !membership) {
      throw new CatalogPolicyError("MEMBERSHIP_REQUIRED", "This add-on is reserved for active members.");
    }
    if (addon.requiresTicketTypeId && !ticketQuantities.has(addon.requiresTicketTypeId)) {
      throw new CatalogPolicyError("ADDON_TICKET_REQUIRED", `${addon.name} requires its linked ticket type.`);
    }
  }

  return { session, tickets, addons };
}

function aggregate(items: CheckoutItem[], key: "ticketTypeId" | "addonId") {
  const result = new Map<string, number>();
  for (const item of items) {
    const id = item[key];
    if (!id) continue;
    result.set(id, (result.get(id) ?? 0) + item.qty);
  }
  return result;
}
