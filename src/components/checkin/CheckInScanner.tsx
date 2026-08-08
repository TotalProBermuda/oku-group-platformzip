"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface TicketPayload {
  id: string;
  code: string;
  attendeeName: string | null;
  ticketType: { name: string; tierCode: string | null } | null;
  user: {
    id: string;
    name: string | null;
    email: string | null;
    membership: { tier: string; status: string } | null;
  };
  session: {
    id: string;
    title: string | null;
    startsAt: string;
    series: { title: string; venue: string | null } | null;
  } | null;
  attendanceEvent: { id: string; status: string } | null;
  checkedInAt: string | null;
  ticketStatus?: string;
}

interface CheckInResponse {
  ok: boolean;
  result: "VALID" | "ALREADY_CHECKED_IN" | "INVALID" | "EXPIRED";
  message: string;
  ticket?: TicketPayload;
}

interface SessionOption {
  id: string;
  title: string | null;
  startsAt: string;
  series: { id: string; title: string; venue: string | null } | null;
  ticketCount: number;
  checkedInCount: number;
}

interface RecentScan {
  ts: number;
  result: CheckInResponse["result"];
  guest: string;
  code: string;
  message: string;
}

const RESULT_CONFIG: Record<CheckInResponse["result"], { bg: string; light: string; border: string; icon: string; label: string }> = {
  VALID:              { bg: "#16a34a", light: "#dcfce7", border: "#86efac", icon: "✓", label: "Checked in" },
  ALREADY_CHECKED_IN: { bg: "#d97706", light: "#fef3c7", border: "#fcd34d", icon: "⚠", label: "Already checked in" },
  INVALID:            { bg: "#dc2626", light: "#fee2e2", border: "#fca5a5", icon: "✗", label: "Invalid ticket" },
  EXPIRED:            { bg: "#dc2626", light: "#fee2e2", border: "#fca5a5", icon: "✗", label: "Cancelled / refunded" },
};

const TIER_COLORS: Record<string, string> = {
  PATRON:  "#7c3aed",
  FOUNDER: "#b45309",
  VIP:     "#0891b2",
};

const COOLDOWN_MS = 1500;
const SCANNER_CONTAINER_ID = "oku-qr-reader";

type CameraState = "idle" | "loading" | "active" | "unsupported" | "denied" | "error";

export default function CheckInScanner() {
  // ─── Sessions ─────────────────────────────────────────────────────────────
  const [sessions, setSessions] = useState<SessionOption[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>("");
  const [sessionsLoading, setSessionsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/v1/checkin/sessions?range=today")
      .then((r) => (r.ok ? r.json() : { ok: false, sessions: [] }))
      .then((d) => {
        if (cancelled) return;
        setSessions(d.sessions ?? []);
      })
      .catch(() => { if (!cancelled) setSessions([]); })
      .finally(() => { if (!cancelled) setSessionsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // ─── Search / manual entry ────────────────────────────────────────────────
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TicketPayload[]>([]);
  const [searching, setSearching] = useState(false);
  const [checkingIn, setCheckingIn] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (!q) { setResults([]); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const sessionParam = selectedSessionId ? `&sessionId=${encodeURIComponent(selectedSessionId)}` : "";
        const res = await fetch(`/api/v1/checkin/manual?q=${encodeURIComponent(q)}${sessionParam}`);
        const data = await res.json();
        if (data.ok) setResults(data.tickets ?? []);
        else setResults([]);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, selectedSessionId]);

  // ─── Last result panel + recent scans ─────────────────────────────────────
  const [lastResult, setLastResult] = useState<CheckInResponse | null>(null);
  const [recent, setRecent] = useState<RecentScan[]>([]);

  // Normalize anything we receive into a safe CheckInResponse shape so the
  // render path can never trip on undefined/unknown `result`.
  const normalizeResponse = useCallback((raw: any, fallbackMsg = "Unexpected response"): CheckInResponse => {
    const knownResults: CheckInResponse["result"][] = ["VALID", "ALREADY_CHECKED_IN", "INVALID", "EXPIRED"];
    if (raw && typeof raw === "object" && knownResults.includes(raw.result)) {
      return {
        ok: !!raw.ok,
        result: raw.result,
        message: typeof raw.message === "string" ? raw.message : fallbackMsg,
        ticket: raw.ticket,
      };
    }
    const errMsg = typeof raw?.error === "string" ? raw.error
                  : typeof raw?.message === "string" ? raw.message
                  : fallbackMsg;
    return { ok: false, result: "INVALID", message: errMsg };
  }, []);

  const recordResult = useCallback((raw: any) => {
    const data = normalizeResponse(raw);
    setLastResult(data);
    const guest =
      data.ticket?.attendeeName ?? data.ticket?.user?.name ?? data.ticket?.user?.email ?? "Unknown";
    const code = data.ticket?.code ?? "—";
    setRecent((prev) => [{ ts: Date.now(), result: data.result, guest, code, message: data.message }, ...prev].slice(0, 5));
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(data.result === "VALID" ? [80, 40, 80] : [60, 30, 60, 30, 60]);
    }
  }, [normalizeResponse]);

  // ─── Manual / search check-in ─────────────────────────────────────────────
  const submitCheckIn = useCallback(async (code: string) => {
    setCheckingIn(code);
    try {
      const res = await fetch("/api/v1/checkin/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, sessionId: selectedSessionId || undefined }),
      });
      let data: CheckInResponse;
      try {
        data = await res.json();
      } catch {
        data = { ok: false, result: "INVALID", message: `Server error (${res.status})` };
      }
      recordResult(data);
      if (data.result === "VALID" || data.result === "ALREADY_CHECKED_IN") {
        setResults((prev) => prev.filter((t) => t.code !== code));
      }
    } catch {
      recordResult({ ok: false, result: "INVALID", message: "Network error — please retry" });
    } finally {
      setCheckingIn(null);
    }
  }, [selectedSessionId, recordResult]);

  // ─── Code-entry form ──────────────────────────────────────────────────────
  const [codeInput, setCodeInput] = useState("");

  async function handleCodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    const code = codeInput.trim().toUpperCase();
    if (!code) return;
    setCodeInput("");
    await submitCheckIn(code);
  }

  // ─── Camera (auto-start, mobile-first) ────────────────────────────────────
  const [cameraState, setCameraState] = useState<CameraState>("loading");
  const [cameraStopped, setCameraStopped] = useState(false);
  const [cameraDevices, setCameraDevices] = useState<{ id: string; label: string }[]>([]);
  const [activeCameraId, setActiveCameraId] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const scannerRef = useRef<any>(null);
  const Html5QrcodeRef = useRef<any>(null);
  const lastQrRef = useRef<{ code: string; ts: number } | null>(null);
  // Monotonic request token — every startCamera() captures the value at call
  // time. After each await we bail if the captured token is no longer current
  // (component unmounted, user pressed Stop, or another start kicked off).
  const requestTokenRef = useRef(0);

  const stopCamera = useCallback(async () => {
    requestTokenRef.current += 1; // invalidate any pending start
    const inst = scannerRef.current;
    scannerRef.current = null;
    if (inst) {
      try { await inst.stop(); } catch { /* ignore */ }
      try { await inst.clear(); } catch { /* ignore */ }
    }
  }, []);

  // Start (or restart) the scanner with a given camera config.
  // Container div stays mounted — only the underlying stream is swapped.
  const startCamera = useCallback(async (cameraConfig: MediaTrackConstraints | string) => {
    const myToken = ++requestTokenRef.current;
    const isStale = () => requestTokenRef.current !== myToken;
    setCameraState("loading");

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      if (!isStale()) setCameraState("unsupported");
      return;
    }

    let Ctor = Html5QrcodeRef.current;
    if (!Ctor) {
      try {
        const mod = await import("html5-qrcode");
        Ctor = mod.Html5Qrcode;
        Html5QrcodeRef.current = Ctor;
      } catch {
        if (!isStale()) setCameraState("error");
        return;
      }
      if (isStale()) return;
    }

    // Tear down any existing instance directly (don't call stopCamera — it
    // would bump the token and invalidate ourselves).
    const prev = scannerRef.current;
    scannerRef.current = null;
    if (prev) {
      try { await prev.stop(); } catch { /* ignore */ }
      try { await prev.clear(); } catch { /* ignore */ }
    }
    if (isStale()) return;

    // Wait one tick so the container div is in the DOM
    await new Promise((r) => setTimeout(r, 0));
    if (isStale()) return;

    const container = document.getElementById(SCANNER_CONTAINER_ID);
    if (!container) {
      if (!isStale()) setCameraState("error");
      return;
    }

    let inst: any;
    try {
      // verbose=false; no file-upload UI ever rendered (we use core class, not Html5QrcodeScanner)
      inst = new Ctor(SCANNER_CONTAINER_ID, { verbose: false });
    } catch {
      if (!isStale()) setCameraState("error");
      return;
    }
    if (isStale()) {
      try { await inst.clear(); } catch { /* ignore */ }
      return;
    }
    scannerRef.current = inst;

    try {
      await inst.start(
        cameraConfig as any,
        { fps: 10, qrbox: { width: 240, height: 240 }, aspectRatio: 1.0, disableFlip: false },
        async (decodedText: string) => {
          const now = Date.now();
          const m = decodedText.match(/\/checkin\/([A-Z0-9\-]+)/i);
          const code = (m ? m[1] : decodedText.trim()).toUpperCase();
          if (lastQrRef.current && lastQrRef.current.code === code && now - lastQrRef.current.ts < COOLDOWN_MS) return;
          lastQrRef.current = { code, ts: now };
          await submitCheckIn(code);
        },
        undefined
      );
      // If user cancelled while inst.start() was in flight, tear it down again
      if (isStale()) {
        try { await inst.stop(); } catch { /* ignore */ }
        try { await inst.clear(); } catch { /* ignore */ }
        if (scannerRef.current === inst) scannerRef.current = null;
        return;
      }
      setCameraState("active");

      // Best-effort: enumerate cameras for the picker (only after permission granted)
      try {
        const devices = await Ctor.getCameras();
        if (isStale()) return;
        if (Array.isArray(devices) && devices.length) {
          setCameraDevices(devices.map((d: any, i: number) => ({
            id: d.id,
            label: d.label || `Camera ${i + 1}`,
          })));
          const stream: MediaStream | undefined =
            (document.querySelector(`#${SCANNER_CONTAINER_ID} video`) as HTMLVideoElement | null)?.srcObject as MediaStream | undefined;
          const trackLabel = stream?.getVideoTracks?.()?.[0]?.label;
          const matched = trackLabel ? devices.find((d: any) => d.label === trackLabel) : null;
          if (matched) setActiveCameraId(matched.id);
          else if (typeof cameraConfig === "string") setActiveCameraId(cameraConfig);
        }
      } catch { /* ignore — picker just won't show device names */ }
    } catch (err: any) {
      if (isStale()) return;
      const name = err?.name ?? "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") setCameraState("denied");
      else if (name === "NotFoundError" || name === "OverconstrainedError") setCameraState("unsupported");
      else setCameraState("error");
    }
  }, [submitCheckIn]);

  // Auto-start on mount with rear camera.
  useEffect(() => {
    if (cameraStopped) return;
    void startCamera({ facingMode: { ideal: "environment" } });
    return () => { void stopCamera(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraStopped]);

  const handleCameraChange = useCallback(async (deviceId: string) => {
    setActiveCameraId(deviceId);
    setShowPicker(false);
    await startCamera(deviceId);
  }, [startCamera]);

  const handleStopCamera = useCallback(async () => {
    setCameraStopped(true);
    await stopCamera();
    setCameraState("idle");
    setShowPicker(false);
  }, [stopCamera]);

  const handleStartCamera = useCallback(() => {
    setCameraStopped(false);
  }, []);

  // ─── Render ───────────────────────────────────────────────────────────────
  const guestName = (tk: TicketPayload) =>
    tk.attendeeName ?? tk.user.name ?? tk.user.email ?? "Guest";

  const selectedSession = sessions.find((s) => s.id === selectedSessionId) ?? null;

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "20px 16px 60px" }}>
      {/* ── Session selector ─────────────────────────────────────────────── */}
      <div style={{ background: "white", border: "1px solid #e5e0d8", borderRadius: 12, padding: 14, marginBottom: 16 }}>
        <label style={{ display: "block", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#6b7280", marginBottom: 6 }}>
          Session
        </label>
        {sessionsLoading ? (
          <div style={{ fontSize: 13, color: "#9ca3af" }}>Loading sessions…</div>
        ) : sessions.length === 0 ? (
          <div style={{ fontSize: 13, color: "#9ca3af" }}>No sessions in the next 36 hours. Manual check-in still works.</div>
        ) : (
          <select
            value={selectedSessionId}
            onChange={(e) => setSelectedSessionId(e.target.value)}
            style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #e5e0d8", fontSize: 14, background: "white" }}
          >
            <option value="">All sessions</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {(s.series?.title ?? "Session") + (s.title ? ` — ${s.title}` : "")} · {new Date(s.startsAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · {s.checkedInCount}/{s.ticketCount}
              </option>
            ))}
          </select>
        )}
        {selectedSession && (
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
            {selectedSession.checkedInCount} of {selectedSession.ticketCount} guests checked in
            {selectedSession.series?.venue ? ` · ${selectedSession.series.venue}` : ""}
          </div>
        )}
      </div>

      {/* ── Manual code entry (always visible) ───────────────────────────── */}
      <form onSubmit={handleCodeSubmit} style={{ background: "white", border: "1px solid #e5e0d8", borderRadius: 12, padding: 14, marginBottom: 16 }}>
        <label style={{ display: "block", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#6b7280", marginBottom: 6 }}>
          Enter ticket code
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="text"
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value)}
            placeholder="e.g. TIX-ABC123"
            autoCapitalize="characters"
            autoComplete="off"
            style={{ flex: 1, padding: "12px 14px", border: "1px solid #e5e0d8", borderRadius: 8, fontSize: 15, fontFamily: "monospace", letterSpacing: "0.04em", outline: "none" }}
          />
          <button
            type="submit"
            disabled={!codeInput.trim() || checkingIn !== null}
            style={{ padding: "12px 22px", borderRadius: 8, border: 0, background: "#1a1614", color: "white", fontWeight: 600, fontSize: 14, cursor: codeInput.trim() ? "pointer" : "not-allowed", opacity: codeInput.trim() ? 1 : 0.5 }}
          >
            Check In
          </button>
        </div>
      </form>

      {/* ── Search by name / email / code ────────────────────────────────── */}
      <div style={{ background: "white", border: "1px solid #e5e0d8", borderRadius: 12, padding: 14, marginBottom: 16 }}>
        <label style={{ display: "block", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#6b7280", marginBottom: 6 }}>
          Find by name, email, or code
        </label>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Name, email, or ticket code…"
          autoComplete="off"
          style={{ width: "100%", padding: "12px 14px", border: "1px solid #e5e0d8", borderRadius: 8, fontSize: 15, outline: "none" }}
        />

        {searching && <div style={{ marginTop: 10, fontSize: 12, color: "#9ca3af" }}>Searching…</div>}

        {!searching && query.trim() && results.length === 0 && (
          <div style={{ marginTop: 10, fontSize: 13, color: "#9ca3af" }}>No matching tickets.</div>
        )}

        {results.length > 0 && (
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            {results.map((tk) => {
              const isIn = tk.attendanceEvent?.status === "ARRIVED" || tk.checkedInAt !== null || tk.ticketStatus === "CHECKED_IN";
              const isBlocked = tk.ticketStatus === "CANCELLED" || tk.ticketStatus === "VOIDED" || tk.ticketStatus === "REFUNDED";
              return (
                <div key={tk.id} style={{ background: "#fafaf9", border: "1px solid #f0ece6", borderRadius: 10, padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 600, fontSize: 14, color: "#1a1614" }}>{guestName(tk)}</span>
                      {tk.user.membership && TIER_COLORS[tk.user.membership.tier] && (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 20, background: TIER_COLORS[tk.user.membership.tier], color: "white" }}>
                          {tk.user.membership.tier}
                        </span>
                      )}
                      {isIn && (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 20, background: "#dcfce7", color: "#166534" }}>IN</span>
                      )}
                      {isBlocked && (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 20, background: "#fee2e2", color: "#991b1b" }}>{tk.ticketStatus}</span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                      {tk.ticketType?.name ?? "Standard"}
                      {tk.user.email ? ` · ${tk.user.email}` : ""}
                    </div>
                    <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2, fontFamily: "monospace" }}>{tk.code}</div>
                  </div>
                  <button
                    onClick={() => submitCheckIn(tk.code)}
                    disabled={checkingIn === tk.code || isIn || isBlocked}
                    style={{
                      padding: "10px 16px", borderRadius: 8, border: 0,
                      background: isIn || isBlocked ? "#f3f1ee" : "#1a1614",
                      color: isIn || isBlocked ? "#9ca3af" : "white",
                      fontWeight: 600, fontSize: 13, flexShrink: 0,
                      cursor: isIn || isBlocked ? "not-allowed" : "pointer",
                    }}
                  >
                    {checkingIn === tk.code ? "…" : isIn ? "Done" : isBlocked ? "Blocked" : "Check In"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Camera (auto-start, mobile-first) ────────────────────────────── */}
      <div style={{ background: "white", border: "1px solid #e5e0d8", borderRadius: 12, padding: 14, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, gap: 10, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#6b7280" }}>Scan QR code</div>
            <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>
              {cameraState === "active" && "Point camera at ticket QR code"}
              {cameraState === "loading" && "Starting camera…"}
              {cameraState === "denied" && "Camera permission denied — use manual entry above"}
              {cameraState === "unsupported" && "No camera on this device — use manual entry above"}
              {cameraState === "error" && "Camera failed to start — use manual entry above"}
              {cameraState === "idle" && "Camera stopped"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {cameraStopped ? (
              <button
                onClick={handleStartCamera}
                style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #e5e0d8", background: "#1a1614", color: "white", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
              >
                Start camera
              </button>
            ) : (
              <>
                {cameraDevices.length > 1 && (
                  <button
                    onClick={() => setShowPicker((v) => !v)}
                    style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #e5e0d8", background: showPicker ? "#1a1614" : "white", color: showPicker ? "white" : "#1a1614", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                  >
                    Change camera
                  </button>
                )}
                <button
                  onClick={handleStopCamera}
                  style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #e5e0d8", background: "white", color: "#1a1614", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                >
                  Stop
                </button>
              </>
            )}
          </div>
        </div>

        {showPicker && cameraDevices.length > 1 && (
          <div style={{ marginBottom: 10, padding: 10, background: "#fafaf9", border: "1px solid #f0ece6", borderRadius: 8, display: "flex", flexDirection: "column", gap: 4 }}>
            {cameraDevices.map((d) => (
              <button
                key={d.id}
                onClick={() => handleCameraChange(d.id)}
                style={{
                  textAlign: "left", padding: "8px 10px", borderRadius: 6,
                  border: 0, background: activeCameraId === d.id ? "#1a1614" : "transparent",
                  color: activeCameraId === d.id ? "white" : "#1a1614",
                  fontSize: 13, cursor: "pointer",
                }}
              >
                {activeCameraId === d.id ? "● " : ""}{d.label}
              </button>
            ))}
          </div>
        )}

        {/* Viewport — always mounted while camera is enabled, so swapping cameras never collapses the screen */}
        {!cameraStopped && (
          <div style={{ position: "relative", background: "#111", borderRadius: 12, overflow: "hidden", aspectRatio: "1/1", maxHeight: 420 }}>
            <div id={SCANNER_CONTAINER_ID} style={{ width: "100%", height: "100%" }} />
            {cameraState !== "active" && (
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "white", gap: 10, padding: 16, textAlign: "center", background: "rgba(0,0,0,0.55)" }}>
                <div style={{ fontSize: 36 }}>{cameraState === "loading" ? "📷" : "⚠️"}</div>
                <div style={{ fontSize: 14, color: "#fca5a5", fontWeight: 600 }}>
                  {cameraState === "loading" && "Starting camera…"}
                  {cameraState === "denied" && "Camera permission denied"}
                  {cameraState === "unsupported" && "No camera available"}
                  {cameraState === "error" && "Camera failed to start"}
                </div>
                <div style={{ fontSize: 12, color: "#d1d5db", maxWidth: 260 }}>
                  Manual entry above still works for every check-in.
                </div>
              </div>
            )}
            {/* Corner guides */}
            {cameraState === "active" && (
              <div style={{ position: "absolute", inset: 0, pointerEvents: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ width: 200, height: 200, position: "relative" }}>
                  {[
                    { top: 0, left: 0, borderTop: "3px solid white", borderLeft: "3px solid white", borderRadius: "4px 0 0 0" },
                    { top: 0, right: 0, borderTop: "3px solid white", borderRight: "3px solid white", borderRadius: "0 4px 0 0" },
                    { bottom: 0, left: 0, borderBottom: "3px solid white", borderLeft: "3px solid white", borderRadius: "0 0 0 4px" },
                    { bottom: 0, right: 0, borderBottom: "3px solid white", borderRight: "3px solid white", borderRadius: "0 0 4px 0" },
                  ].map((s, i) => (
                    <div key={i} style={{ position: "absolute", width: 28, height: 28, ...s }} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Last result panel ────────────────────────────────────────────── */}
      {lastResult && (() => {
        const cfg = RESULT_CONFIG[lastResult.result];
        const tk = lastResult.ticket;
        return (
          <div style={{ background: cfg.light, border: `2px solid ${cfg.border}`, borderRadius: 12, padding: 16, marginBottom: 16, position: "relative" }}>
            <button
              onClick={() => setLastResult(null)}
              aria-label="Dismiss"
              style={{ position: "absolute", top: 8, right: 8, background: "transparent", border: 0, fontSize: 18, color: "#6b7280", cursor: "pointer", padding: 4, lineHeight: 1 }}
            >×</button>
            <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
              <div style={{ width: 48, height: 48, borderRadius: "50%", background: cfg.bg, color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 700, flexShrink: 0 }}>
                {cfg.icon}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#1a1614" }}>{cfg.label}</div>
                <div style={{ fontSize: 13, color: "#374151", marginTop: 2 }}>{lastResult.message}</div>
                {tk && (
                  <div style={{ marginTop: 8, fontSize: 13, color: "#1a1614" }}>
                    <div style={{ fontWeight: 600 }}>{guestName(tk)}</div>
                    <div style={{ fontSize: 12, color: "#6b7280" }}>
                      {tk.ticketType?.name ?? "Standard"}
                      {tk.user.email ? ` · ${tk.user.email}` : ""}
                    </div>
                    <div style={{ fontSize: 11, color: "#9ca3af", fontFamily: "monospace", marginTop: 2 }}>{tk.code}</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Recent scans ─────────────────────────────────────────────────── */}
      {recent.length > 0 && (
        <div style={{ background: "white", border: "1px solid #e5e0d8", borderRadius: 12, padding: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#6b7280", marginBottom: 8 }}>Recent (last 5)</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {recent.map((r, i) => {
              const cfg = RESULT_CONFIG[r.result];
              return (
                <div key={`${r.ts}-${i}`} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 6, fontSize: 12 }}>
                  <span style={{ width: 18, height: 18, borderRadius: "50%", background: cfg.bg, color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{cfg.icon}</span>
                  <span style={{ fontWeight: 600, color: "#1a1614", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.guest}</span>
                  <span style={{ fontFamily: "monospace", fontSize: 10, color: "#9ca3af" }}>{r.code}</span>
                  <span style={{ fontSize: 10, color: "#9ca3af", flexShrink: 0 }}>{new Date(r.ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
