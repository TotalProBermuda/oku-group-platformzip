"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface SessionRow {
  id: string;
  title: string | null;
  startsAt: string;
  endsAt: string;
  capacity: number;
  soldCount: number;
  status: string;
  series: {
    id: string;
    slug: string;
    title: string;
    venue: string | null;
    heroImageUrl: string | null;
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

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}
function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

export default function EventsCalendarView({ locale, labels: l }: Props) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setSessions([]);
    setSelectedDay(null);

    const after = new Date(year, month, 1).toISOString();
    const before = new Date(year, month + 1, 0, 23, 59, 59).toISOString();

    fetch(`/api/v1/sessions?after=${encodeURIComponent(after)}&before=${encodeURIComponent(before)}`)
      .then((r) => r.json())
      .then((data: { sessions: SessionRow[] }) => {
        setSessions(data.sessions ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [year, month]);

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  const sessionsByDay = new Map<number, SessionRow[]>();
  for (const session of sessions) {
    const d = new Date(session.startsAt);
    const day = d.getDate();
    if (!sessionsByDay.has(day)) sessionsByDay.set(day, []);
    sessionsByDay.get(day)!.push(session);
  }

  const selectedSessions = selectedDay ? (sessionsByDay.get(selectedDay) ?? []) : [];

  const monthLabel = new Date(year, month, 1).toLocaleDateString(
    locale === "es" ? "es-PA" : locale === "pt" ? "pt-BR" : "en-US",
    { month: "long", year: "numeric" }
  );

  function prevMonth() {
    if (month === 0) { setYear((y) => y - 1); setMonth(11); }
    else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setYear((y) => y + 1); setMonth(0); }
    else setMonth((m) => m + 1);
  }

  function fmtTime(d: string) {
    return new Date(d).toLocaleTimeString(
      locale === "es" ? "es-PA" : locale === "pt" ? "pt-BR" : "en-US",
      { hour: "numeric", minute: "2-digit" }
    );
  }

  return (
    <div>
      <div style={{ background: "white", border: "1px solid #e5e0d8", borderRadius: 16, overflow: "hidden", maxWidth: 760, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 24px", borderBottom: "1px solid #e5e0d8" }}>
          <button
            onClick={prevMonth}
            aria-label={l.calendarPrev ?? "Previous month"}
            style={{ background: "none", border: "1px solid #e5e0d8", borderRadius: 8, cursor: "pointer", padding: "6px 12px", fontSize: 14, color: "#6b7280" }}
          >
            ‹
          </button>
          <div style={{ fontFamily: "var(--font-heading)", fontSize: 20, fontWeight: 400, color: "#1a1614", textTransform: "capitalize" }}>
            {monthLabel}
          </div>
          <button
            onClick={nextMonth}
            aria-label={l.calendarNext ?? "Next month"}
            style={{ background: "none", border: "1px solid #e5e0d8", borderRadius: 8, cursor: "pointer", padding: "6px 12px", fontSize: 14, color: "#6b7280" }}
          >
            ›
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: "1px solid #f3f4f6" }}>
          {DAYS.map((d) => (
            <div key={d} style={{ padding: "8px 4px", textAlign: "center", fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: "#9ca3af", textTransform: "uppercase" }}>{d}</div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
          {Array.from({ length: firstDay }).map((_, i) => (
            <div key={`empty-${i}`} style={{ padding: "12px 4px", minHeight: 60 }} />
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const daySessions = sessionsByDay.get(day) ?? [];
            const hasSessions = daySessions.length > 0;
            const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
            const isSelected = selectedDay === day;
            return (
              <div
                key={day}
                onClick={() => hasSessions && setSelectedDay(isSelected ? null : day)}
                style={{
                  padding: "10px 4px 8px",
                  minHeight: 60,
                  textAlign: "center",
                  cursor: hasSessions ? "pointer" : "default",
                  background: isSelected ? "#fff1f2" : "transparent",
                  borderTop: "1px solid #f3f4f6",
                  transition: "background 0.1s",
                }}
              >
                <div style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  background: isToday ? "#c41e3a" : "transparent",
                  color: isToday ? "white" : isSelected ? "#c41e3a" : "#1a1614",
                  fontSize: 13,
                  fontWeight: isToday || isSelected ? 700 : 400,
                }}>
                  {day}
                </div>
                {hasSessions && (
                  <div style={{ display: "flex", justifyContent: "center", gap: 3, marginTop: 4, flexWrap: "wrap" }}>
                    {daySessions.slice(0, 3).map((_, idx) => (
                      <div key={idx} style={{ width: 5, height: 5, borderRadius: "50%", background: "#c41e3a" }} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {loading && (
          <div style={{ textAlign: "center", padding: 16, color: "#9ca3af", fontSize: 13 }}>Loading…</div>
        )}
      </div>

      <div style={{ maxWidth: 760, margin: "24px auto 0" }}>
        {!loading && selectedDay === null ? (
          <p style={{ textAlign: "center", color: "#9ca3af", fontSize: 14 }}>
            {l.calendarSelectDay ?? "Select a day to see sessions."}
          </p>
        ) : !loading && selectedSessions.length === 0 && selectedDay !== null ? (
          <p style={{ textAlign: "center", color: "#9ca3af", fontSize: 14 }}>
            {l.calendarNoSessions ?? "No sessions this month."}
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {selectedSessions.map((session) => (
              <div key={session.id} style={{ background: "white", border: "1px solid #e5e0d8", borderRadius: 12, padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, color: "#1a1614", marginBottom: 4 }}>{session.title ?? session.series.title}</div>
                  <div style={{ fontSize: 13, color: "#6b7280" }}>
                    {fmtTime(session.startsAt)} – {fmtTime(session.endsAt)}
                    {session.series.venue && <span style={{ marginLeft: 10, color: "#9ca3af" }}>· {session.series.venue}</span>}
                  </div>
                  <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>
                    {session.capacity - session.soldCount} {l.left ?? "left"}
                  </div>
                </div>
                <Link
                  href={`/${locale}/experiences/${session.series.slug}`}
                  className="btn btn-primary"
                  style={{ fontSize: 13, whiteSpace: "nowrap", padding: "8px 16px" }}
                >
                  {l.calendarGetTickets ?? "Get Tickets"}
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
