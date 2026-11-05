import { describe, expect, it } from "vitest";
import { escapeEmailText, formatTicketSession } from "@/server/email/ticketPresentation";

describe("ticket email presentation", () => {
  it("displays the booked session in Panama rather than server time", () => {
    expect(formatTicketSession(new Date("2026-09-28T22:00:00Z"))).toBe("Monday, September 28, 2026 at 5:00 PM · Panama time");
  });
  it("keeps the correct local date around midnight", () => {
    expect(formatTicketSession(new Date("2026-09-29T02:00:00Z"))).toContain("Monday, September 28, 2026 at 9:00 PM");
  });
  it("escapes user and catalogue text rather than allowing email markup", () => {
    expect(escapeEmailText('<img src="x"> & \'')).toBe("&lt;img src=&quot;x&quot;&gt; &amp; &#39;");
  });
});
