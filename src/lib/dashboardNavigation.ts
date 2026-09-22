import { hasReferrerDashboardRole } from "@/lib/referrerDashboardRoles";

export type DashboardNavigation = {
  href: string;
  label: string;
};

export function dashboardNavigationForUser(
  roles: string[],
  hasLinkedReferrerIdentity = false,
): DashboardNavigation {
  if (roles.some((role) => ["SUPERADMIN", "FB_DIRECTOR", "ADMIN_COMMERCIAL", "ADMIN_IR", "ADMIN_HR"].includes(role))) {
    return { href: "/admin", label: "Admin Console" };
  }
  if (roles.includes("STREETSIDE_HOST") && !roles.includes("RESTAURANT_HOST")) {
    return { href: "/host/streetside", label: "Streetside" };
  }
  if (roles.some((role) => ["RESTAURANT_HOST", "STREETSIDE_HOST", "RESTAURANT_SUPERVISOR"].includes(role))) {
    return { href: "/host/dashboard", label: "Host Dashboard" };
  }
  if (roles.includes("INFLUENCER")) {
    return { href: "/influencer/dashboard", label: "My Dashboard" };
  }
  if (hasLinkedReferrerIdentity || hasReferrerDashboardRole(roles)) {
    return { href: "/referrer/dashboard", label: "Referrer Dashboard" };
  }
  if (roles.includes("INVESTOR")) {
    return { href: "/investor", label: "IR Portal" };
  }
  if (roles.some((role) => role.startsWith("STAFF_"))) {
    return { href: "/staff", label: "SOPs" };
  }
  return { href: "/my", label: "My Account" };
}