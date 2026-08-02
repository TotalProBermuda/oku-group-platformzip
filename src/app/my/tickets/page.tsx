import { redirect } from "next/navigation";
import { getOptionalSession } from "@/server/auth/session";
import { prisma } from "@/lib/prisma";
import { MyTicketsContent } from "@/components/account/MyTicketsContent";

export default async function MyTicketsPage() {
  const auth = await getOptionalSession();
  if (!auth) redirect("/login?callbackUrl=/my/tickets");

  const tickets = await prisma.ticket.findMany({
    where: { userId: auth.userId, ticketStatus: { in: ["ISSUED", "CHECKED_IN"] } },
    orderBy: { createdAt: "desc" },
    include: {
      session: {
        include: { series: { select: { title: true, slug: true, venue: true, city: true } } },
      },
      ticketType: { select: { name: true, tierCode: true } },
    },
  });

  const serialized = tickets.map((tk) => ({
    id: tk.id,
    code: tk.code,
    ticketStatus: tk.ticketStatus,
    attendeeName: tk.attendeeName,
    createdAt: tk.createdAt.toISOString(),
    session: tk.session
      ? {
          startsAt: tk.session.startsAt.toISOString(),
          series: tk.session.series
            ? {
                title: tk.session.series.title,
                slug: tk.session.series.slug,
                venue: tk.session.series.venue ?? "",
                city: tk.session.series.city,
              }
            : null,
        }
      : null,
    ticketType: tk.ticketType ?? null,
  }));

  return <MyTicketsContent tickets={serialized} userName={auth.session.user.name ?? null} />;
}
