export const REFERRER_DASHBOARD_ROLES = [
  "SUPERADMIN",
  "REFERRER",
  "TAXI_DRIVER",
  "HOTEL_CONCIERGE",
  "CONCIERGE",
  "TOUR_GUIDE",
  "PROMOTER",
  "PRIVATE_NETWORK",
  "INFLUENCER_SUB_REFERRER",
  "INFLUENCER",
  "PARTNER",
  "PARTNER_SELLER",
] as const;

const REFERRER_DASHBOARD_ROLE_SET = new Set<string>(REFERRER_DASHBOARD_ROLES);

export function hasReferrerDashboardRole(roles: string[]): boolean {
  return roles.some((role) => REFERRER_DASHBOARD_ROLE_SET.has(role));
}