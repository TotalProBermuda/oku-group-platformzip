"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import AddToCalendar from "@/components/ui/AddToCalendar";

type Session = {
  id: string; title: string | null; subtitle?: string | null; description?: string | null;
  flyerImageUrl?: string | null; startsAt: string; endsAt: string; capacity: number;
  soldCount: number; status: string; ticketPrices?: Array<{ ticketTypeId: string; priceCents: number }>;
};

const cardStyle: React.CSSProperties = { background: "#fff", border: "1px solid #e5e0d8", borderRadius: 12, padding: 16 };
const EVENT_TIME_ZONE = "America/Panama";

function eventDateKey(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: EVENT_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(value);
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export default function ExperienceSessionsView({
  sessions, ticketTypes, seriesTitle, seriesDescription, seriesImage, checkoutHrefBase, venue, locale, labels,
}: {
  sessions: Session[]; seriesTitle: string; seriesDescription: string; seriesImage?: string | null;
  ticketTypes: Array<{ id: string; priceCents: number }>;
  checkoutHrefBase: string; venue: string; locale: string;
  labels: Record<string, string>;
}) {
  const [view, setView] = useState<"list" | "calendar">("list");
  const [month, setMonth] = useState(() => {
    const first = new Date(sessions[0]?.startsAt ?? Date.now());
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: EVENT_TIME_ZONE, year: "numeric", month: "numeric" }).formatToParts(first);
    const year = Number(parts.find((part) => part.type === "year")?.value);
    const monthNumber = Number(parts.find((part) => part.type === "month")?.value);
    return new Date(year, monthNumber - 1, 1);
  });
  const [selectedDate, setSelectedDate] = useState("");
  const localeTag = locale === "es" ? "es-PA" : locale === "pt" ? "pt-BR" : "en-US";
  const weekdays = Array.from({ length: 7 }, (_, index) => new Date(Date.UTC(2024, 0, 1 + index, 12)).toLocaleDateString(localeTag, { weekday: "short", timeZone: EVENT_TIME_ZONE }));
  const monthLabel = month.toLocaleDateString(localeTag, { month: "long", year: "numeric" });
  const sessionsByDate = useMemo(() => {
    const result = new Map<string, Session[]>();
    sessions.forEach((session) => {
      const key = eventDateKey(new Date(session.startsAt));
      result.set(key, [...(result.get(key) ?? []), session]);
    });
    return result;
  }, [sessions]);
  const monthCells = useMemo(() => {
    const offset = (new Date(month.getFullYear(), month.getMonth(), 1).getDay() + 6) % 7;
    const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    return [...Array(offset).fill(null), ...Array.from({ length: days }, (_, index) => index + 1)];
  }, [month]);
  const visibleSessions = view === "calendar" && selectedDate
    ? sessionsByDate.get(selectedDate) ?? []
    : sessions;

  function renderSession(session: Session) {
    const title = session.title || seriesTitle;
    const flyer = session.flyerImageUrl || seriesImage;
    const description = session.description || seriesDescription;
    const prices = ticketTypes.map((ticket) => session.ticketPrices?.find((override) => override.ticketTypeId === ticket.id)?.priceCents ?? ticket.priceCents);
    const fromPrice = prices.length ? Math.min(...prices) : null;
    return (
      <article key={session.id} style={{ ...cardStyle, overflow: "hidden" }}>
        {flyer ? <img src={flyer} alt={`${title} event artwork`} loading="lazy" style={{ width: "100%", maxHeight: 300, objectFit: "cover", borderRadius: 8, marginBottom: 14 }} /> : null}
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 12 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h3 style={{ color: "#1a1614", fontSize: 18, fontWeight: 600, margin: "0 0 4px" }}>{title}</h3>
            {session.subtitle ? <p style={{ color: "#7c7168", margin: "0 0 8px" }}>{session.subtitle}</p> : null}
            <p style={{ color: "#6b7280", fontSize: 13, margin: 0 }}>
              {new Date(session.startsAt).toLocaleDateString(localeTag, { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: EVENT_TIME_ZONE })}
              {" · "}{new Date(session.startsAt).toLocaleTimeString(localeTag, { hour: "numeric", minute: "2-digit", timeZone: EVENT_TIME_ZONE })}
              {" – "}{new Date(session.endsAt).toLocaleTimeString(localeTag, { hour: "numeric", minute: "2-digit", timeZone: EVENT_TIME_ZONE })}
            </p>
          </div>
          <div style={{ alignSelf: "flex-start", color: "#6b7280", fontSize: 12, whiteSpace: "nowrap" }}>
            {Math.max(0, session.capacity - session.soldCount)} {labels.left}
            {fromPrice !== null ? <div style={{ color: "#c41e3a", fontSize: 13, fontWeight: 700, marginTop: 5 }}>{labels.from} ${(fromPrice / 100).toFixed(2)}</div> : null}
          </div>
        </div>
        {description ? <p style={{ color: "#4b5563", fontSize: 14, lineHeight: 1.65, margin: "12px 0 0", whiteSpace: "pre-line" }}>{description}</p> : null}
        {session.status === "SCHEDULED" ? (
          <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "space-between", marginTop: 14 }}>
            <AddToCalendar sessionId={session.id} title={title} startsAt={session.startsAt} endsAt={session.endsAt} location={venue} description={description} labels={{ addToCalendar: labels.addToCalendar, google: labels.calGoogleCalendar, apple: labels.calAppleIcal, outlook: labels.calOutlook, yahoo: labels.calYahoo }} />
            <Link href={`${checkoutHrefBase}?sessionId=${encodeURIComponent(session.id)}`} className="btn btn-primary">{labels.selectTickets}</Link>
          </div>
        ) : null}
      </article>
    );
  }

  return (
    <div>
      <div role="group" aria-label={labels.sessionView} style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button type="button" aria-pressed={view === "list"} onClick={() => setView("list")} className={view === "list" ? "btn btn-primary btn-sm" : "btn btn-ghost btn-sm"}>{labels.listView}</button>
        <button type="button" aria-pressed={view === "calendar"} onClick={() => setView("calendar")} className={view === "calendar" ? "btn btn-primary btn-sm" : "btn btn-ghost btn-sm"}>{labels.calendarView}</button>
      </div>
      {view === "calendar" ? (
        <div style={{ ...cardStyle, marginBottom: 16 }}>
          <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
            <button type="button" className="btn btn-ghost btn-sm" aria-label={labels.previousMonth} onClick={() => { setMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1)); setSelectedDate(""); }}>←</button>
            <h3 aria-live="polite" style={{ color: "#1a1614", fontSize: 17, fontWeight: 600, margin: 0, textTransform: "capitalize" }}>{monthLabel}</h3>
            <button type="button" className="btn btn-ghost btn-sm" aria-label={labels.nextMonth} onClick={() => { setMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1)); setSelectedDate(""); }}>→</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 4 }}>
            {weekdays.map((day) => <div key={day} style={{ color: "#7c7168", fontSize: 11, fontWeight: 700, padding: "4px 0", textAlign: "center" }}>{day}</div>)}
            {monthCells.map((day, index) => {
              if (!day) return <div key={`blank-${index}`} />;
              const key = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const count = sessionsByDate.get(key)?.length ?? 0;
              return <button key={key} type="button" disabled={!count} aria-pressed={selectedDate === key} onClick={() => setSelectedDate(key)} style={{ aspectRatio: "1", border: selectedDate === key ? "2px solid #c41e3a" : "1px solid #eee7df", borderRadius: 8, background: count ? "#fff8f8" : "#fafaf9", color: count ? "#1a1614" : "#a8a29e", fontSize: 13, fontWeight: count ? 700 : 400, cursor: count ? "pointer" : "default" }}>{day}{count ? <span aria-label={`${count} ${labels.events}`} style={{ color: "#c41e3a", display: "block", fontSize: 9 }}>● {count}</span> : null}</button>;
            })}
          </div>
          {selectedDate ? <p style={{ color: "#6b7280", fontSize: 13, margin: "12px 0 0" }}>{new Date(`${selectedDate}T12:00:00Z`).toLocaleDateString(localeTag, { weekday: "long", month: "long", day: "numeric", timeZone: EVENT_TIME_ZONE })} · {visibleSessions.length} {labels.events}</p> : <p style={{ color: "#6b7280", fontSize: 13, margin: "12px 0 0" }}>{labels.chooseDate}</p>}
        </div>
      ) : null}
      <div style={{ display: "grid", gap: 12 }}>
        {visibleSessions.length ? visibleSessions.map(renderSession) : <p style={{ color: "#6b7280", fontSize: 14 }}>{labels.noSessions}</p>}
      </div>
    </div>
  );
}
