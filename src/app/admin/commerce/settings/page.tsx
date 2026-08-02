import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import CommerceSettingsPanel from "@/components/admin/commerce/CommerceSettingsPanel";

export const dynamic = "force-dynamic";

export default async function CommerceSettingsPage() {
  const session = await getServerSession(authOptions);
  const roles = ((session?.user as any)?.roles ?? []) as string[];
  if (!session?.user || !roles.includes("SUPERADMIN")) {
    redirect("/login?callbackUrl=/admin/commerce/settings");
  }
  return <CommerceSettingsPanel />;
}
