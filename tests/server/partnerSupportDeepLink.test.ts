import { describe, expect, it } from "vitest";
import { partnerIdFromSearch } from "@/lib/partnerSupportSearch";

describe("partnerIdFromSearch", () => {
  it("returns the selected partner id from a support deep link", () => {
    expect(partnerIdFromSearch("?partnerId=partner-123")).toBe("partner-123");
  });

  it("decodes query-escaped partner ids", () => {
    expect(partnerIdFromSearch("?partnerId=partner%2F123")).toBe("partner/123");
  });

  it("returns null when no partner is selected", () => {
    expect(partnerIdFromSearch("?status=approved")).toBeNull();
  });
});
