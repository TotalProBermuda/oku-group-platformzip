"use client";

import { useEffect, useState } from "react";

// Must mirror admin:users:edit permission holders in src/lib/permissions.ts.
// FB_DIRECTOR does NOT have admin:users:edit — user management is SUPERADMIN-only.
const EDIT_ROLES = ["SUPERADMIN", "ADMIN_HR"];

export interface CurrentUserRoles {
  roles: string[] | null;
  loading: boolean;
  canEditUsers: boolean;
}

/**
 * Fetches the current admin's role set from /api/v1/me and exposes a
 * `canEditUsers` flag that mirrors the backend `admin:users:edit` permission
 * check used by /api/v1/admin/users/[id]/compensation.
 *
 * The API still authoritatively enforces permissions; this hook only drives
 * proactive read-only UI for unauthorized roles.
 */
export function useCurrentUserRoles(): CurrentUserRoles {
  const [roles, setRoles] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/v1/me")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const r = Array.isArray(d?.roles) ? d.roles : Array.isArray(d?.data?.roles) ? d.data.roles : [];
        setRoles(r);
      })
      .catch(() => { if (!cancelled) setRoles([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const canEditUsers = !!roles && roles.some((r) => EDIT_ROLES.includes(r));
  return { roles, loading, canEditUsers };
}
