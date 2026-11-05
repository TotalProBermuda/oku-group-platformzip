import { describe, expect, it } from "vitest";
import { formatCardExpiry, parseCardExpiry } from "@/lib/cardExpiry";

describe("card expiry input", () => {
  it("types 1128 sequentially without injecting a zero", () => {
    let value = "";
    const states = [];
    for (const digit of "1128") {
      value = formatCardExpiry(value + digit);
      states.push(value);
    }
    expect(states).toEqual(["1", "11", "11 / 2", "11 / 28"]);
  });
  it("supports deletion, replacement and paste", () => {
    expect(formatCardExpiry("11 / 2")).toBe("11 / 2");
    expect(formatCardExpiry("11 / ")).toBe("11");
    expect(formatCardExpiry("")).toBe("");
    expect(formatCardExpiry("03/29")).toBe("03 / 29");
  });
  it("expands only a complete valid date at submission", () => {
    const now = new Date(2026, 8, 30);
    expect(parseCardExpiry("11 / 28", now)).toEqual({ expirationMonth: "11", expirationYear: "2028" });
    for (const value of ["11 / 2", "00 / 28", "13 / 28", "08 / 26", "11 / 02"]) {
      expect(parseCardExpiry(value, now)).toBeNull();
    }
    expect(parseCardExpiry("09 / 26", now)).not.toBeNull();
  });
});
