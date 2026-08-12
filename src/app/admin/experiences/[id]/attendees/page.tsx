import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isValidLocale } from "@/i18n/config";
import { getTranslations } from "@/i18n/getTranslations";
import type { Locale } from "@/types/i18n";
import { AttendeesTable } from "@/components/checkin/AttendeesTable";

export default async function AttendeesPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<any> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.roles?.some((r: string) => ["SUPERADMIN","FB_DIRECTOR","ADMIN_COMMERCIAL"].includes(r))) {
    redirect("/login");
  }

  const jar = await cookies();
  const cookieLocale = jar.get("oku_locale")?.value;
  const locale: Locale = isValidLocale(cookieLocale ?? "") ? (cookieLocale as Locale) : "en";
  const tr = await getTranslations(locale, ["admin"]);
  const adminTr = (tr.admin ?? {}) as Record<string, string>;

  const { id } = await params;
  const sp = await searchParams;
  const selectedSession = sp.session ?? "";

  const series = await prisma.series.findUnique({
    where: { id },
    include: { sessions: { orderBy: { startsAt: "asc" } } },
  });
  if (!series) redirect("/admin/experiences");

  const where: any = { order: { seriesId: id, status: "PAID" } };
  if (selectedSession) where.sessionId = selectedSession;

  const tickets = await prisma.ticket.findMany({
    where,
    orderBy: { createdAt: "asc" },
    include: {
      user: { select: { name: true, email: true } },
      ticketType: { select: { name: true, tierCode: true } },
      session: { select: { title: true, startsAt: true } },
    },
  });

  // Serialize dates to strings for client component
  const serializedTickets = tickets.map((tk) => ({
    ...tk,
    checkedInAt: tk.checkedInAt?.toISOString() ?? null,
    session: tk.session
      ? { ...tk.session, startsAt: tk.session.startsAt.toISOString() }
      : null,
  }));

  const serializedSessions = series.sessions.map((s) => ({
    id: s.id,
    title: s.title,
    startsAt: s.startsAt.toISOString(),
  }));

  return (
    <AttendeesTable
      seriesId={id}
      seriesTitle={series.title}
      capacityTotal={series.capacityTotal}
      sessions={serializedSessions}
      initialTickets={serializedTickets}
      selectedSession={selectedSession}
      locale={locale}
      translations={adminTr}
    />
  );
}
