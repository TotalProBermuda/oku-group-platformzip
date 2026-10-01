import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ find: vi.fn(), update: vi.fn(), count: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { ticket: { findUnique: mocks.find, updateMany: mocks.update, count: mocks.count } } }));
vi.mock("@/server/auth/session", () => ({ requireSession: vi.fn().mockResolvedValue({ roles: ["SUPERADMIN"], userId: "host" }) }));
vi.mock("@/lib/rbac", () => ({ requirePermission: vi.fn() }));
import { POST } from "@/app/api/v1/host/tickets/[id]/checkin/route";
const request = () => POST(new NextRequest("https://example.com/api/checkin", { method: "POST" }), { params: Promise.resolve({ id: "t" }) });

describe("ticket admission safeguards", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.count.mockResolvedValue(0); });
  it.each(["CANCELLED", "REFUNDED", "FAILED"])("rejects an issued ticket belonging to a %s order", async status => {
    mocks.find.mockResolvedValue({ id: "t", ticketStatus: "ISSUED", order: { status } });
    expect((await request()).status).toBe(409);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("does not overwrite a ticket changed concurrently", async () => {
    mocks.find.mockResolvedValue({ id: "t", orderId: "o", ticketStatus: "ISSUED", order: { status: "PAID" } });
    mocks.update.mockResolvedValue({ count: 0 });
    expect((await request()).status).toBe(409);
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "t", ticketStatus: "ISSUED", order: { status: { notIn: ["CANCELLED", "REFUNDED", "FAILED"] } } } }));
  });
});
