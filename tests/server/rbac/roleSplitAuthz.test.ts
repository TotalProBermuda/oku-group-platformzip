/**
 * RBAC role-split authorization tests — FB_DIRECTOR / RESTAURANT_SUPERVISOR
 *
 * Validates the access boundaries introduced when ADMIN_COMMERCIAL was narrowed:
 *
 *   FB_DIRECTOR        — admin shell ✓, ops routes ✓, finance/governance ✗
 *   RESTAURANT_SUPERVISOR — host portal ✓, admin shell ✗, finance/governance ✗
 *   ADMIN_COMMERCIAL   — legacy F&B Director alias — safe ops ✓, finance/governance ✗
 *
 * Tests use ROLE_PERMISSIONS directly (pure unit) and the ROLE_ROUTES shared
 * policy table (imported from src/lib/routePolicy.ts — the same source used by
 * middleware). Both layers are exercised so a change in either triggers a failure.
 */

import { describe, it, expect } from "vitest";
import { ROLE_PERMISSIONS, hasPermission } from "@/lib/permissions";
import {
  ROLE_ROUTES,
  canonicalDestinationForRoles,
  rolesCanReachPath,
  sanitizeCallbackUrlForRoles,
} from "@/lib/routePolicy";
import type { RoleKey, PermissionKey } from "@/types/roles";

// ─── Routing helper (mirrors middleware first-match logic) ────────────────────

function canReach(path: string, roles: string[]): boolean {
  return rolesCanReachPath(path, roles);
}

// ─── Permission helper ────────────────────────────────────────────────────────

function perms(role: RoleKey): PermissionKey[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

// ─── ADMIN_COMMERCIAL — legacy F&B Director alias ────────────────────────────

describe("ADMIN_COMMERCIAL — legacy F&B Director compatibility alias", () => {
  it("shares the same permission set as FB_DIRECTOR", () => {
    expect(ROLE_PERMISSIONS.ADMIN_COMMERCIAL).toStrictEqual(ROLE_PERMISSIONS.FB_DIRECTOR);
  });

  it("has the safe restaurant-ops permissions", () => {
    const p = perms("ADMIN_COMMERCIAL");
    expect(p).toContain("public:read");
    expect(p).toContain("account:read");
    expect(p).toContain("account:write");
    expect(p).toContain("series:read");
    expect(p).toContain("admin:orders:read");
    expect(p).toContain("admin:menus:read");
    expect(p).toContain("admin:menus:edit");
    expect(p).toContain("admin:tickets:read");
    expect(p).toContain("admin:tickets:write");
    expect(p).toContain("tickets:checkin");
    expect(p).toContain("admin:spaces:read");
    expect(p).toContain("admin:spaces:write");
    expect(p).toContain("admin:operations:read");
    expect(p).toContain("admin:operations:write");
    expect(p).toContain("admin:analytics:operations:read");
    expect(p).toContain("admin:orders:write");
    expect(p).toContain("admin:experiences:write");
  });

  it("does NOT have finance, ProofPay, user, audit, or security permissions", () => {
    const p = perms("ADMIN_COMMERCIAL");
    expect(p).not.toContain("influencer:read");
    expect(p).not.toContain("partner:read");
    expect(p).not.toContain("admin:audit:read");
    expect(p).not.toContain("admin:security:read");
    expect(p).not.toContain("admin:users:edit");
    expect(p).not.toContain("admin:payments:refund");
    expect(p).not.toContain("admin:payouts:write");
    expect(p).not.toContain("admin:compensation:read");
    expect(p).not.toContain("admin:compensation:write");
    expect(p).not.toContain("admin:revenue:read");
    expect(p).not.toContain("admin:revenue:write");
    expect(p).not.toContain("host:reservations:checkin");
  });

  it("can reach the admin shell and safe restaurant ops routes", () => {
    const safePaths = [
      "/admin",
      "/admin/experiences",
      "/admin/series",
      "/admin/orders",
      "/admin/analytics/experiences",
      "/admin/spaces",
      "/admin/menus",
      "/admin/tickets",
    ];
    for (const path of safePaths) {
      expect(canReach(path, ["ADMIN_COMMERCIAL"])).toBe(true);
    }
  });

  it("cannot reach owner-only finance / governance / ProofPay routes", () => {
    const blockedPaths = [
      "/admin/payouts",
      "/admin/revenue",
      "/admin/compensation",
      "/admin/payments",
      "/admin/users",
      "/admin/profiles", "/admin/sponsorship", "/admin/memberships",
      "/admin/commission-rules", "/admin/sponsor-tiers", "/admin/influencer-invites",
      "/admin/accounts",
      "/admin/referrals",
      "/admin/referrers",
      "/admin/partners/reports",
      "/admin/table-sessions",
      "/admin/review-queue",
      "/admin/operations/ledger-outbox",
      "/admin/payments/payment-ledger",
      "/admin/security",
      "/admin/launch-readiness",
    ];
    for (const path of blockedPaths) {
      expect(canReach(path, ["ADMIN_COMMERCIAL"])).toBe(false);
    }
  });

  it("cannot reach /host routes", () => {
    expect(canReach("/host/dashboard", ["ADMIN_COMMERCIAL"])).toBe(false);
    expect(canReach("/host", ["ADMIN_COMMERCIAL"])).toBe(false);
  });
});

// ─── FB_DIRECTOR — F&B operations ────────────────────────────────────────────

describe("FB_DIRECTOR — F&B operations access", () => {
  const role: RoleKey = "FB_DIRECTOR";

  it("has the expected ops permissions", () => {
    const p = perms(role);
    expect(p).toContain("admin:orders:read"); // scoped — NOT admin:audit:read (which gates user/payout/referral APIs)
    expect(p).toContain("admin:menus:read");
    expect(p).toContain("admin:menus:edit");
    expect(p).toContain("admin:tickets:read");
    expect(p).toContain("admin:tickets:write");
    expect(p).toContain("admin:spaces:read");
    expect(p).toContain("admin:spaces:write");
    expect(p).toContain("admin:operations:read");
    expect(p).toContain("admin:operations:write");
    expect(p).toContain("admin:analytics:operations:read");
    expect(p).toContain("admin:orders:write");
    expect(p).toContain("admin:experiences:write");
    expect(p).toContain("tickets:checkin");
    expect(p).not.toContain("influencer:read");
    expect(p).not.toContain("partner:read");
  });

  it("does NOT have finance / governance permissions", () => {
    const p = perms(role);
    expect(p).not.toContain("admin:audit:read"); // too broad — gates user/payout/referral APIs
    expect(p).not.toContain("admin:payouts:write");
    expect(p).not.toContain("admin:compensation:read");
    expect(p).not.toContain("admin:compensation:write");
    expect(p).not.toContain("admin:revenue:read");
    expect(p).not.toContain("admin:revenue:write");
    expect(p).not.toContain("admin:payments:refund");
    expect(p).not.toContain("admin:users:edit");
    expect(p).not.toContain("admin:security:read");
    expect(p).not.toContain("admin:beneficiaries:summary");
    expect(p).not.toContain("admin:beneficiaries:detail");
    expect(p).not.toContain("admin:beneficiaries:write");
  });

  it("can reach /admin shell", () => {
    expect(canReach("/admin", ["FB_DIRECTOR"])).toBe(true);
  });

  it("can reach ops routes", () => {
    const opsPaths = [
      "/admin/experiences",
      "/admin/series",
      "/admin/orders",
      "/admin/analytics",
      "/admin/analytics/experiences",
      "/admin/menus",
      "/admin/tickets",
      "/admin/spaces",
    ];
    for (const path of opsPaths) {
      expect(canReach(path, ["FB_DIRECTOR"])).toBe(true);
    }
  });

  it("cannot reach finance / governance routes", () => {
    const financePaths = [
      "/admin/payouts",
      "/admin/revenue",
      "/admin/revenue/sessions",
      "/admin/compensation",
      "/admin/payments",
      "/admin/users",
      "/admin/profiles",
      "/admin/sponsorship",
      "/admin/memberships",
      "/admin/commission-rules",
      "/admin/sponsor-tiers",
      "/admin/influencer-invites",
      "/admin/accounts",
      "/admin/referrals",
      "/admin/referrers",
      "/admin/partners/reports",
      "/admin/table-sessions",
      "/admin/review-queue",
      "/admin/operations/ledger-outbox",
      "/admin/payments/payment-ledger",
      "/admin/security",
      "/admin/launch-readiness",
    ];
    for (const path of financePaths) {
      expect(canReach(path, ["FB_DIRECTOR"])).toBe(false);
    }
  });

  it("cannot reach /admin/ir or /admin/hr (role-specific)", () => {
    expect(canReach("/admin/ir", ["FB_DIRECTOR"])).toBe(false);
    expect(canReach("/admin/hr", ["FB_DIRECTOR"])).toBe(false);
  });

  it("cannot reach /host/dashboard", () => {
    // FB_DIRECTOR admin role does not get host portal access
    expect(canReach("/host/dashboard", ["FB_DIRECTOR"])).toBe(false);
  });
});

// ─── RESTAURANT_SUPERVISOR — host portal only ─────────────────────────────────

describe("RESTAURANT_SUPERVISOR — host portal only", () => {
  const role: RoleKey = "RESTAURANT_SUPERVISOR";

  it("has host:reservations:checkin and tickets:checkin", () => {
    const p = perms(role);
    expect(p).toContain("host:reservations:checkin");
    expect(p).toContain("tickets:checkin");
  });

  it("has no admin-domain permissions", () => {
    const p = perms(role);
    const adminPerms: PermissionKey[] = [
      "admin:menus:read", "admin:menus:edit",
      "admin:tickets:read", "admin:tickets:write",
      "admin:spaces:read", "admin:spaces:write",
      "admin:payouts:write", "admin:compensation:read",
      "admin:revenue:read", "admin:users:edit",
      "admin:security:read", "admin:audit:read",
      "admin:orders:write", "admin:experiences:write",
    ];
    for (const ap of adminPerms) {
      expect(p).not.toContain(ap);
    }
  });

  it("can reach /host/dashboard", () => {
    expect(canReach("/host/dashboard", [role])).toBe(true);
  });

  it("can reach /host", () => {
    expect(canReach("/host", [role])).toBe(true);
  });

  it("CANNOT reach /admin shell", () => {
    expect(canReach("/admin", [role])).toBe(false);
  });

  it("CANNOT reach any /admin sub-route", () => {
    const adminPaths = [
      "/admin/experiences",
      "/admin/series",
      "/admin/spaces",
      "/admin/orders",
      "/admin/payouts",
      "/admin/users",
      "/admin/analytics",
      "/admin/profiles",
      "/admin/sponsorship",
      "/admin/memberships",
      "/admin/commission-rules",
      "/admin/sponsor-tiers",
      "/admin/influencer-invites",
      "/admin/accounts",
      "/admin/referrals",
      "/admin/partners/reports",
    ];
    for (const path of adminPaths) {
      expect(canReach(path, [role])).toBe(false);
    }
  });
});

// ─── SUPERADMIN — still has everything ───────────────────────────────────────

describe("SUPERADMIN — unrestricted access", () => {
  it("can reach all finance / governance routes", () => {
    const paths = [
      "/admin/payouts",
      "/admin/revenue",
      "/admin/compensation",
      "/admin/payments",
      "/admin/users",
      "/admin/profiles",
      "/admin/sponsorship",
      "/admin/memberships",
      "/admin/commission-rules",
      "/admin/sponsor-tiers",
      "/admin/influencer-invites",
      "/admin/accounts",
      "/admin/referrals",
      "/admin/partners/reports",
      "/admin/operations/ledger-outbox",
      "/admin/payments/payment-ledger",
    ];
    for (const path of paths) {
      expect(canReach(path, ["SUPERADMIN"])).toBe(true);
    }
  });

  it("has all new scoped permissions", () => {
    const p = perms("SUPERADMIN");
    expect(p).toContain("admin:spaces:read");
    expect(p).toContain("admin:spaces:write");
    expect(p).toContain("admin:operations:read");
    expect(p).toContain("admin:operations:write");
    expect(p).toContain("admin:analytics:operations:read");
    expect(p).toContain("admin:orders:write");
    expect(p).toContain("admin:experiences:write");
  });

  it("hasPermission returns true for every ops permission via SUPERADMIN bypass", () => {
    expect(hasPermission(["SUPERADMIN"], "admin:spaces:write")).toBe(true);
    expect(hasPermission(["SUPERADMIN"], "admin:operations:write")).toBe(true);
    expect(hasPermission(["SUPERADMIN"], "admin:analytics:operations:read")).toBe(true);
    expect(hasPermission(["SUPERADMIN"], "admin:orders:write")).toBe(true);
    expect(hasPermission(["SUPERADMIN"], "admin:experiences:write")).toBe(true);
  });
});

// ─── ADMIN_FINANCE — narrow finance visibility only ─────────────────────────

describe("ADMIN_FINANCE — narrow finance visibility", () => {
  it("can reach payout and ledger routes, but not the payments settings page", () => {
    expect(canReach("/admin/payouts", ["ADMIN_FINANCE"])).toBe(true);
    expect(canReach("/admin/payouts/beneficiaries", ["ADMIN_FINANCE"])).toBe(true);
    expect(canReach("/admin/payments/payment-ledger", ["ADMIN_FINANCE"])).toBe(true);
    expect(canReach("/admin/operations/ledger-outbox", ["ADMIN_FINANCE"])).toBe(true);

    expect(canReach("/admin", ["ADMIN_FINANCE"])).toBe(false);
    expect(canReach("/admin/payments", ["ADMIN_FINANCE"])).toBe(false);
    expect(canReach("/admin/revenue", ["ADMIN_FINANCE"])).toBe(false);
    expect(canReach("/admin/compensation", ["ADMIN_FINANCE"])).toBe(false);
    expect(canReach("/admin/users", ["ADMIN_FINANCE"])).toBe(false);
    expect(canReach("/admin/profiles", ["ADMIN_FINANCE"])).toBe(false);
    expect(canReach("/admin/sponsorship", ["ADMIN_FINANCE"])).toBe(false);
    expect(canReach("/admin/memberships", ["ADMIN_FINANCE"])).toBe(false);
    expect(canReach("/admin/commission-rules", ["ADMIN_FINANCE"])).toBe(false);
    expect(canReach("/admin/sponsor-tiers", ["ADMIN_FINANCE"])).toBe(false);
    expect(canReach("/admin/influencer-invites", ["ADMIN_FINANCE"])).toBe(false);
    expect(canReach("/admin/accounts", ["ADMIN_FINANCE"])).toBe(false);
    expect(canReach("/admin/referrals", ["ADMIN_FINANCE"])).toBe(false);
    expect(canReach("/admin/referrers", ["ADMIN_FINANCE"])).toBe(false);
    expect(canReach("/admin/partners/reports", ["ADMIN_FINANCE"])).toBe(false);
    expect(canReach("/admin/orders", ["ADMIN_FINANCE"])).toBe(false);
    expect(canReach("/admin/series", ["ADMIN_FINANCE"])).toBe(false);
    expect(canReach("/admin/experiences", ["ADMIN_FINANCE"])).toBe(false);
    expect(canReach("/admin/analytics", ["ADMIN_FINANCE"])).toBe(false);
  });
});

// ─── Role isolation — no cross-contamination ─────────────────────────────────

describe("Role isolation — no cross-contamination between new roles", () => {
  it("FB_DIRECTOR permissions do not include host:reservations:checkin", () => {
    expect(perms("FB_DIRECTOR")).not.toContain("host:reservations:checkin");
  });

  it("RESTAURANT_SUPERVISOR permissions do not include any admin:*:write", () => {
    const writePerms = perms("RESTAURANT_SUPERVISOR").filter(
      (p) => p.startsWith("admin:") && p.endsWith(":write"),
    );
    expect(writePerms).toHaveLength(0);
  });

  it("RESTAURANT_SUPERVISOR never gets FB_DIRECTOR's admin-domain write permissions", () => {
    const supervisorPerms = new Set(perms("RESTAURANT_SUPERVISOR"));
    const adminWritePerms: PermissionKey[] = [
      "admin:menus:edit",
      "admin:tickets:write",
      "admin:spaces:write",
      "admin:operations:write",
      "admin:orders:write",
      "admin:experiences:write",
    ];
    for (const p of adminWritePerms) {
      expect(supervisorPerms.has(p)).toBe(false);
    }
  });

  it("FB_DIRECTOR never gets RESTAURANT_SUPERVISOR's host:reservations:checkin", () => {
    expect(perms("FB_DIRECTOR")).not.toContain("host:reservations:checkin");
  });

  it("ROLE_ROUTES is the shared policy — same object imported by middleware", () => {
    // Verifies the live middleware table is what the test is exercising.
    // ROLE_ROUTES is imported from @/lib/routePolicy (not duplicated inline).
    expect(ROLE_ROUTES).toBeInstanceOf(Array);
    expect(ROLE_ROUTES.length).toBeGreaterThan(10);
    const adminEntry = ROLE_ROUTES.find((r) => r.prefix === "/admin");
    expect(adminEntry?.allowed).toContain("FB_DIRECTOR");
    expect(adminEntry?.allowed).toContain("ADMIN_COMMERCIAL");
    expect(adminEntry?.allowed).not.toContain("RESTAURANT_SUPERVISOR");
  });
});

// ─── Login callback sanitization ─────────────────────────────────────────────

describe("Role-aware callbackUrl sanitization", () => {
  it("sends RESTAURANT_SUPERVISOR with stale /admin callback to /host/dashboard", () => {
    expect(canonicalDestinationForRoles(["RESTAURANT_SUPERVISOR"])).toBe("/host/dashboard");
    expect(sanitizeCallbackUrlForRoles("/admin", ["RESTAURANT_SUPERVISOR"])).toBe("/host/dashboard");
    expect(sanitizeCallbackUrlForRoles("/admin/payments", ["RESTAURANT_SUPERVISOR"])).toBe("/host/dashboard");
    expect(sanitizeCallbackUrlForRoles("/en/admin/users", ["RESTAURANT_SUPERVISOR"])).toBe("/host/dashboard");
  });

  it("sends FB_DIRECTOR with stale /host callback to /admin", () => {
    expect(canonicalDestinationForRoles(["FB_DIRECTOR"])).toBe("/admin");
    expect(sanitizeCallbackUrlForRoles("/host/dashboard", ["FB_DIRECTOR"])).toBe("/admin");
    expect(sanitizeCallbackUrlForRoles("/en/host/dashboard", ["FB_DIRECTOR"])).toBe("/admin");
  });

  it("sends an unknown non-privileged role with a cross-zone callback to public home", () => {
    expect(canonicalDestinationForRoles(["UNKNOWN_ROLE"])).toBe("/");
    expect(sanitizeCallbackUrlForRoles("/admin", ["UNKNOWN_ROLE"])).toBe("/");
    expect(sanitizeCallbackUrlForRoles("https://evil.example/admin", ["UNKNOWN_ROLE"])).toBe("/");
  });
});
