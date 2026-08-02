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
