"use client";

import { useState, useEffect, useMemo, type CSSProperties } from "react";
import Link from "next/link";
import EventArtwork from "@/components/ui/EventArtwork";
import { sessionArtworkCandidates, type SeriesArtwork, type SessionArtwork } from "@/lib/eventArtwork";

interface SessionRow extends SessionArtwork {
  id: string;
  title: string | null;
  subtitle?: string | null;
  flyerImageUrl?: string | null;
  startsAt: string;
  endsAt: string;
  capacity: number;
  soldCount: number;
  status: string;
  eventHosts?: Array<{ role: string; entity: { displayName: string; logoUrl?: string | null; websiteUrl?: string | null } }>;
  series: SeriesArtwork & {
    id: string;
    slug: string;
    title: string;
    venue: string | null;
    heroImageUrl: string | null;
    seriesHosts?: Array<{ role: string; entity: { displayName: string; logoUrl?: string | null; websiteUrl?: string | null } }>;
  };
}

interface Props {
  locale: string;
  labels: {
    calendarNoSessions?: string;
    calendarSelectDay?: string;
    calendarGetTickets?: string;
    calendarPrev?: string;
    calendarNext?: string;
    left?: string;
    sessionStatusScheduled?: string;
    sessionStatusSoldOut?: string;
  };
}

const TIME_ZONE = "America/Panama";
const DAY_NAMES: Record<string, string[]> = {
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  es: ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"],
  pt: ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"],
};
const shellStyle: CSSProperties = {
  background: "#fff",
  border: "1px solid #e5e0d8",
  borderRadius: 16,
  width: "100%",
  margin: 0,
};
const buttonStyle: CSSProperties = {
  alignItems: "center",
  background: "#fff",
  border: "1px solid #e5e0d8",
  borderRadius: 8,
  color: "#1a1614",
  cursor: "pointer",
  display: "flex",
  flexDirection: "column",
  gap: 3,
  justifyContent: "center",
  minHeight: 52,
  padding: "5px 2px",
  position: "relative",
  width: "100%",
};

function getPanamaDay(value: string) {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, day: "numeric" }).format(new Date(value)));
}

function getPanamaMonthBounds(year: number, month: number) {
  // Panama uses UTC-5 year-round. Build inclusive instant bounds from local month boundaries.
  const start = new Date(Date.UTC(year, month, 1, 5));
  const end = new Date(Date.UTC(year, month + 1, 1, 5) - 1);
  return { after: start.toISOString(), before: end.toISOString() };
}

export default function EventsCalendarView({ locale, labels: l }: Props) {
  const today = new Date();
  const localeTag = locale === "es" ? "es-PA" : locale === "pt" ? "pt-BR" : "en-US";
  const [year, setYear] = useState(() => Number(new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, year: "numeric" }).format(today)));
  const [month, setMonth] = useState(() => Number(new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, month: "numeric" }).format(today)) - 1);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [hoveredDay, setHoveredDay] = useState<number | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [mobileView, setMobileView] = useState<"list" | "calendar">("list");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setSessions([]);
    setSelectedDay(null);
    setHoveredDay(null);
    const { after, before } = getPanamaMonthBounds(year, month);

    fetch(`/api/v1/sessions?after=${encodeURIComponent(after)}&before=${encodeURIComponent(before)}&locale=${encodeURIComponent(locale)}`)
      .then((response) => {
        if (!response.ok) throw new Error("Unable to load sessions");
        return response.json();
      })
      .then((data: { sessions?: SessionRow[] }) => {
        if (active) setSessions(data.sessions ?? []);
      })
      .catch(() => {
        if (active) setSessions([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [year, month, locale]);

  const sessionsByDay = useMemo(() => {
    const grouped = new Map<number, SessionRow[]>();
    for (const session of sessions) {
      const day = getPanamaDay(session.startsAt);
      grouped.set(day, [...(grouped.get(day) ?? []), session]);
    }
    return grouped;
  }, [sessions]);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const monthLabel = new Date(Date.UTC(year, month, 15, 12)).toLocaleDateString(localeTag, {
    month: "long",
    year: "numeric",
    timeZone: TIME_ZONE,
  });
  const weekdayNames = DAY_NAMES[locale] ?? DAY_NAMES.en;
  const todayParts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE, year: "numeric", month: "numeric", day: "numeric",
  }).formatToParts(today);
  const todayYear = Number(todayParts.find((part) => part.type === "year")?.value);
  const todayMonth = Number(todayParts.find((part) => part.type === "month")?.value) - 1;
  const todayDay = Number(todayParts.find((part) => part.type === "day")?.value);
  const selectedSessions = selectedDay === null ? sessions : (sessionsByDay.get(selectedDay) ?? []);
  const viewEventLabel = locale === "es" ? "Ver evento" : locale === "pt" ? "Ver evento" : "View event";
  const buyTicketsLabel = locale === "es" ? "Comprar entradas" : locale === "pt" ? "Comprar ingressos" : (l.calendarGetTickets ?? "Buy tickets");
  const monthSessionsLabel = locale === "es" ? "Eventos de este mes" : locale === "pt" ? "Eventos deste mês" : "Events this month";
  const noSessionsLabel = l.calendarNoSessions ?? (locale === "es" ? "No hay eventos este mes." : locale === "pt" ? "Não há eventos neste mês." : "No events this month.");
  const selectDayLabel = l.calendarSelectDay ?? (locale === "es" ? "Selecciona un día para filtrar los eventos." : locale === "pt" ? "Selecione um dia para filtrar os eventos." : "Select a day to filter events.");

  function changeMonth(direction: -1 | 1) {
    const next = new Date(year, month + direction, 1);
    setYear(next.getFullYear());
    setMonth(next.getMonth());
  }

  function formatDate(value: string) {
    return new Date(value).toLocaleDateString(localeTag, {
      weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: TIME_ZONE,
    });
  }

  function formatTime(value: string) {
    return new Date(value).toLocaleTimeString(localeTag, {
      hour: "numeric", minute: "2-digit", timeZone: TIME_ZONE,
    });
  }

  function eventLinks(session: SessionRow) {
    return {
      view: `/${locale}/experiences/${session.series.slug}?sessionId=${encodeURIComponent(session.id)}#session-${encodeURIComponent(session.id)}`,
      buy: `/${locale}/checkout/${session.series.slug}?sessionId=${encodeURIComponent(session.id)}`,
    };
  }

  function sessionCard(session: SessionRow, compact = false) {
    const title = session.series.title;
    const sessionTitle = session.title ?? null;
    const artwork = sessionArtworkCandidates(session, locale, session.series);
    const coHosts = [...(session.series.seriesHosts ?? []), ...(session.eventHosts ?? [])].filter((host) => host.role === "CO_HOST");
    const { view, buy } = eventLinks(session);
    return (
      <article id={`session-${session.id}`} key={session.id} style={{
        background: "#fff", border: "1px solid #e5e0d8", borderRadius: 14, overflow: "hidden",
        display: "grid", gridTemplateColumns: compact ? "minmax(88px, 120px) minmax(0, 1fr)" : "minmax(110px, 190px) minmax(0, 1fr)",
        scrollMarginTop: 96,
      }}>
        {artwork.length ? (
          <div style={{ aspectRatio: "4 / 5", width: "100%", background: "linear-gradient(135deg,#f4eee8,#e8d9d0)" }}><EventArtwork candidates={artwork} alt={`${title} artwork`} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "contain" }} /></div>
        ) : <div aria-hidden="true" style={{ aspectRatio: "4 / 5", background: "linear-gradient(135deg,#f4eee8,#e8d9d0)" }} />}
        <div style={{ minWidth: 0, padding: compact ? 12 : 16, display: "flex", flexDirection: "column", justifyContent: "center", gap: 6 }}>
          <div style={{ color: "#1a1614", fontSize: compact ? 15 : 17, fontWeight: 650, lineHeight: 1.3 }}>{title}</div>
          {sessionTitle ? <div style={{ color: "#7c7168", fontSize: 14, fontWeight: 600 }}>{sessionTitle}</div> : null}
          {session.subtitle ? <div style={{ color: "#6b7280", fontSize: 13 }}>{session.subtitle}</div> : null}
          {coHosts.length ? <div style={{ color: "#7c7168", fontSize: 12 }}><strong>Co-hosted by:</strong> {[...new Set(coHosts.map((host) => host.entity.displayName))].join(", ")}</div> : null}
          <div style={{ color: "#6b7280", fontSize: 13 }}>{formatDate(session.startsAt)} · {formatTime(session.startsAt)}</div>
          {session.series.venue ? <div style={{ color: "#8b8179", fontSize: 12 }}>{session.series.venue}</div> : null}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
            <Link href={view} className="btn btn-ghost btn-sm" style={{ minHeight: 44, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{viewEventLabel}</Link>
            <Link href={buy} className="btn btn-primary btn-sm" style={{ minHeight: 44, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{buyTicketsLabel}</Link>
          </div>
        </div>
      </article>
    );
  }

  return (
    <section aria-label={locale === "es" ? "Calendario de eventos" : locale === "pt" ? "Calendário de eventos" : "Events calendar"}>
      <style jsx global>{`
        .events-calendar-layout { display: grid; grid-template-columns: minmax(0, 2fr) minmax(300px, 1fr); grid-template-areas: "calendar month"; gap: 24px; align-items: start; }
        .events-calendar-column { grid-area: calendar; min-width: 0; position: sticky; top: 88px; align-self: start; }
        .events-month-column { grid-area: month; min-width: 0; background: #fff; border: 1px solid #e5e0d8; border-radius: 16px; padding: 20px; max-height: calc(100vh - 104px); overflow-y: auto; overscroll-behavior: contain; scrollbar-gutter: stable; }
        .events-month-title { color: #1a1614; font-family: var(--font-heading); font-size: 24px; font-weight: 400; margin: 0 0 16px; }
        .events-month-cards { display: grid; gap: 12px; }
        .events-session-card { min-width: 0; }
        .events-mobile-tabs { display: none; }
        @media (max-width: 767px) {
          .events-mobile-tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px; }
           .events-calendar-layout { grid-template-columns: minmax(0, 1fr); grid-template-areas: "month" "calendar"; gap: 16px; }
          .events-calendar-column { position: static; top: auto; }
          .events-month-column { max-height: none; overflow: visible; overscroll-behavior: auto; scrollbar-gutter: auto; }
          .events-calendar-column[data-mobile-hidden="true"], .events-month-column[data-mobile-hidden="true"] { display: none; }
          .events-month-column { padding: 16px; }
          .events-month-title { font-size: 22px; }
        }
      `}</style>
      <div className="events-mobile-tabs" role="tablist" aria-label={locale === "es" ? "Vista de eventos" : locale === "pt" ? "Visualização de eventos" : "Event view"}>
        {(["list", "calendar"] as const).map((view) => {
          const selected = mobileView === view;
          const label = view === "list"
            ? (locale === "es" ? "Lista" : locale === "pt" ? "Lista" : "List")
            : (locale === "es" ? "Calendario" : locale === "pt" ? "Calendário" : "Calendar");
          return <button key={view} type="button" role="tab" aria-selected={selected} onClick={() => setMobileView(view)} className={selected ? "btn btn-primary btn-sm" : "btn btn-ghost btn-sm"} style={{ minHeight: 44 }}>{label}</button>;
        })}
      </div>
      <div className="events-calendar-layout">
        <div id="events-month-panel" className="events-month-column" data-mobile-hidden={mobileView !== "list"}>
          <div style={{ alignItems: "baseline", display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 14 }}>
            <h2 className="events-month-title">{selectedDay === null ? monthSessionsLabel : new Date(Date.UTC(year, month, selectedDay, 12)).toLocaleDateString(localeTag, { weekday: "long", month: "long", day: "numeric", timeZone: TIME_ZONE })}</h2>
            {selectedDay !== null ? <button type="button" onClick={() => setSelectedDay(null)} className="btn btn-ghost btn-sm" style={{ minHeight: 44 }}>{locale === "es" ? "Ver todo el mes" : locale === "pt" ? "Ver o mês todo" : "Show all dates"}</button> : null}
          </div>
          {selectedSessions.length ? <div className="events-month-cards">{selectedSessions.map((session) => sessionCard(session, true))}</div>
            : !loading ? <p style={{ color: "#6b7280", fontSize: 14 }}>{selectedDay === null ? noSessionsLabel : selectDayLabel}</p> : null}
        </div>

        <div id="events-calendar-panel" className="events-calendar-column" data-mobile-hidden={mobileView !== "calendar"}>
          <div style={shellStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "16px clamp(12px, 4vw, 24px)", borderBottom: "1px solid #e5e0d8" }}>
              <button type="button" onClick={() => changeMonth(-1)} aria-label={l.calendarPrev ?? "Previous month"} style={{ ...buttonStyle, width: 48, minHeight: 48, fontSize: 22 }}>‹</button>
              <h2 aria-live="polite" style={{ fontFamily: "var(--font-heading)", fontSize: "clamp(17px, 4vw, 22px)", fontWeight: 400, color: "#1a1614", textTransform: "capitalize", margin: 0 }}>{monthLabel}</h2>
              <button type="button" onClick={() => changeMonth(1)} aria-label={l.calendarNext ?? "Next month"} style={{ ...buttonStyle, width: 48, minHeight: 48, fontSize: 22 }}>›</button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", borderBottom: "1px solid #f3f4f6" }}>
              {weekdayNames.map((day, index) => <div key={index} style={{ padding: "10px 2px", textAlign: "center", fontSize: 11, fontWeight: 700, color: "#7c7168", textTransform: "uppercase" }}>{day}</div>)}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", padding: "4px clamp(4px, 1vw, 10px) 10px", gap: 2 }}>
              {Array.from({ length: firstDay }).map((_, index) => <div key={`empty-${index}`} aria-hidden="true" />)}
              {Array.from({ length: daysInMonth }).map((_, index) => {
                const day = index + 1;
                const daySessions = sessionsByDay.get(day) ?? [];
                const active = daySessions.length > 0;
                const isToday = day === todayDay && month === todayMonth && year === todayYear;
                const selected = selectedDay === day;
                const preview = hoveredDay === day ? daySessions.slice(0, 3) : [];
                return (
                  <div key={day} style={{ minWidth: 0, position: "relative", zIndex: hoveredDay === day ? 3 : 0 }}
                    onPointerEnter={(event) => { if (event.pointerType === "mouse" && active) setHoveredDay(day); }}
                    onPointerLeave={(event) => { if (event.pointerType === "mouse") setHoveredDay((current) => current === day ? null : current); }}>
                    <button type="button" disabled={!active} aria-pressed={selected}
                      aria-label={`${new Date(Date.UTC(year, month, day, 12)).toLocaleDateString(localeTag, { weekday: "long", month: "long", day: "numeric", timeZone: TIME_ZONE })}${active ? `, ${daySessions.length} ${daySessions.length === 1 ? "event" : "events"}` : ""}`}
                      onClick={() => {
                        if (!active) return;
                        setSelectedDay(selected ? null : day);
                      }}
                      onFocus={() => active && setHoveredDay(day)}
                      onBlur={(event) => { if (!event.currentTarget.parentElement?.contains(event.relatedTarget as Node | null)) setHoveredDay(null); }}
                      style={{ ...buttonStyle, minHeight: 54, background: selected ? "#fff1f2" : active ? "#fffafa" : "#fff", borderColor: selected ? "#c41e3a" : active ? "#f0d4d9" : "#f0ece8", color: isToday ? "#fff" : active ? "#1a1614" : "#a8a29e" }}>
                      <span style={{ alignItems: "center", background: isToday ? "#c41e3a" : "transparent", borderRadius: 99, display: "inline-flex", height: 26, justifyContent: "center", width: 26, fontSize: 13, fontWeight: isToday || selected ? 700 : 500 }}>{day}</span>
                      {active ? <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 99, background: "#c41e3a" }} /> : <span aria-hidden="true" style={{ height: 6 }} />}
                    </button>
                    {preview.length > 0 ? <div role="group" aria-label={`Event previews for ${day}`} style={{ background: "#fff", border: "1px solid #e5e0d8", borderRadius: 12, boxShadow: "0 12px 32px rgba(26,22,20,.18)", left: index % 7 < 4 ? 0 : undefined, padding: 8, position: "absolute", right: index % 7 < 4 ? undefined : 0, top: 58, width: "min(360px, calc(100vw - 48px))", zIndex: 4, display: "grid", gap: 8 }}>
                      {preview.map((session) => sessionCard(session, true))}
                      {daySessions.length > preview.length ? <p style={{ color: "#6b7280", fontSize: 12, margin: "8px 4px 2px" }}>+{daySessions.length - preview.length} more · select date to view all</p> : null}
                    </div> : null}
                  </div>
                );
              })}
            </div>
            {loading ? <div role="status" style={{ textAlign: "center", padding: 14, color: "#6b7280", fontSize: 13 }}>Loading events…</div> : null}
          </div>
        </div>
      </div>
    </section>
  );
}