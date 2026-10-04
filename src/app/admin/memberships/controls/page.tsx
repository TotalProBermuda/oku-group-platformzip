import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import MembershipControls from "./MembershipControls";

export default async function MembershipControlsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.roles?.includes("SUPERADMIN")) redirect("/admin");
  return <MembershipControls />;
}
