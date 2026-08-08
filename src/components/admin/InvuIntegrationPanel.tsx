"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useTranslation } from "@/components/i18n/LocaleProvider";

interface Venue {
  id: string;
  name: string;
  slug: string;
}

interface BranchMapping {
  id: string;
  venueId: string;
  credentialId: string;
  invuBranchId: string;
  invuBranchLabel: string | null;
  isSyncEnabled: boolean;
  syncIntervalMinutes: number;
  syncScopeJson: Record<string, boolean>;
  lastSuccessfulSyncAt: string | null;
  lastFailedSyncAt: string | null;
  syncRuns?: SyncRun[];
}

interface SyncRun {
  id: string;
  scopeType: string;
  triggeredByUserId: string | null;
  status: string;
  ordersPulledCount: number;
  matchedCount: number;
  unmatchedCount: number;
  errorCount: number;
  startedAt: string;
  finishedAt: string | null;
  errors?: { id: string; errorCode: string | null; errorMessage: string }[];
}

interface ConnectionStatus {
  credentialId?: string;
  status: string;
  daysUntilExpiry: number | null;
  lastAuthSucceededAt: string | null;
  lastAuthFailedAt: string | null;
  lastAuthError: string | null;
  tokenIssuedAt: string | null;
  tokenLastRotatedAt: string | null;
  accessTokenMasked: string | null;
  apiUserExpiresAt: string | null;
  apiUserType: string | null;
  branchScoped: boolean;
  isEnabled: boolean;
  lastSuccessfulSyncAt: string | null;
  lastFailedSyncAt: string | null;
  branchMappings: BranchMapping[];
  createdAt: string | null;
  updatedAt: string | null;
  apiUsernameMasked: string | null;
}

interface AuditEntry {
  id: string;
  actorId: string;
  action: string;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
}

const SCOPE_KEYS = ["closedOrders", "invoiceTotals", "payments", "clients", "creditNotes", "reversals", "orderTotals"] as const;

function statusBadgeStyle(status: string): React.CSSProperties {
  switch (status) {
    case "CONNECTED":
      return { background: "rgba(16,185,129,0.15)", color: "#10b981", border: "1px solid rgba(16,185,129,0.3)" };
    case "EXPIRING_SOON":
      return { background: "rgba(245,158,11,0.15)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.3)" };
    case "NEEDS_REAUTH":
    case "EXPIRED":
    case "FAILED":
    case "DISCONNECTED":
      return { background: "rgba(239,68,68,0.15)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.3)" };
    default:
      return { background: "rgba(156,163,175,0.15)", color: "#9ca3af", border: "1px solid rgba(156,163,175,0.3)" };
  }
}

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString();
}

function glassCard(extra?: React.CSSProperties): React.CSSProperties {
  return {
    background: "var(--color-surface, rgba(255,255,255,0.04))",
    border: "1px solid var(--color-border, rgba(255,255,255,0.08))",
    borderRadius: 12,
    padding: "20px 24px",
    marginBottom: 20,
    ...extra,
  };
}

export default function InvuIntegrationPanel({ venues }: { venues: Venue[] }) {
  const t = useTranslation();
  const [selectedVenueId, setSelectedVenueId] = useState<string>(venues[0]?.id ?? "");
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [syncLogs, setSyncLogs] = useState<SyncRun[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);
  const [expandedRun, setExpandedRun] = useState<string | null>(null);

  const [form, setForm] = useState({
    username: "",
    password: "",
    apiUserType: "API_ADMINISTRATOR",
    apiUserExpiresAt: "",
    branchScoped: false,
  });

  const [newMapping, setNewMapping] = useState({
    invuBranchId: "",
    invuBranchLabel: "",
    syncIntervalMinutes: 15,
    show: false,
  });

  const [mappingEdits, setMappingEdits] = useState<Record<string, Partial<BranchMapping>>>({});

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadStatus = useCallback(async () => {
    if (!selectedVenueId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/admin/integrations/invu/status?venueId=${selectedVenueId}`);
      const data = await res.json();
      setConnectionStatus(data);
    } catch {
      setConnectionStatus(null);
    } finally {
      setLoading(false);
    }
  }, [selectedVenueId]);

  const loadSyncLogs = useCallback(async () => {
    if (!selectedVenueId) return;
    try {
      const res = await fetch(`/api/v1/admin/integrations/invu/sync-logs?venueId=${selectedVenueId}&limit=10`);
      const data = await res.json();
      setSyncLogs(data.runs ?? []);
    } catch {
      setSyncLogs([]);
    }
  }, [selectedVenueId]);

  const loadAuditLogs = useCallback(async () => {
    if (!connectionStatus?.credentialId) return;
    try {
      const res = await fetch(`/api/v1/admin/audit-logs?action=INVU_&credentialId=${connectionStatus.credentialId}&limit=20`);
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data.logs ?? []);
      }
    } catch {
      setAuditLogs([]);
    }
  }, [connectionStatus?.credentialId]);

  useEffect(() => {
    loadStatus();
    loadSyncLogs();
  }, [loadStatus, loadSyncLogs]);

  useEffect(() => {
    if (connectionStatus?.credentialId) loadAuditLogs();
  }, [connectionStatus?.credentialId, loadAuditLogs]);

  const handleConnect = async () => {
    if (!form.username || !form.password || !selectedVenueId) {
      showToast("Username, password and venue are required", "error");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/v1/admin/integrations/invu/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: form.username,
          password: form.password,
          apiUserType: form.apiUserType,
          apiUserExpiresAt: form.apiUserExpiresAt || null,
          branchScoped: form.branchScoped,
          venueId: selectedVenueId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      showToast("Connected successfully");
      setForm((f) => ({ ...f, password: "" }));
      await loadStatus();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Connection failed", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleReauth = async () => {
    if (!connectionStatus?.credentialId) return;
    setLoading(true);
    try {
      const res = await fetch("/api/v1/admin/integrations/invu/reauth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentialId: connectionStatus.credentialId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      showToast("Reauthenticated successfully");
      await loadStatus();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Reauth failed", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!connectionStatus?.credentialId) return;
    if (!confirm(t("admin", "invu.integration.confirmDisconnect"))) return;
    setLoading(true);
    try {
      const res = await fetch("/api/v1/admin/integrations/invu/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentialId: connectionStatus.credentialId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      showToast("Disconnected");
      await loadStatus();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Disconnect failed", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleTestConnection = async () => {
    await loadStatus();
    showToast(`Status: ${connectionStatus?.status ?? "DISCONNECTED"}`);
  };

  const handleAddMapping = async () => {
    if (!newMapping.invuBranchId || !connectionStatus?.credentialId) {
      showToast("Branch ID and a connected credential are required", "error");
      return;
    }
    try {
      const res = await fetch("/api/v1/admin/integrations/invu/branch-mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          venueId: selectedVenueId,
          credentialId: connectionStatus.credentialId,
          invuBranchId: newMapping.invuBranchId,
          invuBranchLabel: newMapping.invuBranchLabel,
          syncIntervalMinutes: newMapping.syncIntervalMinutes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      showToast("Branch mapping added");
      setNewMapping({ invuBranchId: "", invuBranchLabel: "", syncIntervalMinutes: 15, show: false });
      await loadStatus();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed", "error");
    }
  };

  const handleSaveMapping = async (mappingId: string) => {
    const edits = mappingEdits[mappingId];
    if (!edits) return;
    try {
      const res = await fetch(`/api/v1/admin/integrations/invu/branch-mappings/${mappingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(edits),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      showToast("Mapping saved");
      setMappingEdits((prev) => { const n = { ...prev }; delete n[mappingId]; return n; });
      await loadStatus();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed", "error");
    }
  };

  const handleDeleteMapping = async (mappingId: string) => {
    if (!confirm(t("admin", "invu.integration.confirmDeleteMapping"))) return;
    try {
      const res = await fetch(`/api/v1/admin/integrations/invu/branch-mappings/${mappingId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      showToast("Mapping deleted");
      await loadStatus();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed", "error");
    }
  };

  const handleTriggerSync = async () => {
    if (!connectionStatus?.credentialId) return;
    try {
      const res = await fetch("/api/v1/admin/integrations/invu/sync-trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentialId: connectionStatus.credentialId, venueId: selectedVenueId, scopeType: "ALL" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      showToast(`Sync triggered — run ID: ${data.syncRunId}`);
      await loadSyncLogs();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed", "error");
    }
  };

  const mappingFor = (m: BranchMapping) => ({ ...m, ...mappingEdits[m.id] });
  const editMapping = (id: string, field: string, value: unknown) => {
    setMappingEdits((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };

  const inputStyle: React.CSSProperties = {
    background: "var(--color-input, rgba(255,255,255,0.05))",
    border: "1px solid var(--color-border, rgba(255,255,255,0.12))",
    borderRadius: 8,
    padding: "8px 12px",
    color: "var(--color-text)",
    fontSize: 13,
    width: "100%",
    boxSizing: "border-box",
  };

  const badgeStyle: React.CSSProperties = {
    display: "inline-block",
    padding: "3px 10px",
    borderRadius: 20,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    ...statusBadgeStyle(connectionStatus?.status ?? "DISCONNECTED"),
  };

  const btnPrimary: React.CSSProperties = {
    background: "var(--color-accent, #8b5cf6)",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "8px 18px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    opacity: loading ? 0.6 : 1,
  };

  const btnSecondary: React.CSSProperties = {
    background: "transparent",
    color: "var(--color-text)",
    border: "1px solid var(--color-border, rgba(255,255,255,0.15))",
    borderRadius: 8,
    padding: "7px 16px",
    fontSize: 13,
    cursor: "pointer",
  };

  const btnDanger: React.CSSProperties = {
    ...btnSecondary,
    color: "#ef4444",
    borderColor: "rgba(239,68,68,0.3)",
  };

  const sectionTitle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: "var(--color-text-muted)",
    marginBottom: 14,
    marginTop: 0,
  };

  const labelStyle: React.CSSProperties = { fontSize: 12, color: "var(--color-text-muted)", marginBottom: 4, display: "block" };

  const isConnected = !!connectionStatus?.credentialId;

  return (
    <div style={{ maxWidth: 960, position: "relative" }}>
      <div style={{ marginBottom: 24 }}>
        <h2 className="section-title" style={{ margin: 0 }}>
          {t("admin", "invuIntegration")}
        </h2>
        <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: "6px 0 0" }}>
          {t("admin", "invuSubtitle")}
        </p>
      </div>

      {toast && (
        <div style={{
          position: "fixed", top: 20, right: 20, zIndex: 9999,
          background: toast.type === "success" ? "rgba(16,185,129,0.9)" : "rgba(239,68,68,0.9)",
          color: "#fff", padding: "10px 18px", borderRadius: 10, fontSize: 13, fontWeight: 500,
          boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
        }}>
          {toast.msg}
        </div>
      )}

      {/* Venue selector */}
      <div style={glassCard()}>
        <p style={sectionTitle}>{t("admin", "invu.selectVenue")}</p>
        <select
          value={selectedVenueId}
          onChange={(e) => setSelectedVenueId(e.target.value)}
          style={{ ...inputStyle, maxWidth: 320 }}
        >
          {venues.map((v) => (
            <option key={v.id} value={v.id}>{v.name}</option>
          ))}
        </select>
      </div>

      {/* Onboarding intro — shown only when no credentials configured */}
      {!isConnected && (
        <div style={{ ...glassCard(), borderLeft: "3px solid var(--color-accent)" }}>
          <p style={{ ...sectionTitle, color: "var(--color-accent)" }}>
            {t("admin", "invu.onboarding.eyebrow")}
          </p>
          <h3 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 8px" }}>
            {t("admin", "invu.onboarding.title")}
          </h3>
          <p style={{ fontSize: 13, color: "var(--color-text-muted)", lineHeight: 1.6, margin: "0 0 12px" }}>
            {t("admin", "invu.onboarding.body")}
          </p>
          <ol style={{ fontSize: 13, color: "var(--color-text-muted)", lineHeight: 1.7, paddingLeft: 18, margin: 0 }}>
            <li>{t("admin", "invu.onboarding.step1")}</li>
            <li>{t("admin", "invu.onboarding.step2")}</li>
            <li>{t("admin", "invu.onboarding.step3")}</li>
          </ol>
        </div>
      )}

      {/* Quick link to Closed Orders panel (only when connected) */}
      {isConnected && (
        <div style={{ ...glassCard(), display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <div>
            <p style={{ ...sectionTitle, marginBottom: 4 }}>Closed Orders (last 7 days)</p>
            <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: 0, lineHeight: 1.5 }}>
              View the real INVU closed checks pulled for this venue, the reservations each one was matched to, and the host/referrer that earns commission.
            </p>
          </div>
          <a
            href="/admin/integrations/invu/closed-orders"
            style={{
              padding: "10px 18px",
              borderRadius: 10,
              border: "1px solid rgba(251, 191, 36, 0.4)",
              background: "rgba(251, 191, 36, 0.12)",
              color: "#fbbf24",
              fontSize: 13,
              fontWeight: 600,
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            Open Closed Orders →
          </a>
        </div>
      )}

      {/* Section 1 — Connection Status (only when connected) */}
      {isConnected && (
      <div style={glassCard()}>
        <p style={sectionTitle}>{t("admin", "invu.connection.title")}</p>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <span style={badgeStyle}>{connectionStatus?.status ?? "DISCONNECTED"}</span>
          {connectionStatus?.status === "EXPIRING_SOON" && connectionStatus.daysUntilExpiry != null && (
            <span style={{ fontSize: 12, color: "#f59e0b" }}>
              {t("admin", "invu.connection.expiresInDays").replace("{days}", String(connectionStatus.daysUntilExpiry))}
            </span>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 24px", fontSize: 12, marginBottom: 16 }}>
          {[
            [t("admin", "invu.connection.lastAuthSuccess"), connectionStatus?.lastAuthSucceededAt],
            [t("admin", "invu.connection.lastAuthFailed"), connectionStatus?.lastAuthFailedAt],
            [t("admin", "invu.connection.lastAuthError"), connectionStatus?.lastAuthError],
            [t("admin", "invu.connection.tokenIssuedAt"), connectionStatus?.tokenIssuedAt],
            [t("admin", "invu.connection.tokenRotatedAt"), connectionStatus?.tokenLastRotatedAt],
            [t("admin", "invu.connection.tokenMasked"), connectionStatus?.accessTokenMasked],
            [t("admin", "invu.connection.apiUserExpiry"), connectionStatus?.apiUserExpiresAt],
            [t("admin", "invu.connection.daysUntilExpiry"), connectionStatus?.daysUntilExpiry != null ? String(connectionStatus.daysUntilExpiry) : null],
            [t("admin", "invu.connection.lastSuccessfulSync"), connectionStatus?.lastSuccessfulSyncAt],
            [t("admin", "invu.connection.lastFailedSync"), connectionStatus?.lastFailedSyncAt],
          ].map(([label, val]) => (
            <div key={label as string}>
              <span style={{ color: "var(--color-text-muted)" }}>{label}:</span>{" "}
              <span style={{ fontFamily: "monospace", wordBreak: "break-all" }}>
                {val ? (label?.toString().includes("At") || label?.toString().includes("Expiry") ? formatDate(val as string) : val) : "—"}
              </span>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {connectionStatus?.credentialId && (
            <>
              <button style={btnSecondary} onClick={handleReauth} disabled={loading}>{t("admin", "invu.connection.reauthenticate")}</button>
              <button style={btnDanger} onClick={handleDisconnect} disabled={loading}>{t("admin", "invu.connection.disconnect")}</button>
            </>
          )}
          <button style={btnSecondary} onClick={handleTestConnection} disabled={loading}>{t("admin", "invu.connection.testConnection")}</button>
        </div>
      </div>
      )}

      {/* Section 2 — Credentials */}
      <div style={glassCard()}>
        <p style={sectionTitle}>{t("admin", "invu.credentials.title")}</p>
        {connectionStatus?.apiUsernameMasked && (
          <div style={{ marginBottom: 12, fontSize: 12, color: "var(--color-text-muted)" }}>
            {t("admin", "invu.connection.currentUsername")}: <span style={{ fontFamily: "monospace" }}>{connectionStatus.apiUsernameMasked}</span>
            {" · "}{t("admin", "invu.connection.apiTypeLabel")}: <span style={{ fontFamily: "monospace" }}>{connectionStatus.apiUserType ?? "—"}</span>
            {" · "}{t("admin", "invu.connection.branchScopedLabel")}: {connectionStatus.branchScoped ? t("admin", "invu.connection.yes") : t("admin", "invu.connection.no")}
            {" · "}{t("admin", "invu.connection.lastUpdated")}: {formatDate(connectionStatus.updatedAt)}
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={labelStyle}>{t("admin", "invu.credentials.username")}</label>
            <input style={inputStyle} type="text" placeholder="INVU API username"
              value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} />
          </div>
          <div>
            <label style={labelStyle}>{t("admin", "invu.credentials.password")}</label>
            <input style={inputStyle} type="password" placeholder={t("admin", "invu.credentials.passwordPlaceholder")}
              value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
          </div>
          <div>
            <label style={labelStyle}>{t("admin", "invu.credentials.apiUserType")}</label>
            <select style={inputStyle} value={form.apiUserType} onChange={(e) => setForm((f) => ({ ...f, apiUserType: e.target.value }))}>
              <option value="API_ADMINISTRATOR">{t("admin", "invu.credentials.apiUserTypeAdmin")}</option>
              <option value="API_BASIC">{t("admin", "invu.credentials.apiUserTypeBasic")}</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>{t("admin", "invu.credentials.apiUserExpiryDate")}</label>
            <input style={inputStyle} type="date"
              value={form.apiUserExpiresAt} onChange={(e) => setForm((f) => ({ ...f, apiUserExpiresAt: e.target.value }))} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="checkbox" id="branchScoped" checked={form.branchScoped}
              onChange={(e) => setForm((f) => ({ ...f, branchScoped: e.target.checked }))} />
            <label htmlFor="branchScoped" style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{t("admin", "invu.credentials.branchScoped")}</label>
          </div>
        </div>
        <div style={{ marginTop: 14 }}>
          <button style={btnPrimary} onClick={handleConnect} disabled={loading}>
            {connectionStatus?.credentialId ? t("admin", "invu.credentials.updateCredentials") : t("admin", "invu.credentials.connect")}
          </button>
        </div>
        <p style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 10 }}>
          {t("admin", "invu.credentials.securityNote")}
        </p>
      </div>

      {/* Section 3 — Branch Mappings (only when connected) */}
      {isConnected && (
      <div style={glassCard()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <p style={{ ...sectionTitle, marginBottom: 0 }}>{t("admin", "invu.branchMapping.title")}</p>
          {connectionStatus?.credentialId && (
            <button style={btnSecondary} onClick={() => setNewMapping((m) => ({ ...m, show: !m.show }))}>
              {newMapping.show ? t("admin", "invu.branchMapping.cancel") : t("admin", "invu.branchMapping.addBranchMapping")}
            </button>
          )}
        </div>

        {newMapping.show && (
          <div style={{ background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.2)", borderRadius: 8, padding: 14, marginBottom: 14, display: "grid", gridTemplateColumns: "1fr 1fr 100px", gap: 10 }}>
            <div>
              <label style={labelStyle}>{t("admin", "invu.branchMapping.invuBranchId")} *</label>
              <input style={inputStyle} type="text" placeholder="e.g. BRANCH_001"
                value={newMapping.invuBranchId} onChange={(e) => setNewMapping((m) => ({ ...m, invuBranchId: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>{t("admin", "invu.branchMapping.invuBranchLabel")}</label>
              <input style={inputStyle} type="text" placeholder="e.g. Main Floor"
                value={newMapping.invuBranchLabel} onChange={(e) => setNewMapping((m) => ({ ...m, invuBranchLabel: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>{t("admin", "invu.branchMapping.syncInterval")}</label>
              <input style={inputStyle} type="number" min={5} max={1440}
                value={newMapping.syncIntervalMinutes} onChange={(e) => setNewMapping((m) => ({ ...m, syncIntervalMinutes: parseInt(e.target.value) }))} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <button style={btnPrimary} onClick={handleAddMapping}>{t("admin", "invu.branchMapping.addMapping")}</button>
            </div>
          </div>
        )}

        {(connectionStatus?.branchMappings ?? []).length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--color-text-muted)" }}>{t("admin", "invu.branchMapping.noMappings")}</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                {[
                  t("admin", "invu.branchMapping.okuVenue"),
                  t("admin", "invu.branchMapping.invuBranchId"),
                  t("admin", "invu.branchMapping.invuBranchLabel"),
                  t("admin", "invu.branchMapping.syncEnabled"),
                  t("admin", "invu.branchMapping.syncInterval"),
                  t("admin", "invu.branchMapping.actions"),
                ].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "6px 8px", color: "var(--color-text-muted)", fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {connectionStatus?.branchMappings.map((m) => {
                const row = mappingFor(m);
                return (
                  <tr key={m.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                    <td style={{ padding: "8px" }}>{venues.find((v) => v.id === m.venueId)?.name ?? m.venueId}</td>
                    <td style={{ padding: "8px" }}>
                      <input style={{ ...inputStyle, width: 140 }} type="text" value={row.invuBranchId}
                        onChange={(e) => editMapping(m.id, "invuBranchId", e.target.value)} />
                    </td>
                    <td style={{ padding: "8px" }}>
                      <input style={{ ...inputStyle, width: 140 }} type="text" value={row.invuBranchLabel ?? ""}
                        onChange={(e) => editMapping(m.id, "invuBranchLabel", e.target.value)} />
                    </td>
                    <td style={{ padding: "8px" }}>
                      <input type="checkbox" checked={row.isSyncEnabled}
                        onChange={(e) => editMapping(m.id, "isSyncEnabled", e.target.checked)} />
                    </td>
                    <td style={{ padding: "8px" }}>
                      <input style={{ ...inputStyle, width: 70 }} type="number" min={5} value={row.syncIntervalMinutes}
                        onChange={(e) => editMapping(m.id, "syncIntervalMinutes", parseInt(e.target.value))} />
                    </td>
                    <td style={{ padding: "8px" }}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button style={{ ...btnSecondary, padding: "4px 10px", fontSize: 11 }} onClick={() => handleSaveMapping(m.id)}>{t("admin", "invu.branchMapping.save")}</button>
                        <button style={{ ...btnDanger, padding: "4px 10px", fontSize: 11 }} onClick={() => handleDeleteMapping(m.id)}>{t("admin", "invu.branchMapping.delete")}</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      )}

      {/* Section 4 — Sync Scope */}
      {(connectionStatus?.branchMappings ?? []).length > 0 && (
        <div style={glassCard()}>
          <p style={sectionTitle}>{t("admin", "invu.syncScope.title")}</p>
          {connectionStatus?.branchMappings.map((m) => {
            const row = mappingFor(m);
            const scope = (row.syncScopeJson ?? {}) as Record<string, boolean>;
            return (
              <div key={m.id} style={{ marginBottom: 14 }}>
                <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
                  {t("admin", "invu.integration.branchPrefix")}{m.invuBranchLabel ?? m.invuBranchId}
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                  {SCOPE_KEYS.map((key) => (
                    <label key={key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
                      <input type="checkbox"
                        checked={scope[key] ?? false}
                        onChange={(e) => {
                          const newScope = { ...scope, [key]: e.target.checked };
                          editMapping(m.id, "syncScopeJson", newScope);
                        }}
                      />
                      {t("admin", `invu.syncScope.${key}`)}
                    </label>
                  ))}
                </div>
                <div style={{ marginTop: 8 }}>
                  <button style={{ ...btnSecondary, fontSize: 11, padding: "4px 12px" }} onClick={() => handleSaveMapping(m.id)}>{t("admin", "invu.syncScope.saveScope")}</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Section 5 — Sync Diagnostics (only when connected) */}
      {isConnected && (
      <div style={glassCard()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <p style={{ ...sectionTitle, marginBottom: 0 }}>{t("admin", "invu.syncDiagnostics.title")}</p>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <a href="/admin/table-sessions" style={{ fontSize: 12, color: "var(--color-accent)", textDecoration: "none", padding: "4px 10px", border: "1px solid var(--color-accent)", borderRadius: 6 }}>
              {t("admin", "invu.syncDiagnostics.tableSessionsLink")}
            </a>
            <a href="/admin/review-queue" style={{ fontSize: 12, color: "var(--color-accent)", textDecoration: "none", padding: "4px 10px", border: "1px solid var(--color-accent)", borderRadius: 6 }}>
              {t("admin", "invu.syncDiagnostics.reviewQueueLink")}
            </a>
            {connectionStatus?.credentialId && (
              <button style={btnPrimary} onClick={handleTriggerSync} disabled={loading}>{t("admin", "invu.syncDiagnostics.triggerManualSync")}</button>
            )}
          </div>
        </div>

        {syncLogs.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--color-text-muted)" }}>{t("admin", "invu.syncDiagnostics.noRuns")}</p>
        ) : (
          <>
            {syncLogs[0] && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
                {[
                  [t("admin", "invu.syncDiagnostics.ordersPulled"), syncLogs[0].ordersPulledCount],
                  [t("admin", "invu.syncDiagnostics.matched"), syncLogs[0].matchedCount],
                  [t("admin", "invu.syncDiagnostics.unmatched"), syncLogs[0].unmatchedCount],
                  [t("admin", "invu.syncDiagnostics.errors"), syncLogs[0].errorCount],
                ].map(([label, val]) => (
                  <div key={label as string} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "12px 16px", textAlign: "center" }}>
                    <div style={{ fontSize: 22, fontWeight: 700 }}>{val}</div>
                    <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 2 }}>{label}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Sync Engine aggregate stats */}
            <SyncEngineStats venueId={selectedVenueId} />

            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                  {[
                    t("admin", "invu.syncDiagnostics.runId"),
                    t("admin", "invu.syncDiagnostics.scope"),
                    t("admin", "invu.syncDiagnostics.triggeredBy"),
                    t("admin", "invu.syncDiagnostics.startedAt"),
                    t("admin", "invu.syncDiagnostics.status"),
                    t("admin", "invu.syncDiagnostics.counts"),
                    "",
                  ].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "6px 8px", color: "var(--color-text-muted)", fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {syncLogs.map((run) => (
                  <React.Fragment key={run.id}>
                    <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                      <td style={{ padding: "8px", fontFamily: "monospace", fontSize: 10 }}>{run.id.slice(-8)}</td>
                      <td style={{ padding: "8px" }}>{run.scopeType}</td>
                      <td style={{ padding: "8px" }}>{run.triggeredByUserId ? run.triggeredByUserId.slice(-8) : t("admin", "invu.syncDiagnostics.system")}</td>
                      <td style={{ padding: "8px" }}>{formatDate(run.startedAt)}</td>
                      <td style={{ padding: "8px" }}>
                        <span style={{ ...statusBadgeStyle(run.status), display: "inline-block", padding: "2px 8px", borderRadius: 12, fontSize: 10 }}>
                          {run.status}
                        </span>
                      </td>
                      <td style={{ padding: "8px" }}>↑{run.ordersPulledCount} ✓{run.matchedCount} ✗{run.errorCount}</td>
                      <td style={{ padding: "8px" }}>
                        {(run.errors?.length ?? 0) > 0 && (
                          <button style={{ ...btnSecondary, padding: "2px 8px", fontSize: 10 }}
                            onClick={() => setExpandedRun(expandedRun === run.id ? null : run.id)}>
                            {expandedRun === run.id ? t("admin", "invu.syncDiagnostics.hideErrors") : t("admin", "invu.syncDiagnostics.showErrors").replace("{count}", String(run.errors!.length))}
                          </button>
                        )}
                      </td>
                    </tr>
                    {expandedRun === run.id && run.errors?.map((err) => (
                      <tr key={err.id} style={{ background: "rgba(239,68,68,0.04)" }}>
                        <td colSpan={7} style={{ padding: "6px 16px", fontSize: 11, color: "#ef4444" }}>
                          {err.errorCode ? `[${err.errorCode}] ` : ""}{err.errorMessage}
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
      )}

      {/* Section 6 — Audit Trail (only when connected) */}
      {isConnected && (
      <div style={glassCard()}>
        <p style={sectionTitle}>{t("admin", "invu.auditTrail.title")}</p>
        {auditLogs.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--color-text-muted)" }}>{t("admin", "invu.auditTrail.noEntries")}</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                {[
                  t("admin", "invu.auditTrail.who"),
                  t("admin", "invu.auditTrail.action"),
                  t("admin", "invu.auditTrail.when"),
                  t("admin", "invu.auditTrail.ip"),
                  t("admin", "invu.auditTrail.notes"),
                ].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "6px 8px", color: "var(--color-text-muted)", fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {auditLogs.map((entry) => (
                <tr key={entry.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                  <td style={{ padding: "8px", fontFamily: "monospace", fontSize: 10 }}>{entry.actorId.slice(-8)}</td>
                  <td style={{ padding: "8px", fontWeight: 600 }}>{entry.action}</td>
                  <td style={{ padding: "8px" }}>{formatDate(entry.createdAt)}</td>
                  <td style={{ padding: "8px", fontFamily: "monospace", fontSize: 10 }}>{entry.ip ?? "—"}</td>
                  <td style={{ padding: "8px", fontSize: 11, color: "var(--color-text-muted)" }}>
                    {entry.metadata ? Object.entries(entry.metadata).filter(([k]) => k !== "credentialId" && k !== "venueId").map(([k, v]) => `${k}: ${v}`).join(" · ") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      )}
    </div>
  );
}

interface SyncStats {
  rawCount: number;
  normalizedCount: number;
  sessionTotal: number;
  matchedCount: number;
  unmatchedCount: number;
  reviewOpenCount: number;
  reviewInReviewCount: number;
  disputedCount: number;
}

interface RecentReviewItem {
  id: string;
  issueType: string;
  summary: string;
}

function SyncEngineStats({ venueId }: { venueId: string }) {
  const t = useTranslation();
  const [stats, setStats] = useState<SyncStats | null>(null);
  const [recentReview, setRecentReview] = useState<RecentReviewItem[]>([]);

  useEffect(() => {
    if (!venueId) return;
    const load = async () => {
      try {
        const [statsRes, reviewRes] = await Promise.all([
          fetch(`/api/v1/admin/integrations/invu/sync-stats?venueId=${venueId}`),
          fetch(`/api/v1/admin/integrations/invu/review-queue?venueId=${venueId}&status=OPEN&limit=5`),
        ]);
        const statsJson = await statsRes.json();
        const reviewJson = await reviewRes.json();
        if (statsJson.ok) setStats(statsJson.data);
        if (reviewJson.ok) setRecentReview(reviewJson.data?.slice(0, 5) ?? []);
      } catch {}
    };
    load();
  }, [venueId]);

  if (!stats) return null;

  const diagnosticCards: [string, number, string][] = [
    [t("admin", "invu.syncEngine.rawRecordsPulled"), stats.rawCount, "#6b7280"],
    [t("admin", "invu.syncEngine.normalizedRecords"), stats.normalizedCount, "#8b5cf6"],
    [t("admin", "invu.syncEngine.sessionsSynced"), stats.sessionTotal, "#3b82f6"],
    [t("admin", "invu.syncEngine.sessionsMatched"), stats.matchedCount, "#10b981"],
    [t("admin", "invu.syncEngine.sessionsUnmatched"), stats.unmatchedCount, "#ef4444"],
    [t("admin", "invu.syncEngine.reviewQueueOpen"), stats.reviewOpenCount, "#f59e0b"],
    [t("admin", "invu.reviewQueue.statusInReview"), stats.reviewInReviewCount, "#f97316"],
    [t("admin", "invu.tableSessions.statusDisputed"), stats.disputedCount, "#ec4899"],
  ];

  return (
    <div style={{ marginBottom: 16, padding: "12px 0", borderTop: "1px solid var(--color-border)", borderBottom: "1px solid var(--color-border)" }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: 10 }}>
        {t("admin", "invu.syncEngine.diagnosticsTitle")}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 12 }}>
        {diagnosticCards.map(([label, val, color]) => (
          <div key={label} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "8px 12px", textAlign: "center" }}>
            <div style={{ fontSize: 18, fontWeight: 700, color }}>{val}</div>
            <div style={{ fontSize: 10, color: "var(--color-text-muted)", marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>
      {recentReview.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-muted)", marginBottom: 6 }}>{t("admin", "invu.syncEngine.recentAnomalies")}</div>
          {recentReview.map((item) => (
            <div key={item.id} style={{ fontSize: 11, padding: "4px 0", borderBottom: "1px solid rgba(128,128,128,0.1)", color: "var(--color-text-muted)" }}>
              <span style={{ color: "#f59e0b", fontWeight: 600 }}>{item.issueType?.replace(/_/g, " ")}</span>
              {" — "}{item.summary?.slice(0, 80)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
