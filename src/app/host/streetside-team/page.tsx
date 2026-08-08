"use client";

import { useEffect, useState, useCallback } from "react";
import Brandmark from "@/components/Brandmark";
import Link from "next/link";
import { useTranslation } from "@/components/i18n/LocaleProvider";

type TeamMember = {
  id: string;
  displayName: string;
  isOnShift: boolean;
  badgeColor: string | null;
  venue: { id: string; name: string } | null;
  userId: string;
  userEmail: string;
  lastSeen: string;
  isSelf: boolean;
};

function elapsed(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 2) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function StreetsideTeamPage() {
  const t = useTranslation();
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(Date.now());

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/v1/host/streetside-team");
      const d = await r.json();
      if (d.ok) setTeam(d.team);
    } finally {
      setLoading(false);
      setLastRefresh(Date.now());
    }
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(load, 30_000);
    return () => clearInterval(iv);
  }, [load]);

  const self = team.find((m) => m.isSelf);

  async function toggleShift() {
    if (!self) return;
    setToggling(true);
    try {
      const r = await fetch("/api/v1/host/my-shift", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isOnShift: !self.isOnShift }),
      });
      const d = await r.json();
      if (d.ok) {
        setTeam((prev) =>
          prev.map((m) => (m.isSelf ? { ...m, isOnShift: d.isOnShift } : m))
        );
      }
    } finally {
      setToggling(false);
    }
  }

  const onShift  = team.filter((m) => m.isOnShift);
  const offShift = team.filter((m) => !m.isOnShift);

  return (
    <div style={{ minHeight: "100vh", background: "#0d0d0f", color: "white" }}>
      {/* Header */}
      <header style={{
        position: "sticky", top: 0, zIndex: 50,
        background: "rgba(13,13,15,0.92)",
        backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        padding: "0 20px",
      }}>
        <div style={{ maxWidth: 760, margin: "0 auto", height: 56, display: "flex", alignItems: "center", gap: 12 }}>
          <Link href="/host/dashboard" style={{ fontSize: 11, color: "#4b5563", textDecoration: "none", padding: "3px 9px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.03)" }}>
            {t("host", "streetside.backToDash")}
          </Link>
          <Brandmark size={16} color="#e8d9b3" showTagline={false} />
          <div style={{ width: 1, height: 18, background: "rgba(255,255,255,0.1)" }} />
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#38bdf8" }}>
            {t("host", "streetside.pageTitle")}
          </span>
          <div style={{ marginLeft: "auto", fontSize: 10, color: "#374151" }}>
            Auto-refresh · {new Date(lastRefresh).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 760, margin: "0 auto", padding: "28px 16px 80px" }}>

        {/* Self clock-in/out (only for STREETSIDE_HOST users) */}
        {self && (
          <div style={{
            marginBottom: 28, padding: "18px 20px",
            background: self.isOnShift ? "rgba(52,211,153,0.06)" : "rgba(255,255,255,0.03)",
            border: `1px solid ${self.isOnShift ? "rgba(52,211,153,0.25)" : "rgba(255,255,255,0.08)"}`,
            borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap",
          }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: self.isOnShift ? "#34d399" : "#6b7280", marginBottom: 4 }}>
                {self.isOnShift ? t("host", "streetside.onShift") : t("host", "streetside.offShift")}
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "white" }}>
                {self.displayName}
              </div>
              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                {self.isOnShift ? t("host", "shift.onShift") : t("host", "shift.offShift")}
              </div>
            </div>
            <button
              onClick={toggleShift}
              disabled={toggling}
              style={{
                padding: "10px 20px", borderRadius: 10, border: "none", fontWeight: 700, fontSize: 13, cursor: toggling ? "not-allowed" : "pointer",
                background: self.isOnShift ? "rgba(248,113,113,0.15)" : "rgba(52,211,153,0.15)",
                color: self.isOnShift ? "#f87171" : "#34d399",
                opacity: toggling ? 0.6 : 1,
              }}
            >
              {toggling ? t("host", "streetside.updating") : self.isOnShift ? t("host", "streetside.clockOut") : t("host", "streetside.clockIn")}
            </button>
          </div>
        )}

        {/* Summary strip */}
        <div style={{ display: "flex", gap: 10, marginBottom: 28 }}>
          <div style={{ flex: 1, padding: "14px 18px", background: "rgba(52,211,153,0.07)", border: "1px solid rgba(52,211,153,0.2)", borderRadius: 12, textAlign: "center" }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: "#34d399" }}>{onShift.length}</div>
            <div style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 2 }}>{t("host", "streetside.onShift")}</div>
          </div>
          <div style={{ flex: 1, padding: "14px 18px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, textAlign: "center" }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: "#6b7280" }}>{offShift.length}</div>
            <div style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 2 }}>{t("host", "streetside.offShift")}</div>
          </div>
          <div style={{ flex: 1, padding: "14px 18px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, textAlign: "center" }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: "white" }}>{team.length}</div>
            <div style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 2 }}>{t("host", "streetside.totalCount", { total: String(team.length) })}</div>
          </div>
        </div>

        {loading && (
          <div style={{ textAlign: "center", padding: 48, color: "#6b7280", fontSize: 13 }}>{t("host", "streetside.loading")}</div>
        )}

        {!loading && team.length === 0 && (
          <div style={{ textAlign: "center", padding: 48, color: "#6b7280", fontSize: 13 }}>
            {t("host", "streetside.noMembers")}
          </div>
        )}

        {/* On Shift */}
        {onShift.length > 0 && (
          <section style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#34d399", marginBottom: 12 }}>
              🟢 {t("host", "streetside.onShift")} — {onShift.length}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {onShift.map((m) => (
                <HostCard key={m.id} member={m} />
              ))}
            </div>
          </section>
        )}

        {/* Off Shift */}
        {offShift.length > 0 && (
          <section>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#374151", marginBottom: 12 }}>
              ⚫ {t("host", "streetside.offShift")} — {offShift.length}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {offShift.map((m) => (
                <HostCard key={m.id} member={m} dimmed />
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function HostCard({ member, dimmed }: { member: TeamMember; dimmed?: boolean }) {
  const t = useTranslation();
  const initials = member.displayName.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 14,
      padding: "14px 16px",
      background: dimmed ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.04)",
      border: `1px solid ${member.isOnShift ? "rgba(52,211,153,0.15)" : "rgba(255,255,255,0.06)"}`,
      borderRadius: 12, opacity: dimmed ? 0.55 : 1,
    }}>
      {/* Avatar */}
      <div style={{
        width: 38, height: 38, borderRadius: "50%", flexShrink: 0,
        background: member.badgeColor ?? "rgba(200,169,110,0.15)",
        border: `2px solid ${member.isOnShift ? "#34d399" : "rgba(255,255,255,0.1)"}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 13, fontWeight: 700, color: "white",
      }}>
        {initials}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: member.isOnShift ? "white" : "#6b7280" }}>
          {member.displayName}
          {member.isSelf && <span style={{ fontSize: 10, color: "#c8a96e", marginLeft: 8, fontWeight: 700 }}>{t("host", "streetside.you").toUpperCase()}</span>}
        </div>
        <div style={{ fontSize: 11, color: "#4b5563", marginTop: 2 }}>
          {member.venue?.name ?? "—"} · {t("host", "streetside.lastSeen")} {elapsed(member.lastSeen)}
        </div>
      </div>

      <div style={{
        fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
        padding: "4px 10px", borderRadius: 20,
        background: member.isOnShift ? "rgba(52,211,153,0.12)" : "rgba(255,255,255,0.04)",
        color: member.isOnShift ? "#34d399" : "#374151",
        border: member.isOnShift ? "1px solid rgba(52,211,153,0.25)" : "1px solid rgba(255,255,255,0.06)",
        flexShrink: 0,
      }}>
        {member.isOnShift ? t("host", "streetside.onShift").toUpperCase() : t("host", "streetside.offShift").toUpperCase()}
      </div>
    </div>
  );
}
