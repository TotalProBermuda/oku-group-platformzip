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
  // Finance / governance — SUPERADMIN-only (or shared with ADMIN_FINANCE for payouts)
  { prefix: "/admin/payouts",      allowed: ["SUPERADMIN", "ADMIN_FINANCE"] },
  { prefix: "/admin/revenue",      allowed: ["SUPERADMIN"] },
  { prefix: "/admin/compensation", allowed: ["SUPERADMIN"] },
  { prefix: "/admin/payments",     allowed: ["SUPERADMIN"] },
  { prefix: "/admin/users",        allowed: ["SUPERADMIN"] },
  // Operations — FB_DIRECTOR gets access alongside SUPERADMIN
  { prefix: "/admin/orders",       allowed: ["SUPERADMIN", "FB_DIRECTOR"] },
  { prefix: "/admin/series",       allowed: ["SUPERADMIN", "FB_DIRECTOR"] },
  { prefix: "/admin/experiences",  allowed: ["SUPERADMIN", "FB_DIRECTOR"] },
  { prefix: "/admin/analytics",    allowed: ["SUPERADMIN", "FB_DIRECTOR"] },
  // Broad admin shell — FB_DIRECTOR in; ADMIN_COMMERCIAL and RESTAURANT_SUPERVISOR out
  { prefix: "/admin",              allowed: ["SUPERADMIN", "FB_DIRECTOR", "ADMIN_IR", "ADMIN_HR"] },
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
  { prefix: "/account",            allowed: ["SUPERADMIN", "FB_DIRECTOR", "ADMIN_IR", "ADMIN_HR", "INFLUENCER", "PARTNER", "INVESTOR", "STAFF_OKU", "STAFF_CATCH", "ATTENDEE"] },
  { prefix: "/my",                 allowed: ["SUPERADMIN", "FB_DIRECTOR", "ADMIN_IR", "ADMIN_HR", "INFLUENCER", "PARTNER", "INVESTOR", "STAFF_OKU", "STAFF_CATCH", "ATTENDEE"] },
];
