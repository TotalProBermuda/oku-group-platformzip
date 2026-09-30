import { describe, expect, it, vi, beforeEach } from "vitest";

const { prisma } = vi.hoisted(() => ({ prisma: {
  session: { findUnique: vi.fn() },
  membership: { findFirst: vi.fn() },
  user: { findUnique: vi.fn() },
  ticketType: { findMany: vi.fn() },
  experienceAddon: { findMany: vi.fn() },
  newsletterSubscription: { findFirst: vi.fn() },
  eventInvitation: { findMany: vi.fn() },
} }));

vi.mock("@/lib/prisma", () => ({ prisma }));

import { assertCheckoutCatalogPolicy } from "@/server/commerce/catalogPolicy";

const session = {
  id: "session-1",
  status: "SCHEDULED",
  startsAt: new Date("2099-01-01T22:00:00Z"),
  endsAt: new Date("2099-01-02T01:00:00Z"),
  series: {
    id: "series-1",
    status: "PUBLISHED",
    minMembershipTier: null,
    isFounderOnly: false,
    commercialOwnerInfluencerId: null,
    influencerId: null,
  },
};

describe("checkout catalog policy", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    prisma.session.findUnique.mockResolvedValue(session);
    prisma.membership.findFirst.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue({ email: "guest@example.com" });
    prisma.experienceAddon.findMany.mockResolvedValue([]);
    prisma.newsletterSubscription.findFirst.mockResolvedValue(null);
    prisma.eventInvitation.findMany.mockResolvedValue([]);
  });

  it.each([
    ["2099-01-01T22:00:00Z", "SESSION_SALES_CLOSED"],
    ["2099-01-02T00:59:59Z", "SESSION_SALES_CLOSED"],
    ["2099-01-02T01:00:00Z", "SESSION_ENDED"],
  ])("rejects purchase at %s with %s", async (time, code) => {
    await expect(assertCheckoutCatalogPolicy({
      userId: "user-1", sessionId: "session-1",
      items: [{ ticketTypeId: "ticket-1", qty: 1 }], now: new Date(time),
    })).rejects.toMatchObject({ code, status: 409 });
    expect(prisma.ticketType.findMany).not.toHaveBeenCalled();
  });

  it("rejects a ticket supplied from a different series", async () => {
    prisma.ticketType.findMany.mockResolvedValue([{
      id: "ticket-foreign", seriesId: "series-2", name: "Foreign", ticketStatus: "ACTIVE",
      saleStartsAt: null, saleEndsAt: null, minPerOrder: 1, maxPerOrder: 10,
      typeCapacity: null, soldCount: 0, requiresMembership: false,
      earlyAccessOnly: false, visibilityMode: "VISIBLE",
    }]);

    await expect(assertCheckoutCatalogPolicy({
      userId: "user-1", sessionId: "session-1", items: [{ ticketTypeId: "ticket-foreign", qty: 1 }],
    })).rejects.toMatchObject({ code: "TICKET_SCOPE_MISMATCH", status: 400 });
  });

  it("allows an approved late-sales session to reach ticket validation", async () => {
    prisma.session.findUnique.mockResolvedValue({ ...session, allowLateSales: true });
    prisma.ticketType.findMany.mockResolvedValue([]);
    await expect(assertCheckoutCatalogPolicy({
      userId: "user-1", sessionId: "session-1", items: [{ ticketTypeId: "missing", qty: 1 }],
      now: new Date("2099-01-01T22:00:00Z"),
    })).rejects.toMatchObject({ code: "INVALID_TICKET" });
  });

  it("never lets late sales bypass event end", async () => {
    prisma.session.findUnique.mockResolvedValue({ ...session, allowLateSales: true });
    await expect(assertCheckoutCatalogPolicy({
      userId: "user-1", sessionId: "session-1", items: [{ ticketTypeId: "ticket", qty: 1 }],
      now: new Date("2099-01-02T01:00:00Z"),
    })).rejects.toMatchObject({ code: "SESSION_ENDED" });
  });

  it("rejects an invite-only ticket without an invitation", async () => {
    prisma.ticketType.findMany.mockResolvedValue([{
      id: "ticket-private", seriesId: "series-1", name: "Private", ticketStatus: "ACTIVE",
      saleStartsAt: null, saleEndsAt: null, minPerOrder: 1, maxPerOrder: 10,
      typeCapacity: null, soldCount: 0, requiresMembership: false,
      earlyAccessOnly: false, visibilityMode: "INVITE_ONLY",
    }]);

    await expect(assertCheckoutCatalogPolicy({
      userId: "user-1", sessionId: "session-1", items: [{ ticketTypeId: "ticket-private", qty: 1 }],
    })).rejects.toMatchObject({ code: "INVITATION_REQUIRED" });
  });
});
