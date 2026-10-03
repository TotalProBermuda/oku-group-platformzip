import { describe, expect, it } from "vitest";
import { dashboardNavigationForUser } from "@/lib/dashboardNavigation";

describe("dashboardNavigationForUser", () => {
  it.each([["ADMIN_FINANCE"], ["ADMIN_FINANCE", "REFERRER"]])("preserves the finance destination for %s", (...roles) => {
    expect(dashboardNavigationForUser(roles, true)).toEqual({
      href: "/admin/payouts", label: "Finance Dashboard",
    });
  });
  it.each([
    ["PARTNER"],
    ["PARTNER_SELLER"],
    ["REFERRER"],
    ["PROMOTER"],
  ])("sends %s to the shared referrer dashboard", (role) => {
    expect(dashboardNavigationForUser([role])).toEqual({
      href: "/referrer/dashboard",
      label: "Referrer Dashboard",
    });
  });

  it("sends a legacy attendee with a linked referrer identity to the shared dashboard", () => {
    expect(dashboardNavigationForUser(["ATTENDEE"], true)).toEqual({
      href: "/referrer/dashboard",
      label: "Referrer Dashboard",
    });
  });

  it("does not replace operational dashboards for multi-role users", () => {
    expect(dashboardNavigationForUser(["RESTAURANT_HOST", "REFERRER"], true).href).toBe("/host/dashboard");
    expect(dashboardNavigationForUser(["INFLUENCER", "REFERRER"], true).href).toBe("/influencer/dashboard");
  });
});
