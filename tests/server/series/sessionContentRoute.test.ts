import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const auth = vi.hoisted(() => ({ requireSession: vi.fn() }));
vi.mock("@/server/auth/session", () => ({ requireSession: auth.requireSession }));
const db = vi.hoisted(() => {
  const tx = { session: { update: vi.fn() }, sessionTicketPrice: { deleteMany: vi.fn(), createMany: vi.fn() }, auditLog: { create: vi.fn() } };
  return { tx, prisma: { session: { findUnique: vi.fn() }, ticketType: { findMany: vi.fn() }, $transaction: vi.fn((operation: (client: typeof tx) => unknown) => operation(tx)) } };
});
vi.mock("@/lib/prisma", () => ({ prisma: db.prisma }));

import { PATCH } from "@/app/api/v1/admin/sessions/[id]/route";

const request = (body: unknown) => new NextRequest("http://localhost/api/v1/admin/sessions/session-1", {
  method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});
const context = () => ({ params: Promise.resolve({ id: "session-1" }) });

beforeEach(() => {
  vi.clearAllMocks();
  auth.requireSession.mockResolvedValue({ userId: "admin-1", roles: ["SUPERADMIN"] });
  db.tx.session.update.mockResolvedValue({ id: "session-1", title: "Bordeaux", subtitle: null, description: null, flyerImageUrl: null });
  db.tx.auditLog.create.mockResolvedValue({ id: "audit-1" });
  db.prisma.session.findUnique.mockResolvedValue({ id: "session-1", seriesId: "series-1" });
  db.prisma.ticketType.findMany.mockResolvedValue([{ id: "ticket-1" }]);
  db.tx.sessionTicketPrice.deleteMany.mockResolvedValue({ count: 0 });
  db.tx.sessionTicketPrice.createMany.mockResolvedValue({ count: 1 });
});

describe("PATCH /api/v1/admin/sessions/[id] session content", () => {
  it("saves optional session-specific content and audits changed fields", async () => {
    const response = await PATCH(request({ title: "Discover Bordeaux", subtitle: "W02", description: "A themed session.", flyerImageUrl: "https://cdn.example.com/w02.png" }), context());
    expect(response.status).toBe(200);
    expect(db.tx.session.update).toHaveBeenCalledWith(expect.objectContaining({ data: {
      title: "Discover Bordeaux", subtitle: "W02", description: "A themed session.", flyerImageUrl: "https://cdn.example.com/w02.png",
    } }));
    expect(db.tx.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "session.content.updated", metadata: { sessionId: "session-1", fields: ["title", "subtitle", "description", "flyerImageUrl"] } }) });
  });

  it("rejects insecure artwork before writing", async () => {
    const response = await PATCH(request({ flyerImageUrl: "http://example.com/flyer.png" }), context());
    expect(response.status).toBe(400);
    expect(db.tx.session.update).not.toHaveBeenCalled();
  });

  it("replaces a session's future ticket prices atomically and records the change", async () => {
    const response = await PATCH(request({ ticketPrices: [{ ticketTypeId: "ticket-1", priceCents: 5200 }] }), context());
    expect(response.status).toBe(200);
    expect(db.tx.sessionTicketPrice.deleteMany).toHaveBeenCalledWith({ where: { sessionId: "session-1" } });
    expect(db.tx.sessionTicketPrice.createMany).toHaveBeenCalledWith({ data: [{ sessionId: "session-1", ticketTypeId: "ticket-1", priceCents: 5200 }] });
    expect(db.tx.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "session.ticket_prices.updated" }) });
  });

  it("rejects ticket-price overrides for a different series", async () => {
    db.prisma.ticketType.findMany.mockResolvedValue([]);
    const response = await PATCH(request({ ticketPrices: [{ ticketTypeId: "foreign-ticket", priceCents: 5200 }] }), context());
    expect(response.status).toBe(400);
    expect(db.tx.sessionTicketPrice.createMany).not.toHaveBeenCalled();
  });
});
