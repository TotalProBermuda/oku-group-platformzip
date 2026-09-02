import { describe, expect, it } from "vitest";
import {
  buildReservationConfirmationSubject,
  buildReservationRequestSubject,
  buildReservationRequestText,
  buildReservationUpdatedSubject,
  buildReservationUpdatedText,
} from "@/server/reservations/confirmationEmail";
import { buildGuestEventCard } from "@/server/events/eventOccupancyService";

const emailProps = {
  contactName: "Denzil Nelson",
  contactEmail: "guest@example.com",
  confirmationCode: "G9Q64BJB",
  reservationDate: new Date("2026-08-18T23:00:00.000Z"),
  partySize: 8,
  venueName: "Gold House",
  venueCity: "Panama City",
  zoneName: "Terrace",
  tableLabel: "T1 + T2",
  occasion: null,
  seatingPreference: null,
  notes: null,
  addons: [],
};

describe("reservation approval customer journey", () => {
  it("calls a pending submission a request, never a confirmation", () => {
    const subject = buildReservationRequestSubject(emailProps);
    const text = buildReservationRequestText(emailProps);
    expect(subject).toContain("Request received");
    expect(text).toContain("not yet a confirmed reservation");
    expect(text).toContain("REQUEST REFERENCE");
    expect(text).not.toContain("CONFIRMATION CODE");
  });

  it("uses confirmation wording only for the final-state email", () => {
    expect(buildReservationConfirmationSubject(emailProps)).toBe(
      "Your reservation at Gold House — G9Q64BJB",
    );
  });

  it("makes a section move explicit while keeping the booking confirmed", () => {
    const updated = { ...emailProps, zoneName: "CATCH", guestMessage: "We moved your table from OKU to CATCH." };
    expect(buildReservationUpdatedSubject(updated)).toBe(
      "Your reservation at Gold House was updated — G9Q64BJB",
    );
    const text = buildReservationUpdatedText(updated);
    expect(text).toContain("remains confirmed");
    expect(text).toContain("We moved your table from OKU to CATCH.");
    expect(text).toContain("Dining section: CATCH");
  });
});

describe("event-block disclosure", () => {
  const base = {
    slug: "supper-club",
    title: "Supper Club",
    heroImageUrl: "/event.jpg",
    status: "PUBLISHED",
    seriesVisibilityMode: "PUBLIC",
  };

  it("links a published public event only when public tickets are active", () => {
    expect(buildGuestEventCard({ ...base, ticketTypes: [{ id: "ticket" }] }, "Unavailable")).toMatchObject({
      kind: "PUBLIC_EVENT",
      title: "Supper Club",
      imageUrl: "/event.jpg",
      href: "/series/supper-club",
    });
    expect(buildGuestEventCard({ ...base, ticketTypes: [] }, "Unavailable").href).toBeUndefined();
  });

  it("never leaks private event identity or navigation", () => {
    const card = buildGuestEventCard(
      { ...base, seriesVisibilityMode: "PRIVATE_HIDDEN", ticketTypes: [{ id: "ticket" }] },
      "A secret celebrity wedding blocks this space",
    );
    expect(card).toEqual({
      kind: "PRIVATE_BLOCK",
      message: "This space is reserved for a private event at the selected time. Please choose another available area.",
    });
    expect(card.message).not.toContain("celebrity");
    expect(card).not.toHaveProperty("href");
    expect(card).not.toHaveProperty("title");
    expect(card).not.toHaveProperty("imageUrl");
  });
});
