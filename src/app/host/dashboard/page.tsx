import { redirect } from "next/navigation";
import { getOptionalSession } from "@/server/auth/session";
import HostDashboardClient from "@/components/host/HostDashboardClient";

export const dynamic = "force-dynamic";

export default async function HostDashboardPage() {
  const session = await getOptionalSession();
  if (!session) redirect("/login?callbackUrl=/host/dashboard");

  const roles = session.roles as string[];
  const isRestaurantHost = roles.some((r) =>
    ["RESTAURANT_HOST", "RESTAURANT_SUPERVISOR", "FB_DIRECTOR", "ADMIN_COMMERCIAL", "SUPERADMIN"].includes(r)
  );
  if (!isRestaurantHost) redirect("/login");

  return <HostDashboardClient />;
}
