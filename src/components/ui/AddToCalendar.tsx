"use client";

import { useState } from "react";

interface Props {
  sessionId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  location?: string;
  description?: string;
  labels?: {
    addToCalendar?: string;
    google?: string;
    apple?: string;
    outlook?: string;
    yahoo?: string;
  };
}

function toGoogleDate(iso: string) {
  return iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export default function AddToCalendar({ sessionId, title, startsAt, endsAt, location, description, labels }: Props) {
  const [open, setOpen] = useState(false);

  const start = toGoogleDate(startsAt);
  const end = toGoogleDate(endsAt);
  const encodedTitle = encodeURIComponent(title);
  const encodedDesc = encodeURIComponent(description ?? "");
  const encodedLoc = encodeURIComponent(location ?? "");

  const googleUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodedTitle}&dates=${start}/${end}&details=${encodedDesc}&location=${encodedLoc}`;
  const yahooUrl = `https://calendar.yahoo.com/?v=60&view=d&type=20&title=${encodedTitle}&st=${start}&et=${end}&desc=${encodedDesc}&in_loc=${encodedLoc}`;
  const icsUrl = `/api/v1/sessions/${sessionId}/calendar.ics`;

  const calL = labels ?? {};

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", border: "1px solid #e5e0d8", borderRadius: 8, background: "white", cursor: "pointer", fontSize: 13, fontWeight: 500, color: "#374151" }}
      >
        <span>📅</span>
        {calL.addToCalendar ?? "Add to Calendar"}
        <span style={{ fontSize: 10, opacity: 0.6 }}>▼</span>
      </button>
      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 49 }} onClick={() => setOpen(false)} />
          <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 50, background: "white", border: "1px solid #e5e0d8", borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", padding: 6, minWidth: 180 }}>
            <a
              href={googleUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 6, fontSize: 13, color: "#1a1614", textDecoration: "none" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#f9f7f5")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              {calL.google ?? "Google Calendar"}
            </a>
            <a
              href={icsUrl}
              download
              onClick={() => setOpen(false)}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 6, fontSize: 13, color: "#1a1614", textDecoration: "none" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#f9f7f5")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              {calL.apple ?? "Apple iCal"}
            </a>
            <a
              href={icsUrl}
              download={`event-${sessionId}.ics`}
              onClick={() => setOpen(false)}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 6, fontSize: 13, color: "#1a1614", textDecoration: "none" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#f9f7f5")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              {calL.outlook ?? "Outlook"}
            </a>
            <a
              href={yahooUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 6, fontSize: 13, color: "#1a1614", textDecoration: "none" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#f9f7f5")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              {calL.yahoo ?? "Yahoo Calendar"}
            </a>
          </div>
        </>
      )}
    </div>
  );
}
