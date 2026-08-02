export function isHiringAdmin(role?: string | null) {
  return role === "SUPERADMIN" || role === "ADMIN_HR";
}
