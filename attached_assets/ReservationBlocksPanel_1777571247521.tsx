"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "@/components/i18n/LocaleProvider";
import { QRCodeSVG } from "qrcode.react";

type Arrival = { id: string; partySize: number; arrivedAt: string };
type Block = {
  id: string;
  groupLabel: string;
  expectedCount: number;
  qrCode: string;
  giftBagEnabled: boolean;
  createdAt: string;
  session: { id: string; title: string | null; startsAt: string } | null;
  arrivals: Arrival[];
};

type SessionWithFlags = {
  id: string;
  title: string | null;
  startsAt: string;
  giftBagEnabled: boolean;
  streetsideEnabled: boolean;
};

interface Props {
  seriesId: string;
  sessions?: Array<{ id: string; title: string | null; startsAt: string }>;
}

function QRCodeDisplay({ value }: { value: string }) {
  if (!value) {
    return (
      <div style={{
        width: 120, height: 120, marginTop: 8,
        background: "#f3f4f6", borderRadius: 10,
        display: "flex", alignItems: "center", justifyContent: "center",
        border: "1px dashed #d1d5db", flexDirection: "column", gap: 4,
      }}>
        <span style={{ fontSize: 22 }}>⚠️</span>
        <span style={{ fontSize: 10, color: "#9ca3af", textAlign: "center", padding: "0 8px" }}>QR code missing</span>
      </div>
    );
  }
  return (
    <div style={{ background: "white", borderRadius: 10, padding: 8, display: "inline-block", marginTop: 8 }}>
      <QRCodeSVG
        value={`BLOCK:${value}`}
        size={120}
        level="M"
        marginSize={4}
        bgColor="#ffffff"
        fgColor="#000000"
        title="Block QR"
        style={{ display: "block" }}
      />
    </div>
  );
}

export default function ReservationBlocksPanel({ seriesId, sessions = [] }: Props) {
  const t = useTranslation();
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [form, setForm] = useState({ groupLabel: "", expectedCount: 10, sessionId: "", giftBagEnabled: false });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [sessionGiftBags, setSessionGiftBags] = useState<Record<string, boolean>>({});
  const [sessionStreetside, setSessionStreetside] = useState<Record<string, boolean>>({});
  const [togglingSession, setTogglingSession] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const r = await fetch(`/api/v1/admin/reservation-blocks?seriesId=${seriesId}`);
    const d = await r.json();
    if (d.ok) setBlocks(d.data);
    setLoading(false);
  }

  useEffect(() => { load(); }, [seriesId]);

  // Fetch giftBagEnabled for each session via the series sessions list
  useEffect(() => {
    if (sessions.length === 0) return;
    const ids = sessions.map((s) => s.id);
    // We'll fetch from the series sessions if they already have giftBagEnabled via prop
    // But Props only carries {id, title, startsAt} — we fetch individually
    (async () => {
      try {
        const results = await Promise.all(
          ids.map((id) =>
            fetch(`/api/v1/admin/sessions/${id}`)
              .then((r) => r.json())
              .then((d) => ({
                id,
                giftBagEnabled: d.data?.giftBagEnabled ?? false,
                streetsideEnabled: d.data?.streetsideEnabled ?? false,
              }))
              .catch(() => ({ id, giftBagEnabled: false, streetsideEnabled: false }))
          )
        );
        const giftBagMap: Record<string, boolean> = {};
        const streetsideMap: Record<string, boolean> = {};
        results.forEach((r) => {
          giftBagMap[r.id] = r.giftBagEnabled;
          streetsideMap[r.id] = r.streetsideEnabled;
        });
        setSessionGiftBags(giftBagMap);
        setSessionStreetside(streetsideMap);
      } catch {}
    })();
  }, [sessions]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.groupLabel || !form.expectedCount) {
      setError("Group label and expected count are required");
      return;
    }
    setSaving(true);
    setError("");
    const r = await fetch("/api/v1/admin/reservation-blocks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seriesId, ...form, sessionId: form.sessionId || null }),
    });
    const d = await r.json();
    if (!r.ok || !d.ok) {
      setError(d.error ?? "Failed to create");
    } else {
      setShowForm(false);
      setForm({ groupLabel: "", expectedCount: 10, sessionId: "", giftBagEnabled: false });
      await load();
    }
    setSaving(false);
  }

  async function toggleGiftBag(block: Block) {
    await fetch(`/api/v1/admin/reservation-blocks/${block.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ giftBagEnabled: !block.giftBagEnabled }),
    });
    await load();
  }

  async function toggleSessionGiftBag(sessionId: string) {
    setTogglingSession(`gb-${sessionId}`);
    const current = sessionGiftBags[sessionId] ?? false;
    await fetch(`/api/v1/admin/sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ giftBagEnabled: !current }),
    });
    setSessionGiftBags((prev) => ({ ...prev, [sessionId]: !current }));
    setTogglingSession(null);
  }

  async function toggleSessionStreetside(sessionId: string) {
    setTogglingSession(`ss-${sessionId}`);
    const current = sessionStreetside[sessionId] ?? false;
    await fetch(`/api/v1/admin/sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ streetsideEnabled: !current }),
    });
    setSessionStreetside((prev) => ({ ...prev, [sessionId]: !current }));
    setTogglingSession(null);
  }

  async function deleteBlock(id: string) {
    if (!confirm(t("host", "reservationBlocks.deleteConfirm") ?? "Delete this reservation block?")) return;
    await fetch(`/api/v1/admin/reservation-blocks/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div>
      {/* Session-level streetside + gift-bag settings */}
      {sessions.length > 0 && (
        <div style={{ background: "#fafaf9", border: "1px solid #e5e0d8", borderRadius: 12, padding: 16, marginBottom: 24 }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: "#374151", marginBottom: 6 }}>
            {t("host", "reservationBlocks.sessionSettingsTitle") ?? "Session Streetside Settings"}
          </div>
          <p style={{ fontSize: 12, color: "#7c7168", margin: "0 0 12px" }}>
            {t("host", "reservationBlocks.sessionSettingsDesc") ?? "Enable streetside check-in per session. Gift bag prompts appear during ticket check-in when enabled."}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {sessions.map((s) => {
              const ssOn = sessionStreetside[s.id] ?? false;
              const gbOn = sessionGiftBags[s.id] ?? false;
              return (
                <div key={s.id} style={{ background: "white", border: "1px solid #e5e0d8", borderRadius: 8, padding: "10px 14px" }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1614", marginBottom: 8 }}>
                    {s.title ?? new Date(s.startsAt).toLocaleDateString()} — {new Date(s.startsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      onClick={() => toggleSessionStreetside(s.id)}
                      disabled={togglingSession === `ss-${s.id}`}
                      style={{
                        fontSize: 12, padding: "4px 12px", borderRadius: 8, border: "1px solid",
                        cursor: "pointer", fontWeight: 600,
                        background: ssOn ? "#dbeafe" : "#f3f4f6",
                        borderColor: ssOn ? "#93c5fd" : "#d1d5db",
                        color: ssOn ? "#1d4ed8" : "#6b7280",
                      }}
                    >
                      {togglingSession === `ss-${s.id}` ? "…" : ssOn
                        ? (t("host", "reservationBlocks.streetsideOn") ?? "📱 Streetside: On")
                        : (t("host", "reservationBlocks.streetsideOff") ?? "📱 Streetside: Off")}
                    </button>
                    <button
                      onClick={() => toggleSessionGiftBag(s.id)}
                      disabled={togglingSession === `gb-${s.id}`}
                      style={{
                        fontSize: 12, padding: "4px 12px", borderRadius: 8, border: "1px solid",
                        cursor: "pointer", fontWeight: 600,
                        background: gbOn ? "#dcfce7" : "#f3f4f6",
                        borderColor: gbOn ? "#86efac" : "#d1d5db",
                        color: gbOn ? "#16a34a" : "#6b7280",
                      }}
                    >
                      {togglingSession === `gb-${s.id}` ? "…" : gbOn
                        ? (t("host", "reservationBlocks.giftBagOn") ?? "🎁 Gift Bag: On")
                        : (t("host", "reservationBlocks.giftBagOff") ?? "🎁 Gift Bag: Off")}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <p style={{ fontSize: 13, color: "#7c7168", margin: 0 }}>
          {t("host", "reservationBlocks.subtitle") ?? "Create named group blocks with QR codes for streetside check-in."}
        </p>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="btn btn-sm btn-primary"
          style={{ fontSize: 13 }}
        >
          {t("host", "reservationBlocks.newBlock") ?? "+ New Block"}
        </button>
      </div>

      {showForm && (
        <div style={{ background: "#fafaf9", border: "1px solid #e5e0d8", borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14, color: "#1a1614" }}>{t("host", "reservationBlocks.title") ?? "New Reservation Block"}</div>
          {error && <div style={{ color: "#dc2626", fontSize: 13, marginBottom: 10 }}>{error}</div>}
          <form onSubmit={handleCreate}>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#6b7280", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {t("host", "reservationBlocks.groupLabel") ?? "Group Label"}
              </label>
              <input
                className="form-input"
                value={form.groupLabel}
                onChange={(e) => setForm((f) => ({ ...f, groupLabel: e.target.value }))}
                placeholder="e.g. Table 12 Private Party"
                style={{ fontSize: 13 }}
              />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#6b7280", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {t("host", "reservationBlocks.expectedCount") ?? "Expected Headcount"}
              </label>
              <input
                type="number"
                className="form-input"
                value={form.expectedCount}
                min={1}
                onChange={(e) => setForm((f) => ({ ...f, expectedCount: parseInt(e.target.value) || 1 }))}
                style={{ fontSize: 13 }}
              />
            </div>
            {sessions.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#6b7280", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  {t("host", "reservationBlocks.session") ?? "Session (optional)"}
                </label>
                <select
                  className="form-input"
                  value={form.sessionId}
                  onChange={(e) => setForm((f) => ({ ...f, sessionId: e.target.value }))}
                  style={{ fontSize: 13 }}
                >
                  <option value="">{t("host", "reservationBlocks.allSessions") ?? "All sessions"}</option>
                  {sessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title ?? new Date(s.startsAt).toLocaleDateString()} — {new Date(s.startsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input
                  type="checkbox"
                  id="giftBagEnabled"
                  checked={form.giftBagEnabled}
                  onChange={(e) => setForm((f) => ({ ...f, giftBagEnabled: e.target.checked }))}
                  style={{ width: 16, height: 16, flexShrink: 0 }}
                />
                <label htmlFor="giftBagEnabled" style={{ fontSize: 13, color: "#374151", cursor: "pointer" }}>
                  {t("host", "reservationBlocks.enableGiftBag") ?? "Enable gift bag confirmation for this block"}
                </label>
              </div>
              <div style={{
                marginTop: 8, marginLeft: 26,
                padding: "8px 10px",
                background: "#f0fdf4", border: "1px solid #bbf7d0",
                borderRadius: 8, fontSize: 12, color: "#166534", lineHeight: 1.5,
              }}>
                {t("host", "reservationBlocks.giftBagHelperText") ?? "When enabled, the host will be prompted to record a gift bag handoff after scanning this block's QR code. The quantity defaults to one bag per expected guest. Gift bags can also be enabled at the session level — either setting will trigger the prompt."}
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button type="submit" disabled={saving} className="btn btn-primary" style={{ fontSize: 13 }}>
                {saving
                  ? (t("host", "reservationBlocks.creating") ?? "Creating…")
                  : (t("host", "reservationBlocks.createBlock") ?? "Create Block")}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="btn btn-ghost" style={{ fontSize: 13 }}>
                {t("host", "reservationBlocks.cancel") ?? "Cancel"}
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div style={{ fontSize: 13, color: "#9ca3af", padding: "20px 0" }}>{t("host", "reservationBlocks.loading") ?? "Loading blocks…"}</div>
      ) : blocks.length === 0 ? (
        <div style={{ fontSize: 13, color: "#9ca3af", padding: "20px 0" }}>{t("host", "reservationBlocks.noBlocks") ?? "No reservation blocks yet. Create one to get started."}</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {blocks.map((block) => {
            const totalArrived = block.arrivals.reduce((s, a) => s + a.partySize, 0);
            const isExpanded = expandedId === block.id;
            const remaining = block.expectedCount - totalArrived;
            return (
              <div
                key={block.id}
                style={{ background: "white", border: "1px solid #e5e0d8", borderRadius: 12, overflow: "hidden" }}
              >
                <div
                  onClick={() => setExpandedId(isExpanded ? null : block.id)}
                  style={{ padding: "14px 16px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
                >
                  <div>
                    <div style={{ fontWeight: 600, color: "#1a1614", fontSize: 14 }}>{block.groupLabel}</div>
                    <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>
                      {totalArrived} / {block.expectedCount} {t("host", "scan.arrived") ?? "arrived"}
                      {block.session && ` · ${block.session.title ?? new Date(block.session.startsAt).toLocaleDateString()}`}
                      {block.giftBagEnabled && ` · 🎁 ${t("host", "reservationBlocks.giftBags") ?? "Gift bags"}`}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <div style={{
                      padding: "3px 10px",
                      borderRadius: 20,
                      fontSize: 11,
                      fontWeight: 700,
                      background: totalArrived >= block.expectedCount ? "#dcfce7" : "#f3f4f6",
                      color: totalArrived >= block.expectedCount ? "#16a34a" : "#6b7280",
                    }}>
                      {totalArrived >= block.expectedCount
                        ? (t("host", "reservationBlocks.complete") ?? "Complete")
                        : t("host", "reservationBlocks.remaining", { n: remaining })}
                    </div>
                    <span style={{ fontSize: 18, color: "#9ca3af" }}>{isExpanded ? "▲" : "▼"}</span>
                  </div>
                </div>

                {isExpanded && (
                  <div style={{ borderTop: "1px solid #e5e0d8", padding: "16px", background: "#fafaf9" }}>
                    <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
                          {t("host", "reservationBlocks.qrCode") ?? "QR Code"}
                        </div>
                        <QRCodeDisplay value={block.qrCode} />
                        {block.qrCode ? (
                          <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 4, wordBreak: "break-all" }}>
                            BLOCK:{block.qrCode}
                          </div>
                        ) : (
                          <div style={{ fontSize: 10, color: "#f87171", marginTop: 4 }}>
                            No QR code assigned
                          </div>
                        )}
                        <div style={{
                          marginTop: 8, padding: "6px 10px",
                          background: "#fffbeb", border: "1px solid #fde68a",
                          borderRadius: 7, maxWidth: 160,
                        }}>
                          <span style={{ fontSize: 10, color: "#92400e", lineHeight: 1.45, display: "block" }}>
                            ℹ️ {t("host", "reservationBlocks.qrScanModeHint") ?? <><strong>Reservation Block</strong> scan mode must be enabled for hosts to use this code.</>}
                          </span>
                        </div>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                          {t("host", "reservationBlocks.arrivals") ?? "Arrivals"}
                        </div>
                        {block.arrivals.length === 0 ? (
                          <div style={{ fontSize: 12, color: "#9ca3af" }}>{t("host", "reservationBlocks.noArrivals") ?? "No arrivals yet"}</div>
                        ) : (
                          block.arrivals.map((a) => (
                            <div key={a.id} style={{ fontSize: 12, color: "#374151", marginBottom: 4 }}>
                              {new Date(a.arrivedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} — {t("host", "reservationBlocks.partyOf") ?? "party of"} {a.partySize}
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <button
                        onClick={() => toggleGiftBag(block)}
                        className="btn btn-ghost"
                        style={{ fontSize: 12 }}
                      >
                        {block.giftBagEnabled
                          ? (t("host", "reservationBlocks.disableGiftBag") ?? "🎁 Disable Gift Bags")
                          : (t("host", "reservationBlocks.enableGiftBagButton") ?? "🎁 Enable Gift Bags")}
                      </button>
                      <button
                        onClick={() => deleteBlock(block.id)}
                        style={{ fontSize: 12, padding: "6px 12px", background: "transparent", border: "1px solid #fecaca", borderRadius: 8, color: "#dc2626", cursor: "pointer" }}
                      >
                        {t("host", "reservationBlocks.delete") ?? "Delete"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
