"use client";
import { createContext, useContext } from "react";

interface AdminContextValue {
  roles: string[];
}

export const AdminContext = createContext<AdminContextValue>({ roles: [] });

export function useAdminRoles(): string[] {
  return useContext(AdminContext).roles;
}

export function useAdminCan(allowed: string[]): boolean {
  const roles = useAdminRoles();
  return roles.some((r) => allowed.includes(r));
}
