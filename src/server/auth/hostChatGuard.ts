import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";

type HostChatAccess = {
  userId: string;
  isSuperadmin: boolean;
  canManageAllVenueChats: boolean;
  venueId: string | null;
};

type HostVenueAccess = HostChatAccess;

function forbidden(message = "Forbidden") {
  const error = new Error(message) as Error & { status: number };
  error.status = 403;
  return error;
}

/**
 * Host chat contains guest PII, so only restaurant-host staff may access it.
 * Non-superadmins are constrained to the venue on their host profile.
 */
export async function requireHostChatAccess(): Promise<HostChatAccess> {
  const { userId, roles } = await requireSession();
  return requireHostVenueAccessForSession(userId, roles, ["RESTAURANT_HOST", "RESTAURANT_SUPERVISOR"]);
}

/**
 * Resolve a venue-scoped host account for operational routes. Every
 * non-superadmin host role, including STREETSIDE_HOST, must have an assigned
 * RestaurantHostProfile. This prevents a caller from selecting another venue
 * with a route parameter or an arbitrary `findFirst()` fallback.
 */
export async function requireHostBookingAccess(): Promise<HostVenueAccess> {
  const { userId, roles } = await requireSession();
  return requireHostVenueAccessForSession(userId, roles, [
    "RESTAURANT_HOST",
    "RESTAURANT_SUPERVISOR",
    "FB_DIRECTOR",
    "ADMIN_COMMERCIAL",
    "STREETSIDE_HOST",
  ]);
}

async function requireHostVenueAccessForSession(
  userId: string,
  roles: string[],
  allowedNonSuperadminRoles: string[],
): Promise<HostVenueAccess> {
  const isSuperadmin = roles.includes("SUPERADMIN");
  const isAllowedHost = roles.some((role) => allowedNonSuperadminRoles.includes(role));
  const canManageAllVenueChats =
    isSuperadmin || roles.includes("RESTAURANT_SUPERVISOR");

  if (!isSuperadmin && !isAllowedHost) throw forbidden();
  if (isSuperadmin) {
    return { userId, isSuperadmin: true, canManageAllVenueChats, venueId: null };
  }

  const profile = await prisma.restaurantHostProfile.findUnique({
    where: { userId },
    select: { venueId: true },
  });
  if (!profile?.venueId) throw forbidden("Forbidden: no host profile associated with your account");

  return { userId, isSuperadmin: false, canManageAllVenueChats, venueId: profile.venueId };
}

export function assertHostChatVenue(access: HostChatAccess, venueId: string) {
  if (!access.isSuperadmin && access.venueId !== venueId) throw forbidden();
}

/** A normal host may work an unclaimed chat or their own; supervisors/admins manage the venue queue. */
export function assertHostCanManageChatSession(access: HostChatAccess, hostUserId: string | null) {
  if (!access.canManageAllVenueChats && hostUserId && hostUserId !== access.userId) {
    throw forbidden();
  }
}
