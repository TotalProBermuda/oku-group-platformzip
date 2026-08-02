"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { QrCode, X, Scan, ScanLine } from "lucide-react";
import type { CheckInEvent } from "@/lib/checkInEmitter";

interface Ticket {
  id: string;
  code: string;
  attendeeName: string | null;
  attendeeEmail: string | null;
  ticketStatus: string;
  checkedInAt: string | Date | null;
  ticketType: { name: string; tierCode: string | null } | null;
  session: { title: string | null; startsAt: string | Date } | null;
  user: { name: string | null; email: string | null };
}

interface Session {
  id: string;
  title: string | null;
  startsAt: string | Date;
}

interface Props {
  seriesId: string;
  seriesTitle: string;
  capacityTotal: number | null;
  sessions: Session[];
  initialTickets: Ticket[];
  selectedSession: string;
  locale: string;
  translations: Record<string, string>;
}

function fmtDate(d: Date | string | null | undefined, locale: string) {
  if (!d) return "—";
  const loc = locale === "es" ? "es-PA" : locale === "pt" ? "pt-BR" : "en-US";
  return new Date(d).toLocaleDateString(loc, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function QRCell({ code }: { code: string }) {
  return (
    <div style={{ width: 40, height: 40, background: "#1a1614", borderRadius: 6, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2 }}>
      <div style={{ width: 20, height: 20, position: "relative" }}>
        {/* Mini QR-style decoration */}
        <div style={{ position: "absolute", top: 0, left: 0, width: 7, height: 7, border: "2px solid rgba(255,255,255,0.7)", borderRadius: 1 }} />
        <div style={{ position: "absolute", top: 0, right: 0, width: 7, height: 7, border: "2px solid rgba(255,255,255,0.7)", borderRadius: 1 }} />
        <div style={{ position: "absolute", bottom: 0, left: 0, width: 7, height: 7, border: "2px solid rgba(255,255,255,0.7)", borderRadius: 1 }} />
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 4, height: 4, background: "rgba(255,255,255,0.5)", borderRadius: 0.5 }} />
      </div>
      <span style={{ fontSize: 6, color: "rgba(255,255,255,0.5)", fontFamily: "monospace" }}>{code.slice(-4)}</span>
    </div>
  );
}

interface QRScannerModalProps {
  seriesId: string;
  onClose: () => void;
}

function QRScannerModal({ seriesId, onClose }: QRScannerModalProps) {
  const [scannerReady, setScannerReady] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string; result?: string } | null>(null);
  const scannerRef = useRef<any>(null);
  const instanceRef = useRef<any>(null);
  const isRunningRef = useRef(false);
  const cooldownRef = useRef(false);
  const activeRef = useRef(true);
  const resultTimer = useRef<ReturnType<typeof setTimeout>>();

  // Load library once; tear down scanner on unmount
  useEffect(() => {
    activeRef.current = true;
    import("html5-qrcode").then(({ Html5Qrcode }) => {
      scannerRef.current = Html5Qrcode;
      setScannerReady(true);
    }).catch(() => setCameraError(true));

    return () => {
      activeRef.current = false;
      if (resultTimer.current) clearTimeout(resultTimer.current);
      if (instanceRef.current && isRunningRef.current) {
        instanceRef.current.stop().catch(() => {});
        isRunningRef.current = false;
      }
      instanceRef.current = null;
    };
  }, []);

  // Start scanner once (no cooldown in deps — cooldown is tracked via ref)
  useEffect(() => {
    if (!scannerReady || !scannerRef.current || cameraError) return;

    const scanner = new scannerRef.current("qr-modal-reader");
    instanceRef.current = scanner;

    scanner.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 220, height: 220 }, aspectRatio: 1 },
      async (text: string) => {
        if (!activeRef.current || cooldownRef.current) return;
        cooldownRef.current = true;
        const match = text.match(/\/checkin\/([A-Z0-9\-]+)/i);
        const code = (match ? match[1] : text.trim()).toUpperCase();
        try {
          const res = await fetch("/api/v1/checkin/validate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code, deviceInfo: "admin-qr-modal" }),
          });
          const data = await res.json();
          if (activeRef.current) setResult(data);
          if (navigator.vibrate) {
            navigator.vibrate(data.result === "VALID" ? [80, 40, 80] : [60, 30, 60, 30, 60]);
          }
          if (resultTimer.current) clearTimeout(resultTimer.current);
          resultTimer.current = setTimeout(() => {
            if (activeRef.current) { setResult(null); cooldownRef.current = false; }
          }, 3000);
        } catch {
          if (activeRef.current) setResult({ ok: false, message: "Network error", result: "INVALID" });
          setTimeout(() => { if (activeRef.current) { setResult(null); cooldownRef.current = false; } }, 2000);
        }
      },
      undefined
    ).then(() => {
      isRunningRef.current = true;
    }).catch(() => {
      if (activeRef.current) setCameraError(true);
    });
  }, [scannerReady, cameraError]);

  async function handleManual(e: React.FormEvent) {
    e.preventDefault();
    const code = manualCode.trim().toUpperCase();
    if (!code) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/v1/checkin/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, deviceInfo: "admin-manual" }),
      });
      const data = await res.json();
      setResult(data);
      setManualCode("");
      if (resultTimer.current) clearTimeout(resultTimer.current);
      resultTimer.current = setTimeout(() => setResult(null), 3000);
    } finally {
      setSubmitting(false);
    }
  }

  const isValid = result?.result === "VALID";
  const resultBg = isValid ? "#16a34a" : result?.result === "ALREADY_CHECKED_IN" ? "#d97706" : "#dc2626";

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(0,0,0,0.92)",
      display: "flex", flexDirection: "column",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <ScanLine size={18} color="#c41e3a" />
          <span style={{ color: "white", fontWeight: 600, fontSize: 16 }}>QR Check-in Scanner</span>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.6)", padding: 4 }}>
          <X size={22} />
        </button>
      </div>

      {/* Scanner area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 20px", gap: 20 }}>
        {cameraError ? (
          <div style={{ textAlign: "center", color: "rgba(255,255,255,0.5)", fontSize: 14 }}>
            <QrCode size={40} style={{ marginBottom: 12, opacity: 0.4 }} />
            <div>Camera not available</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Use manual entry below</div>
          </div>
        ) : (
          <div style={{ position: "relative", width: "100%", maxWidth: 320 }}>
            {/* Scan frame decoration */}
            <div style={{ position: "absolute", inset: -2, zIndex: 1, pointerEvents: "none" }}>
              {[["top", "left"], ["top", "right"], ["bottom", "left"], ["bottom", "right"]].map(([v, h]) => (
                <div key={`${v}-${h}`} style={{
                  position: "absolute",
                  [v]: 0, [h]: 0,
                  width: 20, height: 20,
                  borderTop: v === "top" ? "3px solid #c41e3a" : "none",
                  borderBottom: v === "bottom" ? "3px solid #c41e3a" : "none",
                  borderLeft: h === "left" ? "3px solid #c41e3a" : "none",
                  borderRight: h === "right" ? "3px solid #c41e3a" : "none",
                }} />
              ))}
            </div>
            <div id="qr-modal-reader" style={{ width: "100%", borderRadius: 8, overflow: "hidden", background: "#000" }} />
          </div>
        )}

        {/* Result overlay */}
        {result && (
          <div style={{
            position: "fixed", bottom: 160, left: "50%", transform: "translateX(-50%)",
            background: resultBg, color: "white",
            padding: "14px 28px", borderRadius: 12,
            fontSize: 15, fontWeight: 600, textAlign: "center",
            boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
            minWidth: 200,
          }}>
            <div style={{ fontSize: 22, marginBottom: 6 }}>{isValid ? "✓" : "✗"}</div>
            {result.message}
          </div>
        )}

        {/* Manual entry */}
        <div style={{ width: "100%", maxWidth: 320 }}>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8, textAlign: "center" }}>
            Or enter ticket code manually
          </div>
          <form onSubmit={handleManual} style={{ display: "flex", gap: 8 }}>
            <input
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value.toUpperCase())}
              placeholder="TICKET CODE"
              style={{
                flex: 1, padding: "12px 14px",
                background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: 8, color: "white", fontSize: 14, fontFamily: "monospace",
                letterSpacing: "0.05em",
              }}
            />
            <button
              type="submit"
              disabled={submitting || !manualCode.trim()}
              style={{
                padding: "12px 18px", borderRadius: 8, border: "none",
                background: "#c41e3a", color: "white", fontWeight: 600, fontSize: 14,
                cursor: submitting ? "wait" : "pointer",
                opacity: !manualCode.trim() ? 0.5 : 1,
              }}
            >
              {submitting ? "…" : "Check In"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export function AttendeesTable({ seriesId, seriesTitle, capacityTotal, sessions, initialTickets, selectedSession, locale, translations: tr }: Props) {
  const t = (key: string) => tr[key] ?? key;
  const [tickets, setTickets] = useState<Ticket[]>(initialTickets);
  const [liveCount, setLiveCount] = useState(0);
  const [connected, setConnected] = useState(false);
  const [checkingIn, setCheckingIn] = useState<string | null>(null);
  const [showQRModal, setShowQRModal] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  const checkedIn = tickets.filter((tk) => tk.ticketStatus === "CHECKED_IN").length;
  const total = tickets.length;
  const pct = total > 0 ? Math.round((checkedIn / total) * 100) : 0;

  const applyEvent = useCallback((event: CheckInEvent) => {
    setTickets((prev) =>
      prev.map((tk) =>
        tk.id === event.ticketId
          ? { ...tk, ticketStatus: "CHECKED_IN", checkedInAt: event.checkedInAt }
          : tk
      )
    );
    setLiveCount((n) => n + 1);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams({ seriesId });
    if (selectedSession) params.set("sessionId", selectedSession);

    const es = new EventSource(`/api/v1/events/checkin/stream?${params}`);
    esRef.current = es;

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);

    es.onmessage = (e) => {
      try {
        const event: CheckInEvent = JSON.parse(e.data);
        applyEvent(event);
      } catch {}
    };

    return () => {
      es.close();
      setConnected(false);
    };
  }, [seriesId, selectedSession, applyEvent]);

  async function handleAdminCheckIn(ticketId: string) {
    setCheckingIn(ticketId);
    try {
      await fetch(`/api/v1/admin/experiences/${seriesId}/attendees`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketId, method: "ADMIN_OVERRIDE" }),
      });
    } finally {
      setCheckingIn(null);
    }
  }

  return (
    <>
      {showQRModal && (
        <QRScannerModal seriesId={seriesId} onClose={() => setShowQRModal(false)} />
      )}

      <div>
        {/* Header */}
        <div style={{ background: "white", borderBottom: "1px solid #e5e0d8", padding: "20px 0" }}>
          <div className="page-container" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
            <div>
              <Link href={`/admin/experiences/${seriesId}`} style={{ fontSize: 13, color: "#9ca3af", textDecoration: "none" }}>← {seriesTitle}</Link>
              <h1 style={{ fontFamily: "var(--font-heading)", fontSize: 26, fontWeight: 400, color: "#1a1614", margin: "4px 0 0" }}>{t("attendeesAndCheckin")}</h1>
            </div>
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              {/* Live indicator */}
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: connected ? "#22c55e" : "#9ca3af",
                  boxShadow: connected ? "0 0 0 3px rgba(34,197,94,0.25)" : "none",
                  animation: connected ? "pulse 2s infinite" : "none",
                  transition: "all 0.3s",
                }} />
                <span style={{ fontSize: 11, color: connected ? "#22c55e" : "#9ca3af", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  {connected ? "Live" : "Connecting…"}
                </span>
                {liveCount > 0 && (
                  <span style={{ fontSize: 11, color: "#6b7280" }}>({liveCount} scan{liveCount !== 1 ? "s" : ""})</span>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 20, fontWeight: 700, color: "#1a1614" }}>{checkedIn} / {total}</span>
                <span style={{ fontSize: 12, color: "#9ca3af" }}>{t("checkedInLabel")}</span>
              </div>
              {/* QR Scanner button — always visible, designed for mobile */}
              <button
                onClick={() => setShowQRModal(true)}
                style={{
                  display: "flex", alignItems: "center", gap: 7,
                  padding: "9px 16px", borderRadius: 8,
                  background: "#1a1614", border: "none",
                  color: "white", fontWeight: 600, fontSize: 13,
                  cursor: "pointer", letterSpacing: "0.02em",
                }}
              >
                <Scan size={15} />
                Scan QR
              </button>
            </div>
          </div>
        </div>

        <div className="page-container" style={{ padding: "24px 20px" }}>
          {/* Progress card */}
          <div style={{
            background: "white", border: "1px solid #e5e0d8",
            borderRadius: 14, padding: "18px 20px", marginBottom: 20,
            boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#1a1614", letterSpacing: "0.02em" }}>{t("checkInProgress")}</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: pct === 100 ? "#16a34a" : "#1a1614" }}>{pct}%</span>
            </div>
            <div style={{ height: 6, background: "#f0ede8", borderRadius: 3, overflow: "hidden" }}>
              <div style={{
                height: "100%",
                background: pct === 100 ? "#16a34a" : "linear-gradient(90deg, #c41e3a, #e03355)",
                width: `${pct}%`,
                transition: "width 0.6s ease",
                borderRadius: 3,
              }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginTop: 16 }}>
              {[
                { label: t("totalTicketsLabel"), value: total, color: "#1a1614" },
                { label: t("checkedInLabel"),    value: checkedIn, color: "#16a34a" },
                { label: t("awaitingLabel"),     value: total - checkedIn, color: "#6b7280" },
                { label: t("capacityLabel"),     value: capacityTotal ?? "—", color: "#6b7280" },
              ].map((s) => (
                <div key={s.label} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: 10, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.07em", marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Session filter tabs — horizontally scrollable, no wrap */}
          <div style={{
            overflowX: "auto", scrollbarWidth: "none", msOverflowStyle: "none",
            marginLeft: -20, marginRight: -20, paddingLeft: 20, paddingRight: 20,
            marginBottom: 20,
          }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "nowrap", paddingBottom: 4 }}>
              <Link href={`/admin/experiences/${seriesId}/attendees`}
                style={{
                  padding: "8px 16px", borderRadius: 20, border: "none",
                  background: !selectedSession ? "#1a1614" : "#f0ede8",
                  color: !selectedSession ? "white" : "#6b7280",
                  fontSize: 13, textDecoration: "none", fontWeight: 600,
                  whiteSpace: "nowrap", flexShrink: 0, display: "inline-block",
                  transition: "all 0.2s",
                }}>
                {t("allSessions")}
              </Link>
              {sessions.map((s) => (
                <Link key={s.id} href={`/admin/experiences/${seriesId}/attendees?session=${s.id}`}
                  style={{
                    padding: "8px 16px", borderRadius: 20, border: "none",
                    background: selectedSession === s.id ? "#1a1614" : "#f0ede8",
                    color: selectedSession === s.id ? "white" : "#6b7280",
                    fontSize: 13, textDecoration: "none", fontWeight: 600,
                    whiteSpace: "nowrap", flexShrink: 0, display: "inline-block",
                    transition: "all 0.2s",
                  }}>
                  {s.title ?? fmtDate(s.startsAt, locale)}
                </Link>
              ))}
            </div>
          </div>

          {/* Tickets table — horizontally scrollable on mobile */}
          <div style={{ background: "white", border: "1px solid #e5e0d8", borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
            <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #e5e0d8", background: "#fafaf9" }}>
                    {["QR", t("attendeeCol"), t("ticketTypeCol"), t("sessionCol"), "Status", t("checkedInCol"), ""].map((h, i) => (
                      <th key={i} style={{ padding: "11px 14px", textAlign: "left", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#9ca3af", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tickets.map((ticket) => {
                    const isIn = ticket.ticketStatus === "CHECKED_IN";
                    return (
                      <tr key={ticket.id} style={{ borderBottom: "1px solid #f3f4f6", background: isIn ? "#f0fdf4" : "white", transition: "background 0.4s ease" }}>
                        <td style={{ padding: "11px 14px" }}><QRCell code={ticket.code} /></td>
                        <td style={{ padding: "11px 14px" }}>
                          <div style={{ fontWeight: 600, color: "#1a1614", fontSize: 14 }}>{ticket.attendeeName ?? ticket.user?.name ?? "—"}</div>
                          <div style={{ fontSize: 12, color: "#9ca3af" }}>{ticket.attendeeEmail ?? ticket.user?.email ?? ""}</div>
                        </td>
                        <td style={{ padding: "11px 14px", fontSize: 13, color: "#6b7280", whiteSpace: "nowrap" }}>{ticket.ticketType?.name ?? "—"}</td>
                        <td style={{ padding: "11px 14px", fontSize: 12, color: "#9ca3af", maxWidth: 160 }}>
                          <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {ticket.session?.title ?? "—"}
                          </div>
                        </td>
                        <td style={{ padding: "11px 14px" }}>
                          <span style={{
                            fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
                            padding: "4px 10px", borderRadius: 20,
                            background: isIn ? "#dcfce7" : "#f0ede8",
                            color: isIn ? "#16a34a" : "#6b7280",
                            transition: "all 0.4s ease", whiteSpace: "nowrap",
                          }}>
                            {isIn ? "Checked In" : "Issued"}
                          </span>
                        </td>
                        <td style={{ padding: "11px 14px", fontSize: 12, color: "#9ca3af", whiteSpace: "nowrap" }}>{fmtDate(ticket.checkedInAt, locale)}</td>
                        <td style={{ padding: "11px 14px" }}>
                          {!isIn && (
                            <button
                              onClick={() => handleAdminCheckIn(ticket.id)}
                              disabled={checkingIn === ticket.id}
                              style={{
                                fontSize: 12, color: checkingIn === ticket.id ? "#9ca3af" : "#c41e3a",
                                fontWeight: 600, background: "none", border: "1px solid currentColor",
                                borderRadius: 6, padding: "4px 10px", cursor: "pointer",
                                whiteSpace: "nowrap",
                              }}>
                              {checkingIn === ticket.id ? "…" : t("checkInAction")}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {tickets.length === 0 && (
              <div style={{ textAlign: "center", padding: "48px", color: "#9ca3af", fontSize: 14 }}>{t("noAttendeesForFilter")}</div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
