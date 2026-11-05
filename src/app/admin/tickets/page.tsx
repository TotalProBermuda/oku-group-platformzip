import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import AdminTicketsPanel from "@/components/admin/tickets/AdminTicketsPanel";

export const dynamic = "force-dynamic";

export default async function AdminTicketsPage() {
  const session = await getServerSession(authOptions);
  const roles = session?.user?.roles ?? [];
  if (!session || !hasPermission(roles, "admin:tickets:read")) {
    redirect("/login?callbackUrl=/admin/tickets");
  }
  const canWrite = hasPermission(roles, "admin:tickets:write");
  return <AdminTicketsPanel canWrite={canWrite} />;
}
