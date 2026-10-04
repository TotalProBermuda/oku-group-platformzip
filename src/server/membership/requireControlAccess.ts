import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";

export async function requireMembershipControlAccess() {
  const session = await getServerSession(authOptions);
  const roles = session?.user?.roles;
  if (!Array.isArray(roles) || !roles.includes("SUPERADMIN")) redirect("/admin");
}
