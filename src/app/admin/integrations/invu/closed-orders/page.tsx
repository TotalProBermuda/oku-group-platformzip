import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import InvuClosedOrdersPanel from "@/components/admin/InvuClosedOrdersPanel";

export default async function AdminInvuClosedOrdersPage() {
  const session = (await getServerSession(authOptions)) as
    | { user?: { roles?: string[] } }
    | null;
  if (!session?.user?.roles?.some((r) => r === "SUPERADMIN")) {
    redirect("/admin");
  }

  const venues = await prisma.venue.findMany({
    where: {
      invuCredential: { is: { status: "CONNECTED" } },
    },
    select: { id: true, name: true, slug: true },
    orderBy: { name: "asc" },
  });

  return <InvuClosedOrdersPanel venues={venues} />;
}
