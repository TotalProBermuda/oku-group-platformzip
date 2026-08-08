import { redirect } from "next/navigation";
import { getOptionalSession } from "@/server/auth/session";

export const dynamic = "force-dynamic";

export default async function HostIndexPage() {
  const session = await getOptionalSession();
  if (!session) redirect("/login?callbackUrl=/host");

  const roles = (session.roles as string[]) ?? [];

  if (roles.includes("STREETSIDE_HOST") && !roles.includes("RESTAURANT_HOST") && !roles.includes("SUPERADMIN")) {
    redirect("/host/streetside");
  }

  redirect("/host/dashboard");
}
