import { prisma } from "@/lib/prisma";
import type { RoleKey } from "@/types/roles";

/**
 * Returns the database-authoritative roles for a user.
 *
 * Reservation-control routes use this instead of a JWT role snapshot: staff
 * assignments can change while a browser session remains valid. Callers must
 * fail closed if this lookup fails; a stale token must never preserve an
 * operational privilege after database access is unavailable.
 */
export async function getCurrentRoles(userId: string): Promise<RoleKey[]> {
  const roles = await prisma.userRole.findMany({
    where: { userId },
    select: { roleKey: true },
  });
  return roles.map((role) => role.roleKey);
}
