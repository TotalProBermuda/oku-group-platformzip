import { describe, expect, it } from "vitest";
import { WEBSITE_CONTENT_DEFAULTS, slotsForOperatingDate } from "@/server/content/websiteContent";
import { reservationIsWithinOperatingHours } from "@/server/reservations/serviceWindow";
import { panamaReservationIso } from "@/lib/reservationDate";

describe("reservation service window", () => {
  it("opens at 17:00 Monday through Thursday", () => {
    expect(slotsForOperatingDate(WEBSITE_CONTENT_DEFAULTS, "2026-09-28")[0]).toBe("17:00");
  });

  it.each(["2026-10-02", "2026-10-03", "2026-10-04"])(
    "opens at 14:00 Friday through Sunday (%s)",
    (date) => {
      expect(slotsForOperatingDate(WEBSITE_CONTENT_DEFAULTS, date)[0]).toBe("14:00");
    },
  );

  it("uses the restaurant timezone for server-side enforcement", () => {
    const panamaSaturday = new Date("2026-10-03T20:00:00.000Z");
    expect(reservationIsWithinOperatingHours(WEBSITE_CONTENT_DEFAULTS, panamaSaturday)).toBe(true);
  });

  it("honours a closed holiday exception", () => {
    const content = structuredClone(WEBSITE_CONTENT_DEFAULTS);
    content.operationalCalendar.exceptions.push({
      date: "2026-12-25",
      name: { en: "Christmas Day", es: "Navidad", pt: "Natal" },
      closed: true,
      shifts: [],
    });
    expect(slotsForOperatingDate(content, "2026-12-25")).toEqual([]);
  });

  it("supports separate lunch and dinner shifts without offering the gap", () => {
    const content = structuredClone(WEBSITE_CONTENT_DEFAULTS);
    content.operationalCalendar.exceptions.push({
      date: "2026-10-05",
      name: { en: "Split service", es: "Servicio dividido", pt: "Serviço dividido" },
      closed: false,
      shifts: [
        { label: { en: "Lunch", es: "Almuerzo", pt: "Almoço" }, start: "12:00", end: "15:00" },
        { label: { en: "Dinner", es: "Cena", pt: "Jantar" }, start: "18:00", end: "24:00" },
      ],
    });
    const slots = slotsForOperatingDate(content, "2026-10-05");
    expect(slots).toContain("12:00");
    expect(slots).toContain("18:00");
    expect(slots).not.toContain("16:00");
  });

  it("interprets guest input as Panama time regardless of device timezone", () => {
    expect(panamaReservationIso("2026-10-02", "14:00")).toBe("2026-10-02T19:00:00.000Z");
  });
});
