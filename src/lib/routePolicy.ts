/**
 * Shared route-access policy table.
 *
 * Imported by:
 *   - src/middleware.ts  (Edge runtime RBAC enforcement)
 *   - tests/server/rbac/roleSplitAuthz.test.ts  (unit boundary checks)
 *
 * Keep this file free of any Node.js or Edge-only APIs so it runs cleanly
 * in both runtimes.
 *
 * IMPORTANT: The list is evaluated in order and the FIRST matching prefix
 * wins. More-specific prefixes must come before less-specific ones
 * (e.g. "/admin/payouts" before "/admin").
 */

export const ROLE_ROUTES: { prefix: string; allowed: string[] }[] = [
  { prefix: "/admin/ir",           allowed: ["SUPERADMIN", "ADMIN_IR"] },
  { prefix: "/admin/hr",           allowed: ["SUPERADMIN", "ADMIN_HR"] },
  { prefix: "/admin/hiring",       allowed: ["SUPERADMIN", "ADMIN_HR"] },
  // Finance / governance — SUPERADMIN-only, with narrow finance deep links.
  { prefix: "/admin/payments/payment-ledger",   allowed: ["SUPERADMIN", "ADMIN_FINANCE"] },
  { prefix: "/admin/operations/ledger-outbox",  allowed: ["SUPERADMIN", "ADMIN_FINANCE"] },
  { prefix: "/admin/payouts",      allowed: ["SUPERADMIN", "ADMIN_FINANCE"] },
  { prefix: "/admin/revenue",      allowed: ["SUPERADMIN"] },
  { prefix: "/admin/compensation", allowed: ["SUPERADMIN"] },
  { prefix: "/admin/payments",     allowed: ["SUPERADMIN"] },
  { prefix: "/admin/users",        allowed: ["SUPERADMIN"] },
  { prefix: "/admin/profiles",     allowed: ["SUPERADMIN"] },
  { prefix: "/admin/commission-rules", allowed: ["SUPERADMIN"] },
  { prefix: "/admin/sponsor-tiers", allowed: ["SUPERADMIN"] },
  { prefix: "/admin/influencer-invites", allowed: ["SUPERADMIN"] },
  { prefix: "/admin/sponsorship",  allowed: ["SUPERADMIN"] },
  { prefix: "/admin/memberships",  allowed: ["SUPERADMIN"] },
  { prefix: "/admin/accounts",     allowed: ["SUPERADMIN"] },
  { prefix: "/admin/referrals",    allowed: ["SUPERADMIN"] },
  { prefix: "/admin/referrers",    allowed: ["SUPERADMIN"] },
  { prefix: "/admin/partners",     allowed: ["SUPERADMIN"] },
  { prefix: "/admin/table-sessions", allowed: ["SUPERADMIN"] },
  { prefix: "/admin/review-queue", allowed: ["SUPERADMIN"] },
  { prefix: "/admin/integrations", allowed: ["SUPERADMIN"] },
  { prefix: "/admin/security",     allowed: ["SUPERADMIN"] },
  { prefix: "/admin/launch-readiness", allowed: ["SUPERADMIN"] },
  { prefix: "/admin/commerce",     allowed: ["SUPERADMIN"] },
  { prefix: "/admin/operations/conversion", allowed: ["SUPERADMIN"] },
  { prefix: "/admin/streetside",   allowed: ["SUPERADMIN"] },
  { prefix: "/admin/attribution-anchor", allowed: ["SUPERADMIN"] },
  // Operations — FB_DIRECTOR gets access alongside SUPERADMIN. ADMIN_COMMERCIAL
  // is a legacy compatibility alias for the same safe F&B ops surface.
  { prefix: "/admin/orders",       allowed: ["SUPERADMIN", "FB_DIRECTOR", "ADMIN_COMMERCIAL"] },
  { prefix: "/admin/series",       allowed: ["SUPERADMIN", "FB_DIRECTOR", "ADMIN_COMMERCIAL"] },
  { prefix: "/admin/experiences",  allowed: ["SUPERADMIN", "FB_DIRECTOR", "ADMIN_COMMERCIAL"] },
  { prefix: "/admin/analytics",    allowed: ["SUPERADMIN", "FB_DIRECTOR", "ADMIN_COMMERCIAL"] },
  { prefix: "/admin/menus",        allowed: ["SUPERADMIN", "FB_DIRECTOR", "ADMIN_COMMERCIAL"] },
  { prefix: "/admin/tickets",      allowed: ["SUPERADMIN", "FB_DIRECTOR", "ADMIN_COMMERCIAL"] },
  { prefix: "/admin/spaces",       allowed: ["SUPERADMIN", "FB_DIRECTOR", "ADMIN_COMMERCIAL"] },
  // Broad admin shell — F&B roles in; RESTAURANT_SUPERVISOR out.
  { prefix: "/admin",              allowed: ["SUPERADMIN", "FB_DIRECTOR", "ADMIN_COMMERCIAL", "ADMIN_IR", "ADMIN_HR"] },
  { prefix: "/influencer",         allowed: ["SUPERADMIN", "INFLUENCER"] },
  { prefix: "/partner",            allowed: ["SUPERADMIN", "PARTNER"] },
  { prefix: "/investor",           allowed: ["SUPERADMIN", "INVESTOR"] },
  { prefix: "/staff",              allowed: ["SUPERADMIN", "STAFF_OKU", "STAFF_CATCH", "RESTAURANT_HOST"] },
  // All referrer-capable roles — must mirror REFERRER_CAPABLE_ROLES in
  // src/app/api/v1/referrer/dashboard/route.ts (Edge runtime cannot import it).
  { prefix: "/referrer",           allowed: ["SUPERADMIN", "REFERRER", "TAXI_DRIVER", "HOTEL_CONCIERGE", "CONCIERGE", "TOUR_GUIDE", "PROMOTER", "PRIVATE_NETWORK", "INFLUENCER_SUB_REFERRER", "INFLUENCER", "PARTNER"] },
  { prefix: "/host/streetside",    allowed: ["SUPERADMIN", "STREETSIDE_HOST"] },
  { prefix: "/host/dashboard",     allowed: ["SUPERADMIN", "RESTAURANT_HOST", "RESTAURANT_SUPERVISOR"] },
  { prefix: "/host",               allowed: ["SUPERADMIN", "RESTAURANT_HOST", "STREETSIDE_HOST", "RESTAURANT_SUPERVISOR"] },
  { prefix: "/account",            allowed: ["SUPERADMIN", "FB_DIRECTOR", "ADMIN_COMMERCIAL", "ADMIN_IR", "ADMIN_HR", "INFLUENCER", "PARTNER", "INVESTOR", "STAFF_OKU", "STAFF_CATCH", "ATTENDEE"] },
  { prefix: "/my",                 allowed: ["SUPERADMIN", "FB_DIRECTOR", "ADMIN_COMMERCIAL", "ADMIN_IR", "ADMIN_HR", "INFLUENCER", "PARTNER", "INVESTOR", "STAFF_OKU", "STAFF_CATCH", "ATTENDEE"] },
];

export function routePolicyMatches(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

export function rolesCanReachPath(path: string, roles: string[]): boolean {
  for (const rule of ROLE_ROUTES) {
    if (routePolicyMatches(path, rule.prefix)) {
      return roles.some((role) => rule.allowed.includes(role));
    }
  }
  return true;
}

export function stripLocalePrefix(path: string): string {
  return path.replace(/^\/(en|es|pt)(?=\/|$)/, "") || "/";
}

export function canonicalDestinationForRoles(roles: string[]): string {
  if (
    roles.some((role) =>
      ["SUPERADMIN", "FB_DIRECTOR", "ADMIN_COMMERCIAL", "ADMIN_IR", "ADMIN_HR"].includes(role),
    )
  ) {
    return "/admin";
  }
  if (roles.includes("ADMIN_FINANCE")) {
    return "/admin/payouts";
  }
  if (roles.includes("STREETSIDE_HOST") && !roles.includes("RESTAURANT_HOST")) {
    return "/host/streetside";
  }
  if (roles.some((role) => ["RESTAURANT_HOST", "RESTAURANT_SUPERVISOR"].includes(role))) {
    return "/host/dashboard";
  }
  if (roles.includes("INFLUENCER")) return "/influencer/dashboard";
  if (roles.includes("PARTNER")) return "/partner/dashboard";
  if (roles.includes("INVESTOR")) return "/investor";
  if (
    roles.some((role) =>
      [
        "REFERRER",
        "TAXI_DRIVER",
        "HOTEL_CONCIERGE",
        "CONCIERGE",
        "TOUR_GUIDE",
        "PROMOTER",
        "PRIVATE_NETWORK",
        "INFLUENCER_SUB_REFERRER",
      ].includes(role),
    )
  ) {
    return "/referrer/dashboard";
  }
  if (roles.some((role) => ["STAFF_OKU", "STAFF_CATCH"].includes(role))) return "/staff";
  if (roles.includes("ATTENDEE")) return "/experiences";
  return "/";
}

export function sanitizeCallbackUrlForRoles(
  callbackUrl: string | null | undefined,
  roles: string[],
): string {
  if (!callbackUrl || !callbackUrl.startsWith("/")) {
    return canonicalDestinationForRoles(roles);
  }
  const policyPath = stripLocalePrefix(callbackUrl);
  return rolesCanReachPath(policyPath, roles)
    ? callbackUrl
    : canonicalDestinationForRoles(roles);
}
