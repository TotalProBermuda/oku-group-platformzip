import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import TableSessionsPanel from "@/components/admin/TableSessionsPanel";
import { prisma } from "@/lib/prisma";

export default async function AdminTableSessionsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.roles?.some((r: string) => r === "SUPERADMIN")) {
    redirect("/admin");
  }

  const venues = await prisma.venue.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return <TableSessionsPanel venues={venues} />;
}
