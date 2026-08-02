import { isValidLocale } from "@/i18n/config";
import { getTranslations } from "@/i18n/getTranslations";
import type { Locale } from "@/types/i18n";
import Link from "next/link";
import { localePath } from "@/i18n/utils";
import EventsCalendarView from "@/components/ui/EventsCalendarView";

interface Props { params: Promise<{ locale: string }> }

export default async function CalendarPage({ params }: Props) {
  const { locale } = await params;
  const safeLocale = isValidLocale(locale) ? (locale as Locale) : "en";

  const translations = await getTranslations(safeLocale, ["common"]);
  const c = translations.common as Record<string, string>;

  const heading =
    safeLocale === "es" ? "Calendario de Eventos"
    : safeLocale === "pt" ? "Calendário de Eventos"
    : "Events Calendar";

  return (
    <div>
      <div style={{ background: "#f8f5f3", borderBottom: "1px solid var(--color-border)", padding: "40px 24px 32px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: 12 }}>
            OKÜ Hospitality Group
          </div>
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "clamp(28px, 4vw, 48px)", fontWeight: 600, letterSpacing: "-0.02em", color: "var(--color-text)", marginBottom: 12, lineHeight: 1.1 }}>
            {c.calendarTitle ?? heading}
          </h1>
          <p style={{ fontSize: 16, color: "var(--color-text-secondary)", maxWidth: 520, lineHeight: 1.7, marginBottom: 20 }}>
            {c.calendarSubtitle ?? "Browse all upcoming sessions and find the right date for you."}
          </p>
          <Link href={localePath(safeLocale, "/experiences")} style={{ fontSize: 13, color: "#c41e3a", textDecoration: "none" }}>
            ← {safeLocale === "es" ? "Todas las Experiencias" : safeLocale === "pt" ? "Todas as Experiências" : "All Experiences"}
          </Link>
        </div>
      </div>

      <div className="page-container" style={{ paddingTop: 40, paddingBottom: 64 }}>
        <EventsCalendarView
          locale={safeLocale}
          labels={{
            calendarNoSessions: c.calendarNoSessions,
            calendarSelectDay: c.calendarSelectDay,
            calendarGetTickets: c.calendarGetTickets,
            calendarPrev: c.calendarPrev,
            calendarNext: c.calendarNext,
            left: c.left,
            sessionStatusScheduled: c.sessionStatusScheduled,
            sessionStatusSoldOut: c.sessionStatusSoldOut,
          }}
        />
      </div>
    </div>
  );
}
