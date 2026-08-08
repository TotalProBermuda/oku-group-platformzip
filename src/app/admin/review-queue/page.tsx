import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import ReviewQueuePanel from "@/components/admin/ReviewQueuePanel";
import { prisma } from "@/lib/prisma";

export default async function AdminReviewQueuePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.roles?.some((r: string) => r === "SUPERADMIN")) {
    redirect("/admin");
  }

  const venues = await prisma.venue.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return <ReviewQueuePanel venues={venues} />;
}
