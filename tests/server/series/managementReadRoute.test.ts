import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  roles: ["SUPERADMIN"], sessions: [] as Array<Record<string, unknown>>,
  transaction: vi.fn(), load: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: mock.transaction } }));
vi.mock("@/server/auth/session", () => ({ requireSession: async () => ({ userId: "fixture", roles: mock.roles }) }));
vi.mock("@/server/series/sessionManagement", () => ({ applySessionManagement: vi.fn(), previewSessionManagement: vi.fn() }));
vi.mock("@/server/series/sessionState", () => ({
  loadSessionState: mock.load, fieldKeys: () => ["capacity"], defaultField: () => ({ value: 24, mode: "inherit" }),
  effectiveField: () => ({ value: 24, mode: "inherit" }), inventory: () => ({ sold: 0, held: 0, issued: 0, minimum: 0 }),
}));
import { GET } from "@/app/api/v1/admin/series/[id]/session-management/route";

describe("session editor read metadata", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.roles = ["FB_DIRECTOR"];
    mock.sessions = [{ id: "date-a", title: "Date", startsAt: new Date(), endsAt: new Date(), status: "SCHEDULED", soldCount: 0, tickets: [], Order: [] }];
    mock.load.mockImplementation(async () => ({ series: { id: "fixture", title: "Fixture", ticketTypes: [], venueId: null }, sessions: mock.sessions }));
    const findMany = async () => [];
    mock.transaction.mockImplementation(async (fn) => fn({ entity: { findMany }, profile: { findMany }, sponsorTier: { findMany }, referralAssignment: { findMany } }));
  });
  it.each([
    ["no history", {}, false],
    ["expired checkout, no committed inventory", { Order: [{ status: "EXPIRED" }] }, true],
    ["refunded ticket, no active inventory", { tickets: [{ ticketStatus: "REFUNDED" }] }, true],
    ["sold counter", { soldCount: 1 }, true],
  ])("reports %s without exposing order/ticket details", async (_label, history, expected) => {
    Object.assign(mock.sessions[0], history);
    const response = await GET(new Request("http://fixture.invalid"), { params: Promise.resolve({ id: "fixture" }) });
    expect(response.status).toBe(200);
    const session = (await response.json()).data.sessions[0];
    expect(session.hasTicketHistory).toBe(expected);
    expect(session.inventory.minimum).toBe(0);
    expect(session).not.toHaveProperty("Order");
    expect(session).not.toHaveProperty("tickets");
  });
  it("still rejects users without experience-edit permission before reading data", async () => {
    mock.roles = ["CUSTOMER"];
    const response = await GET(new Request("http://fixture.invalid"), { params: Promise.resolve({ id: "fixture" }) });
    expect(response.status).toBe(403);
    expect(mock.transaction).not.toHaveBeenCalled();
  });
});
