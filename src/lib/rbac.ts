import type { RoleKey, PermissionKey } from "@/types/roles";
import { hasPermission } from "@/lib/permissions";

export class RBACError extends Error {
  status = 403;
  constructor(message = "Forbidden") {
    super(message);
  }
}

export function requirePermission(roles: RoleKey[], perm: PermissionKey): void {
  if (!hasPermission(roles, perm)) throw new RBACError();
}

/**
 * Require that the caller holds AT LEAST ONE of the listed permissions.
 * Use when a route is accessible to multiple roles whose capabilities
 * are expressed by different, non-overlapping permission keys.
 */
export function requireAnyPermission(roles: RoleKey[], ...perms: PermissionKey[]): void {
  if (!perms.some((p) => hasPermission(roles, p))) throw new RBACError();
}
