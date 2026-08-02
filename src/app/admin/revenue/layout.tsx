import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import RevenueSubNav from "@/components/admin/revenue/RevenueSubNav";

export default async function AdminRevenueLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  const roles: string[] = (session?.user as { roles?: string[] } | undefined)?.roles ?? [];
  if (!roles.some((r) => r === "SUPERADMIN" || r === "ADMIN_COMMERCIAL")) {
    redirect("/admin");
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <RevenueSubNav />
      <div>{children}</div>
    </div>
  );
}
