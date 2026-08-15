import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";

type HostChatAccess = {
  userId: string;
  isSuperadmin: boolean;
  venueId: string | null;
};

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
  const isSuperadmin = roles.includes("SUPERADMIN");
  const isRestaurantHost = roles.some((role) =>
    ["RESTAURANT_HOST", "RESTAURANT_SUPERVISOR"].includes(role),
  );

  if (!isSuperadmin && !isRestaurantHost) throw forbidden();
  if (isSuperadmin) return { userId, isSuperadmin: true, venueId: null };

  const profile = await prisma.restaurantHostProfile.findUnique({
    where: { userId },
    select: { venueId: true },
  });
  if (!profile?.venueId) throw forbidden("Forbidden: no host profile associated with your account");

  return { userId, isSuperadmin: false, venueId: profile.venueId };
}

export function assertHostChatVenue(access: HostChatAccess, venueId: string) {
  if (!access.isSuperadmin && access.venueId !== venueId) throw forbidden();
}
