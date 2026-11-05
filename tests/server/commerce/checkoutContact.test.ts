import { describe, expect, it } from "vitest";
import { checkoutEmailsMatch } from "@/lib/checkoutContact";
import { reservationConceptFromQuery } from "@/lib/reservationConcept";

describe("checkout account contact comparison", () => {
  it("normalizes whitespace and case without changing ownership", () => {
    expect(checkoutEmailsMatch("Buyer@Example.invalid", " buyer@example.invalid ")).toBe(true);
  });
  it.each([null, undefined, "", "other@example.invalid"])("rejects absent or different account %s", email => {
    expect(checkoutEmailsMatch(email, "buyer@example.invalid")).toBe(false);
  });
});

describe("reservation concept query hint", () => {
  it.each(["oku", "catch", "terrace", "vip"])("selects supported preference %s", value => {
    expect(reservationConceptFromQuery(`?concept=${value}&ref=KEEP-ME`)).toBe(value);
  });
  it("normalizes a known value", () => expect(reservationConceptFromQuery("?concept=%20CATCH%20")).toBe("catch"));
  it.each(["", "?ref=catch", "?concept=unknown", "?concept=__proto__", "?concept=https://example.invalid"])("ignores %s", query => {
    expect(reservationConceptFromQuery(query)).toBe("");
  });
});
