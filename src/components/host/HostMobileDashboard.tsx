"use client";

import { useState, useRef, useEffect } from "react";

type Zone = { id: string; name: string; slug: string; conceptKey: string; currentWaitMinutes: number | null; capacityCovers: number };
type Handoff = {
  id: string; handoffStatus: string; createdAt: string;
  reservation: { contactName: string; partySize: number; conceptRequested: string | null; zone: { name: string } | null; attributions: Array<{ referrer: { fullName: string; referrerType: string } | null }> };
};
type WaitlistEntry = { id: string; contactName: string; partySize: number; conceptRequested: string | null; estimatedWaitMinutes: number | null; status: string };

const CONCEPTS = [
  { key: "oku",     label: "OKÜ",     color: "#1a1614" },
  { key: "catch",   label: "CATCH",   color: "#1a1614" },
  { key: "terrace", label: "TERRACE", color: "#1a1614" },
  { key: "vip",     label: "VIP",     color: "#1a1614" },
];

const HANDOFF_NEXT: Record<string, string> = { PENDING: "ACKNOWLEDGED", ACKNOWLEDGED: "GUEST_EN_ROUTE", GUEST_EN_ROUTE: "GUEST_ARRIVED", GUEST_ARRIVED: "SEATED" };
const HANDOFF_NEXT_LABEL: Record<string, string> = { PENDING: "Acknowledge →", ACKNOWLEDGED: "En Route →", GUEST_EN_ROUTE: "Mark Arrived →", GUEST_ARRIVED: "Seat Guest ✓" };
const HANDOFF_STATUS_COLOR: Record<string, string> = { PENDING: "#c41e3a", ACKNOWLEDGED: "#d97706", GUEST_EN_ROUTE: "#2563eb", GUEST_ARRIVED: "#059669", SEATED: "#1f8a55" };
const HANDOFF_STATUS_LABEL: Record<string, string> = { PENDING: "Pending", ACKNOWLEDGED: "Acknowledged", GUEST_EN_ROUTE: "En Route", GUEST_ARRIVED: "Arrived", SEATED: "Seated ✓" };

export default function HostMobileDashboard({
  handoffs: initialHandoffs, waitlist, zones,
}: { handoffs: Handoff[]; waitlist: WaitlistEntry[]; zones: Zone[] }) {
  const [view, setView] = useState<"capture" | "queue" | "waitlist">("capture");
  const [handoffs, setHandoffs] = useState(initialHandoffs);

  const pendingHandoffs = handoffs.filter(h => !["SEATED", "CLOSED", "CANCELLED"].includes(h.handoffStatus));

  async function updateHandoff(id: string, status: string) {
    setHandoffs(prev => prev.map(h => h.id === id ? { ...h, handoffStatus: status } : h));
    await fetch(`/api/host/handoffs/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ handoffStatus: status }) });
  }

  const waitZone = zones.find(z => z.currentWaitMinutes != null);
  const waitDisplay = waitZone?.currentWaitMinutes ? `~${waitZone.currentWaitMinutes} min wait` : null;

  return (
    <div style={{ background: "#0e0c0b", minHeight: "100svh", display: "flex", flexDirection: "column", fontFamily: "var(--font-sans)", maxWidth: 480, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ padding: "20px 20px 0", flexShrink: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(255,255,255,0.35)", marginBottom: 2 }}>Gold House · Streetside</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#fff", letterSpacing: "-0.02em" }}>Host Interface</div>
          </div>
          {waitDisplay && (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#f59e0b" }}>{waitDisplay}</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em" }}>current wait</div>
            </div>
          )}
        </div>

        {/* Nav Pills */}
        <div style={{ display: "flex", gap: 8, marginTop: 18, paddingBottom: 20 }}>
          {([
            { key: "capture", label: "Send Upstairs" },
            { key: "queue",   label: `Queue${pendingHandoffs.length ? ` (${pendingHandoffs.length})` : ""}` },
            { key: "waitlist",label: `Waitlist${waitlist.length ? ` (${waitlist.length})` : ""}` },
          ] as const).map(v => (
            <button key={v.key} onClick={() => setView(v.key)} style={{
              padding: "7px 14px", borderRadius: 20, border: "none", cursor: "pointer",
              background: view === v.key ? "#c41e3a" : "rgba(255,255,255,0.1)",
              color: view === v.key ? "#fff" : "rgba(255,255,255,0.55)",
              fontSize: 12, fontWeight: 700, letterSpacing: "0.02em",
              transition: "all 0.15s",
            }}>{v.label}</button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, background: "#faf8f6", borderRadius: "20px 20px 0 0", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {view === "capture" && <CaptureScreen zones={zones} />}
        {view === "queue" && <QueueScreen handoffs={handoffs} onUpdate={updateHandoff} />}
        {view === "waitlist" && <WaitlistScreen entries={waitlist} />}
      </div>
    </div>
  );
}

// ─── Capture Screen (PRIMARY — the Uber pickup flow) ─────────────────────────
function CaptureScreen({ zones }: { zones: Zone[] }) {
  const [concept, setConcept] = useState("terrace");
  const [name, setName] = useState("");
  const [showEmail, setShowEmail] = useState(false);
  const [email, setEmail] = useState("");
  const [party, setParty] = useState(2);
  const [refCode, setRefCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; waitMinutes?: number | null } | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setTimeout(() => nameRef.current?.focus(), 300); }, []);

  const selectedZone = zones.find(z => z.conceptKey === concept || z.slug === concept);
  const waitMin = selectedZone?.currentWaitMinutes ?? null;

  async function send() {
    if (!name.trim()) { nameRef.current?.focus(); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/host/walkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim() || undefined, partySize: party, concept, referralCode: refCode || undefined }),
      });
      const data = await res.json();
      setResult({ success: res.ok, waitMinutes: waitMin });
    } catch { setResult({ success: false }); }
    setLoading(false);
  }

  if (result) {
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "40px 28px", textAlign: "center" }}>
        <div style={{ width: 80, height: 80, borderRadius: "50%", background: result.success ? "#1f8a55" : "#c41e3a", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 24 }}>
          <span style={{ fontSize: 40, color: "#fff" }}>{result.success ? "✓" : "✕"}</span>
        </div>
        {result.success ? (
          <>
            <div style={{ fontSize: 26, fontWeight: 700, color: "#1f1a17", marginBottom: 8, letterSpacing: "-0.02em" }}>Sent Upstairs</div>
            <div style={{ fontSize: 14, color: "#7d7269", marginBottom: 8 }}>
              {name} · {party} guest{party !== 1 ? "s" : ""} · {concept.toUpperCase()}
            </div>
            {result.waitMinutes && (
              <div style={{ fontSize: 20, fontWeight: 700, color: "#c41e3a", marginBottom: 4 }}>~{result.waitMinutes} min wait</div>
            )}
            <div style={{ fontSize: 12, color: "#7d7269", marginBottom: 36 }}>Upstairs host notified</div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#1f1a17", marginBottom: 8 }}>Something went wrong</div>
            <div style={{ fontSize: 14, color: "#7d7269", marginBottom: 36 }}>Try again</div>
          </>
        )}
        <button onClick={() => { setResult(null); setName(""); setEmail(""); setParty(2); setRefCode(""); setShowEmail(false); setTimeout(() => nameRef.current?.focus(), 100); }}
          style={{ background: "#c41e3a", color: "#fff", border: "none", borderRadius: 14, padding: "16px 40px", fontSize: 16, fontWeight: 700, cursor: "pointer" }}>
          Next Guest →
        </button>
      </div>
    );
  }

  const inp: React.CSSProperties = { width: "100%", fontSize: 18, padding: "14px 16px", border: "2px solid #e8e2dd", borderRadius: 12, color: "#1f1a17", background: "#fff", outline: "none", boxSizing: "border-box", fontFamily: "inherit" };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ flex: 1, overflowY: "auto", padding: "24px 20px 140px" }}>

        {/* Concept Selector */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 24 }}>
          {CONCEPTS.map(c => (
            <button key={c.key} type="button" onClick={() => setConcept(c.key)} style={{
              padding: "16px 0", borderRadius: 12, border: concept === c.key ? "2.5px solid #c41e3a" : "2px solid #e8e2dd",
              background: concept === c.key ? "#fff7f7" : "#fff",
              color: concept === c.key ? "#c41e3a" : "#7d7269",
              fontSize: 16, fontWeight: 800, cursor: "pointer", letterSpacing: "0.04em",
              transition: "all 0.1s",
            }}>
              {c.label}
              {concept === c.key && zones.find(z => z.slug === c.key)?.currentWaitMinutes && (
                <div style={{ fontSize: 10, fontWeight: 500, marginTop: 2, color: "#c41e3a" }}>
                  ~{zones.find(z => z.slug === c.key)?.currentWaitMinutes} min
                </div>
              )}
            </button>
          ))}
        </div>

        {/* Name */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#7d7269", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>Guest Name</div>
          <input ref={nameRef} value={name} onChange={e => setName(e.target.value)} placeholder="First and last name" style={inp} autoComplete="off" onKeyDown={e => e.key === "Enter" && send()} />
        </div>

        {/* Email Toggle */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: showEmail ? 8 : 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#7d7269", letterSpacing: "0.08em", textTransform: "uppercase" }}>Email / WhatsApp</div>
            <button type="button" onClick={() => setShowEmail(v => !v)} style={{ background: showEmail ? "#e8e2dd" : "transparent", border: "1.5px solid #e8e2dd", borderRadius: 20, padding: "4px 12px", fontSize: 11, fontWeight: 700, color: "#7d7269", cursor: "pointer" }}>
              {showEmail ? "Remove" : "+ Add"}
            </button>
          </div>
          {showEmail && (
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="guest@email.com or +507..." style={inp} type="text" autoComplete="email" />
          )}
        </div>

        {/* Party Size */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#7d7269", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>Party Size</div>
          <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
            <button type="button" onClick={() => setParty(p => Math.max(1, p - 1))} style={{ width: 60, height: 60, borderRadius: "12px 0 0 12px", border: "2px solid #e8e2dd", borderRight: "none", background: "#fff", fontSize: 28, fontWeight: 300, color: "#1f1a17", cursor: "pointer", lineHeight: 1 }}>−</button>
            <div style={{ flex: 1, height: 60, border: "2px solid #e8e2dd", display: "flex", alignItems: "center", justifyContent: "center", background: "#fff" }}>
              <span style={{ fontSize: 32, fontWeight: 800, color: "#1f1a17" }}>{party}</span>
            </div>
            <button type="button" onClick={() => setParty(p => p + 1)} style={{ width: 60, height: 60, borderRadius: "0 12px 12px 0", border: "2px solid #e8e2dd", borderLeft: "none", background: "#fff", fontSize: 28, fontWeight: 300, color: "#1f1a17", cursor: "pointer", lineHeight: 1 }}>+</button>
          </div>
        </div>

        {/* Referral Code */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#7d7269", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>Referral Code <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(optional)</span></div>
          <input value={refCode} onChange={e => setRefCode(e.target.value.toUpperCase())} placeholder="CARLOS01" style={{ ...inp, fontSize: 15, letterSpacing: "0.1em" }} autoCapitalize="characters" />
        </div>
      </div>

      {/* Sticky CTA */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, maxWidth: 480, margin: "0 auto", padding: "12px 20px 28px", background: "linear-gradient(to top, #faf8f6 70%, rgba(250,248,246,0))", boxSizing: "border-box" }}>
        <button type="button" onClick={send} disabled={loading || !name.trim()} style={{
          width: "100%", padding: "18px 0", borderRadius: 16, border: "none",
          background: name.trim() ? "#c41e3a" : "#e8e2dd",
          color: name.trim() ? "#fff" : "#7d7269",
          fontSize: 18, fontWeight: 800, cursor: name.trim() ? "pointer" : "default",
          letterSpacing: "-0.01em", transition: "all 0.15s",
        }}>
          {loading ? "Sending…" : "Send Upstairs →"}
        </button>
      </div>
    </div>
  );
}

// ─── Queue Screen ─────────────────────────────────────────────────────────────
function QueueScreen({ handoffs, onUpdate }: { handoffs: Handoff[]; onUpdate: (id: string, s: string) => void }) {
  const active = handoffs.filter(h => !["SEATED", "CLOSED", "CANCELLED"].includes(h.handoffStatus));
  const done = handoffs.filter(h => ["SEATED", "CLOSED"].includes(h.handoffStatus));

  if (active.length === 0 && done.length === 0) {
    return <EmptyState message="No active handoffs right now." sub="Send guests upstairs using the main tab." />;
  }

  return (
    <div style={{ overflowY: "auto", padding: "20px 16px 40px" }}>
      {active.map(h => <HandoffCard key={h.id} handoff={h} onUpdate={onUpdate} />)}
      {done.length > 0 && (
        <>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#7d7269", margin: "24px 0 10px" }}>Completed</div>
          {done.map(h => <HandoffCard key={h.id} handoff={h} onUpdate={onUpdate} dim />)}
        </>
      )}
    </div>
  );
}

function HandoffCard({ handoff: h, onUpdate, dim = false }: { handoff: Handoff; onUpdate: (id: string, s: string) => void; dim?: boolean }) {
  const next = HANDOFF_NEXT[h.handoffStatus];
  const nextLabel = HANDOFF_NEXT_LABEL[h.handoffStatus];
  const statusColor = HANDOFF_STATUS_COLOR[h.handoffStatus] ?? "#7d7269";
  const ref = h.reservation.attributions[0]?.referrer;
  const timeAgo = Math.round((Date.now() - new Date(h.createdAt).getTime()) / 60000);

  return (
    <div style={{ background: dim ? "#f3f0ed" : "#fff", border: "1px solid #e8e2dd", borderRadius: 14, padding: "16px", marginBottom: 10, opacity: dim ? 0.7 : 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16, color: "#1f1a17" }}>{h.reservation.contactName}</div>
          <div style={{ fontSize: 12, color: "#7d7269", marginTop: 2 }}>
            {h.reservation.partySize} guests · {h.reservation.conceptRequested?.toUpperCase() ?? "—"} · {timeAgo}m ago
          </div>
        </div>
        <span style={{ background: statusColor + "18", color: statusColor, fontSize: 10, fontWeight: 800, padding: "3px 8px", borderRadius: 6, letterSpacing: "0.06em", whiteSpace: "nowrap" }}>
          {HANDOFF_STATUS_LABEL[h.handoffStatus]}
        </span>
      </div>
      {ref && (
        <div style={{ fontSize: 11, color: "#7d7269", background: "#faf8f6", borderRadius: 6, padding: "5px 8px", marginBottom: 10 }}>
          via {ref.fullName} · {ref.referrerType.replace(/_/g, " ")}
        </div>
      )}
      {next && (
        <button type="button" onClick={() => onUpdate(h.id, next)} style={{ width: "100%", padding: "11px", background: "#1a1614", color: "#fff", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          {nextLabel}
        </button>
      )}
    </div>
  );
}

// ─── Waitlist Screen ──────────────────────────────────────────────────────────
function WaitlistScreen({ entries }: { entries: WaitlistEntry[] }) {
  if (entries.length === 0) return <EmptyState message="Waitlist is empty." sub="Guests will appear here when added." />;
  return (
    <div style={{ overflowY: "auto", padding: "20px 16px 40px" }}>
      {entries.map((e, i) => (
        <div key={e.id} style={{ background: "#fff", border: "1px solid #e8e2dd", borderRadius: 14, padding: "14px 16px", marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "#1a1614", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700 }}>{i + 1}</div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, color: "#1f1a17" }}>{e.contactName}</div>
              <div style={{ fontSize: 11, color: "#7d7269" }}>{e.partySize} guests · {e.conceptRequested?.toUpperCase() ?? "Any"}</div>
            </div>
          </div>
          {e.estimatedWaitMinutes && (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#c41e3a" }}>{e.estimatedWaitMinutes}</div>
              <div style={{ fontSize: 9, color: "#7d7269", textTransform: "uppercase", letterSpacing: "0.06em" }}>min</div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function EmptyState({ message, sub }: { message: string; sub: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, padding: "60px 24px", textAlign: "center" }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: "#7d7269", marginBottom: 6 }}>{message}</div>
      <div style={{ fontSize: 12, color: "#aaa" }}>{sub}</div>
    </div>
  );
}
