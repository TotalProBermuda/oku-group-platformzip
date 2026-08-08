import type { RoleKey, PermissionKey } from "@/types/roles";

export const ROLE_PERMISSIONS: Record<RoleKey, PermissionKey[]> = {
  VISITOR: ["public:read", "series:read"],
  ATTENDEE: ["public:read", "account:read", "account:write", "series:read", "series:purchase"],
  INFLUENCER: ["public:read", "account:read", "account:write", "series:read", "influencer:read", "influencer:write"],
  PARTNER: ["public:read", "account:read", "account:write", "series:read", "partner:read", "partner:write", "partner:invite:write", "partner:hosts:write", "partner:earnings:read"],
  INVESTOR: ["public:read", "account:read", "ir:read"],
  STAFF_OKU: ["public:read", "account:read", "staff:sops:read", "staff:sops:ack", "tickets:checkin"],
  STAFF_CATCH: ["public:read", "account:read", "staff:sops:read", "staff:sops:ack", "tickets:checkin"],

  // ─── Legacy role — FAIL CLOSED ────────────────────────────────────────────
  // ADMIN_COMMERCIAL is retained in the DB enum for backward-compat with any
  // existing session tokens or DB rows, but grants zero access. Any session
  // still carrying this role will be refused by every permission and role check.
  // All active demo personas have been migrated to FB_DIRECTOR or SUPERADMIN.
  ADMIN_COMMERCIAL: [],

  ADMIN_IR: ["public:read", "account:read", "ir:read", "ir:write", "admin:audit:read"],
  ADMIN_HR: ["public:read", "account:read", "hr:read", "hr:write", "admin:audit:read", "admin:users:edit"],
  ADMIN_FINANCE: ["public:read", "account:read", "admin:audit:read", "admin:payouts:write", "admin:beneficiaries:summary", "admin:beneficiaries:detail", "admin:beneficiaries:write"],

  // ─── Restaurant F&B operations ────────────────────────────────────────────
  // Covers: menus, experiences, series, spaces, operational analytics, tickets,
  // capacity. Does NOT grant ProofPay economics, payouts, compensation, revenue,
  // user-edit, refunds, audit, or security access.
  FB_DIRECTOR: [
    "public:read",
    "account:read",
    "account:write",
    "series:read",
    "influencer:read",
    "partner:read",
    // Operational reads — orders list/detail and series list for this venue's events.
    // Uses admin:orders:read (scoped) NOT admin:audit:read (which also gates user/payout/referral APIs).
    "admin:orders:read",
    "admin:menus:read",
    "admin:menus:edit",
    "admin:tickets:read",
    "admin:tickets:write",
    "tickets:checkin",
    "admin:spaces:read",
    "admin:spaces:write",
    "admin:operations:read",
    "admin:operations:write",
    "admin:analytics:operations:read",
    // Operational writes — cancel/reopen orders, publish/unpublish series
    "admin:orders:write",
    "admin:experiences:write",
  ],

  // ─── Live-service host portal only ────────────────────────────────────────
  // RESTAURANT_SUPERVISOR accesses /host/* routes only.
  // No /admin shell access — any attempt to reach /admin returns 403.
  RESTAURANT_SUPERVISOR: [
    "public:read",
    "account:read",
    "host:reservations:checkin",
    "tickets:checkin",
    "admin:operations:read",
  ],

  RESTAURANT_HOST: ["public:read", "account:read", "host:reservations:checkin", "tickets:checkin"],
  // STREETSIDE_HOST is a referral-visibility role only: it can see the guests it
  // referred but must NOT drive operational reservation control (INVU table
  // open/bind, status transitions, comp-drink, party-size, walk-in, waitlist).
  // Those routes gate on "host:reservations:checkin", which only RESTAURANT_HOST
  // and SUPERADMIN hold. Do NOT re-add it here — see replit.md governed model.
  STREETSIDE_HOST: ["public:read", "account:read"],
  REFERRER: ["public:read", "account:read", "referrer:read"],
  SUPERADMIN: [
    "public:read", "account:read", "account:write", "series:read", "series:purchase",
    "influencer:read", "influencer:write", "partner:read", "partner:write",
    "ir:read", "ir:write", "hr:read", "hr:write", "staff:sops:read", "staff:sops:ack",
    "admin:audit:read", "admin:security:read", "admin:payments:refund", "admin:payouts:write",
    "admin:compensation:read", "admin:compensation:write", "admin:users:edit",
    "admin:menus:read", "admin:menus:edit",
    "admin:revenue:read", "admin:revenue:write",
    "host:reservations:checkin",
    "tickets:checkin", "admin:tickets:read", "admin:tickets:write",
    "admin:beneficiaries:summary", "admin:beneficiaries:detail", "admin:beneficiaries:write",
    "admin:spaces:read", "admin:spaces:write",
    "admin:operations:read", "admin:operations:write",
    "admin:analytics:operations:read",
    "admin:orders:read", "admin:orders:write", "admin:experiences:write",
  ],
};

export function hasPermission(roles: RoleKey[], perm: PermissionKey): boolean {
  if (roles.includes("SUPERADMIN")) return true;
  return roles.some((r) => ROLE_PERMISSIONS[r]?.includes(perm));
}
