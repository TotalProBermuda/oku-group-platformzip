import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ find: vi.fn(), send: vi.fn().mockResolvedValue({ data: { id: "mock-only" } }) }));
vi.mock("@/lib/prisma", () => ({ prisma: { order: { findUnique: mocks.find } } }));
vi.mock("@/server/invitation/resend", () => ({ getResendClient: async () => ({ client: { emails: { send: mocks.send } }, fromEmail: "test@example.invalid" }) }));
import { handleSendOrderEmail } from "@/server/jobs/commerceHandlers";

describe("order confirmation email (no network or database)", () => {
  it("uses the session date and stored financial amounts, escaping catalogue content", async () => {
    mocks.find.mockResolvedValue({
      id: "isolated-order", user: { name: "<Guest>", email: "guest@example.invalid" },
      series: { title: "<Event>", startsAt: new Date("2020-01-01"), venue: "OKÜ" },
      session: { startsAt: new Date("2026-09-28T22:00:00Z") },
      tickets: [{ code: "mock-ticket" }], lineItems: [{ nameSnapshot: "<Ticket>", qty: 1, totalCents: 200 }],
      totalCents: 227, feesCents: 10, taxCents: 17, discountCents: 0,
    });
    await handleSendOrderEmail("isolated-order");
    const html = mocks.send.mock.calls[0][0].html;
    expect(html).toContain("5:00 PM · Panama time");
    expect(html).not.toContain("2020");
    expect(html).toContain("&lt;Guest&gt;");
    expect(html).toContain("&lt;Ticket&gt;");
    expect(html).toContain("/my/tickets");
    for (const amount of ["$0.10", "$0.17", "$2.27"]) expect(html).toContain(amount);
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
});
