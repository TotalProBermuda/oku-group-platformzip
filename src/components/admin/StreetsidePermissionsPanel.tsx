"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "@/components/i18n/LocaleProvider";

type ScanConfig = {
  canScanMembers: boolean;
  canScanTickets: boolean;
  canScanReservationBlocks: boolean;
};

type HostRow = {
  id: string;
  name: string | null;
  email: string;
  streetsideScanConfig: ScanConfig | null;
};

function Toggle({
  label, checked, onChange, desc,
}: {
  label: string; checked: boolean; onChange: (v: boolean) => void; desc?: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--color-border-light)" }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)" }}>{label}</div>
        {desc && <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 2 }}>{desc}</div>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        style={{
          width: 44,
          height: 24,
          borderRadius: 12,
          border: "none",
          background: checked ? "#16a34a" : "#d1d5db",
          position: "relative",
          cursor: "pointer",
          transition: "background 0.2s",
          flexShrink: 0,
        }}
      >
        <span style={{
          position: "absolute",
          top: 2,
          left: checked ? 22 : 2,
          width: 20,
          height: 20,
          borderRadius: 10,
          background: "white",
          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
          transition: "left 0.2s",
        }} />
      </button>
    </div>
  );
}

export default function StreetsidePermissionsPanel() {
  const t = useTranslation();
  const [hosts, setHosts] = useState<HostRow[]>([]);
  const [globalDefault, setGlobalDefault] = useState<ScanConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [success, setSuccess] = useState("");

  async function load() {
    setLoading(true);
    const r = await fetch("/api/v1/admin/streetside-scan-config");
    const d = await r.json();
    if (d.ok) {
      setHosts(d.data.streetsideHosts ?? []);
      setGlobalDefault(d.data.globalDefault ?? null);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function saveConfig(userId: string | null, patch: Partial<ScanConfig>) {
    setSaving(userId ?? "global");
    const current = userId
      ? (hosts.find((h) => h.id === userId)?.streetsideScanConfig ?? getDefault())
      : (globalDefault ?? getDefault());

    const next = { ...current, ...patch };

    const body = userId
      ? { userId, ...next }
      : { isGlobalDefault: true, ...next };

    const r = await fetch("/api/v1/admin/streetside-scan-config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await r.json();
    if (d.ok) {
      await load();
      setSuccess("Saved");
      setTimeout(() => setSuccess(""), 2000);
    }
    setSaving(null);
  }

  function getDefault(): ScanConfig {
    return globalDefault ?? { canScanMembers: true, canScanTickets: false, canScanReservationBlocks: false };
  }

  function getConfig(host: HostRow): ScanConfig {
    return host.streetsideScanConfig ?? getDefault();
  }

  if (loading) return <div style={{ padding: "20px 0", color: "var(--color-text-muted)", fontSize: 13 }}>Loading…</div>;

  return (
    <div>
      {success && (
        <div style={{ background: "#dcfce7", border: "1px solid #bbf7d0", borderRadius: 8, padding: "8px 14px", fontSize: 13, color: "#16a34a", marginBottom: 16 }}>
          {success}
        </div>
      )}

      {/* Global default */}
      <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 12, padding: "16px 20px", marginBottom: 24 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: "var(--color-text-primary)", marginBottom: 4 }}>
          {t("host", "streetsidePermissions.globalDefault") ?? "Global Default"}
        </div>
        <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginBottom: 12 }}>
          {t("host", "streetsidePermissions.globalDefaultDesc") ?? "Applied to any streetside host without a specific override"}
        </div>
        {saving === "global" && <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{t("host", "streetsidePermissions.saving") ?? "Saving…"}</div>}
        <Toggle
          label={t("host", "streetsidePermissions.memberScan") ?? "Member Scan"}
          desc={t("host", "streetsidePermissions.memberScanDesc") ?? "Can scan member loyalty QR codes"}
          checked={getDefault().canScanMembers}
          onChange={(v) => saveConfig(null, { canScanMembers: v })}
        />
        <Toggle
          label={t("host", "streetsidePermissions.ticketScan") ?? "Ticket Scan"}
          desc={t("host", "streetsidePermissions.ticketScanDesc") ?? "Can scan and check-in event tickets"}
          checked={getDefault().canScanTickets}
          onChange={(v) => saveConfig(null, { canScanTickets: v })}
        />
        <Toggle
          label={t("host", "streetsidePermissions.blockScan") ?? "Reservation Block Scan"}
          desc={t("host", "streetsidePermissions.blockScanDesc") ?? "Can scan group reservation block QR codes"}
          checked={getDefault().canScanReservationBlocks}
          onChange={(v) => saveConfig(null, { canScanReservationBlocks: v })}
        />
      </div>

      {/* Per-host overrides */}
      {hosts.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--color-text-muted)" }}>{t("host", "streetsidePermissions.noHosts") ?? "No streetside hosts found."}</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {hosts.map((host) => {
            const cfg = getConfig(host);
            const isSaving = saving === host.id;
            return (
              <div
                key={host.id}
                style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 12, padding: "16px 20px" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: "var(--color-text-primary)" }}>{host.name || "—"}</div>
                    <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{host.email}</div>
                  </div>
                  {!host.streetsideScanConfig && (
                    <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: "#f3f4f6", color: "#9ca3af", fontWeight: 600 }}>
                      {t("host", "streetsidePermissions.usingDefault") ?? "Using Default"}
                    </span>
                  )}
                  {isSaving && <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{t("host", "streetsidePermissions.saving") ?? "Saving…"}</span>}
                </div>
                <Toggle
                  label={t("host", "streetsidePermissions.memberScan") ?? "Member Scan"}
                  checked={cfg.canScanMembers}
                  onChange={(v) => saveConfig(host.id, { canScanMembers: v })}
                />
                <Toggle
                  label={t("host", "streetsidePermissions.ticketScan") ?? "Ticket Scan"}
                  checked={cfg.canScanTickets}
                  onChange={(v) => saveConfig(host.id, { canScanTickets: v })}
                />
                <Toggle
                  label={t("host", "streetsidePermissions.blockScan") ?? "Reservation Block Scan"}
                  checked={cfg.canScanReservationBlocks}
                  onChange={(v) => saveConfig(host.id, { canScanReservationBlocks: v })}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
