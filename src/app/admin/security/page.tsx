import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import type { RoleKey } from "@/types/roles";
import {
  listSecurityAlerts,
  summarizeAlerts,
} from "@/server/security/listSecurityAlerts";
import SecurityAlertsPanel from "@/components/admin/SecurityAlertsPanel";

export const dynamic = "force-dynamic";

export default async function AdminSecurityPage() {
  const session = await getServerSession(authOptions);
  const roles = ((session?.user as { roles?: RoleKey[] } | undefined)?.roles ??
    []) as RoleKey[];
  if (!hasPermission(roles, "admin:security:read")) {
    redirect("/admin");
  }

  const lookbackHours = 24 * 7;
  const alerts = await listSecurityAlerts({
    lookbackMs: lookbackHours * 60 * 60 * 1000,
  });
  const summary = summarizeAlerts(alerts);

  return (
    <SecurityAlertsPanel
      initialAlerts={alerts}
      initialSummary={summary}
      lookbackHours={lookbackHours}
    />
  );
}
