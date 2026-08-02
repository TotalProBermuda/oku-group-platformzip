import type { RoleKey, PermissionKey } from "@/types/roles";

export const ROLE_PERMISSIONS: Record<RoleKey, PermissionKey[]> = {
  VISITOR: ["public:read", "series:read"],
  ATTENDEE: ["public:read", "account:read", "account:write", "series:read", "series:purchase"],
  INFLUENCER: ["public:read", "account:read", "account:write", "series:read", "influencer:read", "influencer:write"],
  PARTNER: ["public:read", "account:read", "account:write", "series:read", "partner:read", "partner:write", "partner:invite:write", "partner:hosts:write", "partner:earnings:read"],
  INVESTOR: ["public:read", "account:read", "ir:read"],
  STAFF_OKU: ["public:read", "account:read", "staff:sops:read", "staff:sops:ack", "tickets:checkin"],
  STAFF_CATCH: ["public:read", "account:read", "staff:sops:read", "staff:sops:ack", "tickets:checkin"],
  ADMIN_COMMERCIAL: ["public:read", "account:read", "series:read", "influencer:read", "partner:read", "admin:payments:refund", "admin:payouts:write", "admin:audit:read", "admin:compensation:read", "admin:compensation:write", "admin:users:edit", "admin:menus:read", "admin:menus:edit", "admin:revenue:read", "admin:revenue:write", "admin:tickets:read", "admin:tickets:write", "tickets:checkin"],
  ADMIN_IR: ["public:read", "account:read", "ir:read", "ir:write", "admin:audit:read"],
  ADMIN_HR: ["public:read", "account:read", "hr:read", "hr:write", "admin:audit:read", "admin:users:edit"],
  ADMIN_FINANCE: ["public:read", "account:read", "admin:audit:read", "admin:payouts:write", "admin:beneficiaries:summary", "admin:beneficiaries:detail", "admin:beneficiaries:write"],
  RESTAURANT_HOST: ["public:read", "account:read", "host:reservations:checkin", "tickets:checkin"],
  // STREETSIDE_HOST is a referral-visibility role only: it can see the guests it
  // referred but must NOT drive operational reservation control (INVU table
  // open/bind, status transitions, comp-drink, party-size, walk-in, waitlist).
  // Those routes gate on "host:reservations:checkin", which only RESTAURANT_HOST
  // and SUPERADMIN hold. Do NOT re-add it here — see replit.md governed model.
  STREETSIDE_HOST: ["public:read", "account:read"],
  REFERRER: ["public:read", "account:read", "referrer:read"],
  SUPERADMIN: [
    "public:read","account:read","account:write","series:read","series:purchase",
    "influencer:read","influencer:write","partner:read","partner:write",
    "ir:read","ir:write","hr:read","hr:write","staff:sops:read","staff:sops:ack",
    "admin:audit:read","admin:security:read","admin:payments:refund","admin:payouts:write",
    "admin:compensation:read","admin:compensation:write","admin:users:edit",
    "admin:menus:read","admin:menus:edit",
    "admin:revenue:read","admin:revenue:write",
    "host:reservations:checkin",
    "tickets:checkin","admin:tickets:read","admin:tickets:write",
    "admin:beneficiaries:summary","admin:beneficiaries:detail","admin:beneficiaries:write"
  ],
};

export function hasPermission(roles: RoleKey[], perm: PermissionKey): boolean {
  if (roles.includes("SUPERADMIN")) return true;
  return roles.some((r) => ROLE_PERMISSIONS[r]?.includes(perm));
}
