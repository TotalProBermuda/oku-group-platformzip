import { describe, expect, it } from "vitest";
import { hostQueueWhere, parseQueueSelection } from "@/server/host/queueSelection";
import { reservationPhone, panamaDateTimeInput, panamaInputToDate } from "@/lib/hostReservationDisplay";

// Evaluate the query's supported predicates against source-independent fixtures.
function matches(row: any, where: any): boolean {
  return Object.entries(where).every(([key, value]: [string, any]) => {
    if (key === "OR") return value.some((part: any) => matches(row, part));
    if (key === "reservationDate") return (!value.gte || row[key] >= value.gte) && (!value.lt || row[key] < value.lt);
    if (value?.in) return value.in.includes(row[key]);
    return row[key] === value;
  });
}
const now = new Date("2026-10-08T18:00:00Z");
const row = (date: string, status = "PENDING_APPROVAL", source = "UMBRELLA_SITE") => ({ id: "booking", venueId: "v1", reservationDate: new Date(date), status, source });

describe("host queue visibility", () => {
  it.each(["UMBRELLA_SITE", "QR_CODE", "OKU_SITE", "CATCH_SITE", "HOTEL_CONCIERGE", "ADMIN"])("includes today, next week and next month from %s", source => {
    for (const date of ["2026-10-08", "2026-10-15", "2026-11-08"]) {
      expect(matches(row(`${date}T22:00:00Z`, "CONFIRMED", source), hostQueueWhere("v1", {}, now))).toBe(true);
    }
  });
  it("retains old unresolved requests but not unrelated closed history", () => {
    expect(matches(row("2026-09-01T22:00:00Z"), hostQueueWhere("v1", {}, now))).toBe(true);
    expect(matches(row("2026-09-01T22:00:00Z", "COMPLETED"), hostQueueWhere("v1", {}, now))).toBe(false);
  });
  it("opens an emailed historical booking without permitting another venue", () => {
    const where = hostQueueWhere("v1", { reservationId: "booking" }, now);
    const booking = row("2026-09-01T22:00:00Z", "CANCELLED");
    expect(matches(booking, where)).toBe(true);
    expect(matches({ ...booking, venueId: "v2" }, where)).toBe(false);
  });
  it("uses half-open Panama service days including late evening and cancelled history", () => {
    const where = hostQueueWhere("v1", { date: "2026-09-01" }, now);
    expect(matches(row("2026-09-01T04:59:59Z", "CANCELLED"), where)).toBe(false);
    expect(matches(row("2026-09-01T05:00:00Z", "CANCELLED"), where)).toBe(true);
    expect(matches(row("2026-09-02T04:59:59Z", "COMPLETED"), where)).toBe(true);
    expect(matches(row("2026-09-02T05:00:00Z", "COMPLETED"), where)).toBe(false);
  });
  it.each(["2026-02-30", "garbage", "2026-13-01"])("rejects invalid date %s", date => {
    expect(() => parseQueueSelection({ date })).toThrow("Invalid reservation date");
  });
  it("allows an empty date to return to the default queue", () => expect(parseQueueSelection({ date: "" }).date).toBeUndefined());
  it("round-trips the confirmed time without depending on host device timezone", () => {
    expect(panamaDateTimeInput("2026-10-15T22:00:00Z")).toBe("2026-10-15T17:00");
    expect(panamaInputToDate("2026-10-15T17:00").toISOString()).toBe("2026-10-15T22:00:00.000Z");
  });
  it("shows either captured contact field and tolerates legacy missing contacts", () => {
    expect(reservationPhone({ contactPhone: "+507 12345678" })).toBe("+507 12345678");
    expect(reservationPhone({ contactPhone: " ", contactWhatsapp: "+1 441 5550100" })).toBe("+1 441 5550100");
    expect(reservationPhone({})).toBeNull();
  });
});
