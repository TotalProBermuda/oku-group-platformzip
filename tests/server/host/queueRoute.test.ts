import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ access: vi.fn(), queue: vi.fn(), reservation: vi.fn(), venue: vi.fn() }));
vi.mock("@/server/auth/hostChatGuard", () => ({ requireHostBookingAccess: m.access }));
vi.mock("@/server/host/hostService", () => ({ getHostQueue: m.queue }));
vi.mock("@/lib/prisma", () => ({ prisma: { reservation: { findUnique: m.reservation }, venue: { findFirst: m.venue } } }));
import { GET } from "@/app/api/v1/host/queue/route";
beforeEach(() => {
  vi.clearAllMocks();
  m.access.mockResolvedValue({ venueId: "assigned", isSuperadmin: false });
  m.queue.mockResolvedValue({ reservations: [], waitlist: [], zones: [] });
  m.reservation.mockResolvedValue({ venueId: "linked" });
  m.venue.mockResolvedValue({ id: "default" });
});
it("polls the selected date and ID inside the staff member's assigned venue", async () => {
  expect((await GET(new Request("https://example.test/api?date=2026-11-08&reservationId=booking&venueId=other"))).status).toBe(200);
  expect(m.queue).toHaveBeenCalledWith("assigned", { date: "2026-11-08", reservationId: "booking" });
  expect(m.reservation).not.toHaveBeenCalled();
});
it("lets superadmin follow an email to the reservation's venue", async () => {
  m.access.mockResolvedValue({ venueId: null, isSuperadmin: true });
  await GET(new Request("https://example.test/api?reservationId=booking"));
  expect(m.queue).toHaveBeenCalledWith("linked", { date: undefined, reservationId: "booking" });
});
it("rejects unauthorised access without reading reservations", async () => {
  m.access.mockRejectedValue(Object.assign(new Error("Forbidden"), { status: 403 }));
  expect((await GET(new Request("https://example.test/api"))).status).toBe(403);
  expect(m.queue).not.toHaveBeenCalled();
});
it("rejects invalid dates without querying the queue", async () => {
  expect((await GET(new Request("https://example.test/api?date=no"))).status).toBe(400);
  expect(m.queue).not.toHaveBeenCalled();
});
