import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import StreetsidePermissionsPanel from "@/components/admin/StreetsidePermissionsPanel";

export default async function AdminStreetsidePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.roles?.some((r: string) => r === "SUPERADMIN")) {
    redirect("/admin");
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 className="section-title" style={{ margin: 0 }}>
          Streetside Permissions
        </h2>
        <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: "6px 0 0" }}>
          Control which scan modes are active for each streetside host. Per-host overrides take precedence over the global default.
        </p>
      </div>
      <StreetsidePermissionsPanel />
    </div>
  );
}
