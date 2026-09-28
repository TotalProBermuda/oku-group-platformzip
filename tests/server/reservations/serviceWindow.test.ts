import { describe, expect, it } from "vitest";
import {
  serviceStartForCalendarDate,
  serviceStartForInstant,
} from "@/server/reservations/serviceWindow";

describe("reservation service window", () => {
  it("opens at 17:00 Monday through Thursday", () => {
    expect(serviceStartForCalendarDate("2026-09-28", 17 * 60)).toBe(17 * 60);
  });

  it.each(["2026-10-02", "2026-10-03", "2026-10-04"])(
    "opens at 14:00 Friday through Sunday (%s)",
    (date) => {
      expect(serviceStartForCalendarDate(date, 17 * 60)).toBe(14 * 60);
    },
  );

  it("uses the restaurant timezone for server-side enforcement", () => {
    const panamaSaturday = new Date("2026-10-03T20:00:00.000Z");
    expect(serviceStartForInstant(panamaSaturday, "America/Panama", 17 * 60)).toBe(14 * 60);
  });
});
