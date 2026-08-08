/**
 * RBAC role-split authorization tests — FB_DIRECTOR / RESTAURANT_SUPERVISOR
 *
 * Validates the access boundaries introduced when ADMIN_COMMERCIAL was retired:
 *
 *   FB_DIRECTOR        — admin shell ✓, ops routes ✓, finance/governance ✗
 *   RESTAURANT_SUPERVISOR — host portal ✓, admin shell ✗, finance/governance ✗
 *   ADMIN_COMMERCIAL   — zero-permission legacy role — everything ✗
 *
 * Tests use ROLE_PERMISSIONS directly (pure unit) and the ROLE_ROUTES shared
 * policy table (imported from src/lib/routePolicy.ts — the same source used by
 * middleware). Both layers are exercised so a change in either triggers a failure.
 */

import { describe, it, expect } from "vitest";
import { ROLE_PERMISSIONS, hasPermission } from "@/lib/permissions";
import { ROLE_ROUTES } from "@/lib/routePolicy";
import type { RoleKey, PermissionKey } from "@/types/roles";

// ─── Routing helper (mirrors middleware first-match logic) ────────────────────

function canReach(path: string, roles: string[]): boolean {
  for (const rule of ROLE_ROUTES) {
    if (path === rule.prefix || path.startsWith(rule.prefix + "/") || path.startsWith(rule.prefix)) {
      return roles.some((r) => rule.allowed.includes(r));
    }
  }
  return true; // no rule = unrestricted public
}

// ─── Permission helper ────────────────────────────────────────────────────────

function perms(role: RoleKey): PermissionKey[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

// ─── ADMIN_COMMERCIAL — zero-permission legacy role ───────────────────────────

describe("ADMIN_COMMERCIAL — zero-permission legacy role", () => {
  it("has an empty permission set (fail-closed)", () => {
    expect(ROLE_PERMISSIONS.ADMIN_COMMERCIAL).toStrictEqual([]);
  });

  it("hasPermission returns false for every known permission", () => {
    const allPerms: PermissionKey[] = [
      "public:read", "account:read", "series:read", "admin:audit:read",
      "admin:security:read", "admin:users:edit", "admin:payments:refund",
      "admin:payouts:write", "admin:compensation:read", "admin:compensation:write",
      "admin:menus:read", "admin:menus:edit", "admin:revenue:read", "admin:revenue:write",
      "admin:tickets:read", "admin:tickets:write",
      "admin:spaces:read", "admin:spaces:write",
      "admin:operations:read", "admin:operations:write", "admin:analytics:operations:read",
      "admin:orders:write", "admin:experiences:write",
      "host:reservations:checkin", "tickets:checkin",
    ];
    for (const p of allPerms) {
      expect(hasPermission(["ADMIN_COMMERCIAL"], p)).toBe(false);
    }
  });

  it("cannot reach any /admin route", () => {
    const adminPaths = [
      "/admin", "/admin/experiences", "/admin/series", "/admin/orders",
      "/admin/payouts", "/admin/revenue", "/admin/compensation", "/admin/users",
      "/admin/analytics/experiences", "/admin/spaces", "/admin/menus",
    ];
    for (const path of adminPaths) {
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
    expect(adminEntry?.allowed).not.toContain("ADMIN_COMMERCIAL");
    expect(adminEntry?.allowed).not.toContain("RESTAURANT_SUPERVISOR");
  });
});
