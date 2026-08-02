import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import InvuIntegrationPanel from "@/components/admin/InvuIntegrationPanel";
import { prisma } from "@/lib/prisma";

export default async function AdminInvuIntegrationPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.roles?.some((r: string) => r === "SUPERADMIN")) {
    redirect("/admin");
  }

  const venues = await prisma.venue.findMany({
    select: { id: true, name: true, slug: true },
    orderBy: { name: "asc" },
  });

  return <InvuIntegrationPanel venues={venues} />;
}
