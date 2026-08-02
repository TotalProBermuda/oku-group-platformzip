import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import type { RoleKey } from "@/types/roles";
import AdminTicketsPanel from "@/components/admin/tickets/AdminTicketsPanel";

export const dynamic = "force-dynamic";

export default async function AdminTicketsPage() {
  const session = await getServerSession(authOptions);
  const roles: string[] = (session?.user as any)?.roles ?? [];
  if (!session || !hasPermission(roles as RoleKey[], "admin:tickets:read")) {
    redirect("/login?callbackUrl=/admin/tickets");
  }
  const canWrite = hasPermission(roles as RoleKey[], "admin:tickets:write");
  return <AdminTicketsPanel canWrite={canWrite} />;
}
