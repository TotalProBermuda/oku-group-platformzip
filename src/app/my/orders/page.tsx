import { redirect } from "next/navigation";
import { getOptionalSession } from "@/server/auth/session";
import { prisma } from "@/lib/prisma";
import { MyOrdersContent } from "@/components/account/MyOrdersContent";

export default async function MyOrdersPage() {
  const auth = await getOptionalSession();
  if (!auth) redirect("/login?callbackUrl=/my/orders");

  const orders = await prisma.order.findMany({
    where: { userId: auth.userId },
    orderBy: { createdAt: "desc" },
    include: {
      series:  { select: { title: true, slug: true, venue: true } },
      session: { select: { title: true, startsAt: true } },
      lineItems: true,
      tickets: { select: { id: true } },
    },
  });

  const serialized = orders.map((o) => ({
    id: o.id,
    status: o.status,
    totalCents: o.totalCents,
    createdAt: o.createdAt.toISOString(),
    series: o.series ?? null,
    session: o.session
      ? { title: o.session.title, startsAt: o.session.startsAt.toISOString() }
      : null,
    lineItems: o.lineItems.map((li) => ({
      id: li.id,
      nameSnapshot: li.nameSnapshot,
      qty: li.qty,
      totalCents: li.totalCents,
    })),
    tickets: o.tickets,
  }));

  return <MyOrdersContent orders={serialized} />;
}
