"use client";

import { useState } from "react";
import { useTranslation } from "@/components/i18n/LocaleProvider";

// ─── Shared types ─────────────────────────────────────────────────────────────

/** Lightweight per-actor row passed from the server — counts only, no detail. */
export interface ActorSummary {
  candidateActorId: string;
  displayName: string | null;
  email: string | null;
  actorType: string | null;
  unresolvedCount: number;
}

/** Full conflict entry, fetched lazily when a drawer opens. */
interface ConflictEntry {
  conflictAuditId: string;
  incomingUserId: string | null;
  incomingUser: { id: string; name: string | null; email: string | null } | null;
  matchField: string | null;
  provisioningPath: string;
  createdAt: string;
}

/** Full group from GET /api/v1/admin/referrals/actors/merge-conflicts */
interface ConflictGroup {
  candidateActorId: string;
  candidateActor: { id: string; displayName: string; email: string | null; actorType: string } | null;
  candidateUser: { id: string; name: string | null; email: string | null } | null;
  conflicts: ConflictEntry[];
  unresolvedCount: number;
}

interface ApiResponse {
  ok: boolean;
  groups?: ConflictGroup[];
  error?: string;
}

interface Props {
  /** Lightweight actor summaries — badge count only, no detail preloaded. */
  initial: ActorSummary[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function matchFieldKey(field: string | null): string {
  const map: Record<string, string> = {
    email: "matchField_email",
    phone: "matchField_phone",
    whatsapp: "matchField_whatsapp",
    userId: "matchField_userId",
    referralCode: "matchField_referralCode",
    eventBridge: "matchField_eventBridge",
    legacyReferrer: "matchField_legacyReferrer",
  };
  return map[field ?? ""] ?? "matchField_unknown";
}

// ─── Per-conflict resolution row ──────────────────────────────────────────────

function ConflictRow({
  conflict,
  actorId,
  onResolved,
}: {
  conflict: ConflictEntry;
  actorId: string;
  onResolved: (conflictAuditId: string) => void;
}) {
  const t = useTranslation();
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolved, setResolved] = useState<"link" | "separate" | null>(null);

  async function handleResolve(decision: "link" | "separate") {
    if (!reason.trim()) {
      setError(t("referrals", "mergeConflicts.reasonRequired"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/admin/referrals/actors/${actorId}/merge-resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision,
          reason: reason.trim(),
          conflictAuditId: conflict.conflictAuditId,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? t("referrals", "mergeConflicts.networkError"));
        return;
      }
      setResolved(decision);
      setTimeout(() => onResolved(conflict.conflictAuditId), 900);
    } catch {
      setError(t("referrals", "mergeConflicts.networkError"));
    } finally {
      setSubmitting(false);
    }
  }

  if (resolved) {
    return (
      <div
        style={{
          padding: "10px 14px",
          borderRadius: 6,
          background: "var(--color-success-bg, #dcfce7)",
          color: "var(--color-success, #16a34a)",
          fontSize: 13,
          marginBottom: 10,
        }}
      >
        {resolved === "link"
          ? t("referrals", "mergeConflicts.successLink")
          : t("referrals", "mergeConflicts.successSeparate")}
      </div>
    );
  }

  return (
    <div
      style={{
        border: "1px solid var(--color-border)",
        borderRadius: 8,
        padding: 14,
        marginBottom: 12,
        background: "var(--color-surface-raised, #f9fafb)",
      }}
    >
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <span
          style={{
            display: "inline-block",
            fontSize: 11,
            fontWeight: 700,
            padding: "2px 8px",
            borderRadius: 4,
            background: "var(--color-warning-bg, #fef3c7)",
            color: "var(--color-warning, #b45309)",
            textTransform: "uppercase",
          }}
        >
          {t("referrals", `mergeConflicts.${matchFieldKey(conflict.matchField)}`)}
        </span>
        <span style={{ fontSize: 12, color: "var(--color-text-muted)", lineHeight: "22px" }}>
          {new Date(conflict.createdAt).toLocaleString()}
        </span>
      </div>

      <div style={{ marginBottom: 10 }}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "var(--color-text-muted)",
            marginBottom: 4,
          }}
        >
          {t("referrals", "mergeConflicts.sideIncomingUser")}
        </div>
        {conflict.incomingUser ? (
          <div>
            <span style={{ fontSize: 13, fontWeight: 600 }}>
              {conflict.incomingUser.name ?? "—"}
            </span>
            {conflict.incomingUser.email && (
              <span style={{ fontSize: 12, color: "var(--color-text-muted)", marginLeft: 6 }}>
                {conflict.incomingUser.email}
              </span>
            )}
          </div>
        ) : (
          <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
            {conflict.incomingUserId ?? t("referrals", "mergeConflicts.noUserId")}
          </span>
        )}
      </div>

      <div style={{ marginBottom: 10 }}>
        <span style={{ fontSize: 11, color: "var(--color-text-muted)", fontFamily: "monospace" }}>
          {conflict.provisioningPath}
        </span>
      </div>

      <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
        {t("referrals", "mergeConflicts.reasonLabel")}{" "}
        <span style={{ color: "var(--color-danger, #dc2626)" }}>*</span>
      </label>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        placeholder={t("referrals", "mergeConflicts.reasonPlaceholder")}
        style={{
          width: "100%",
          padding: "7px 10px",
          fontSize: 12,
          borderRadius: 6,
          border: "1px solid var(--color-border)",
          resize: "vertical",
          fontFamily: "inherit",
          background: "var(--color-input-bg, #fff)",
          boxSizing: "border-box",
          marginBottom: 8,
        }}
      />

      {error && (
        <div
          style={{
            padding: "7px 10px",
            borderRadius: 5,
            background: "var(--color-danger-bg, #fee2e2)",
            color: "var(--color-danger, #dc2626)",
            fontSize: 12,
            marginBottom: 8,
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={() => handleResolve("link")}
          disabled={submitting || !reason.trim()}
          style={{
            flex: 1,
            padding: "7px 12px",
            fontSize: 12,
            fontWeight: 600,
            borderRadius: 5,
            border: "none",
            background:
              submitting || !reason.trim()
                ? "var(--color-border)"
                : "var(--color-primary, #1a1a2e)",
            color: submitting || !reason.trim() ? "var(--color-text-muted)" : "#fff",
            cursor: submitting || !reason.trim() ? "not-allowed" : "pointer",
          }}
        >
          {submitting ? t("referrals", "mergeConflicts.btnResolving") : t("referrals", "mergeConflicts.btnLink")}
        </button>
        <button
          onClick={() => handleResolve("separate")}
          disabled={submitting || !reason.trim()}
          style={{
            flex: 1,
            padding: "7px 12px",
            fontSize: 12,
            fontWeight: 600,
            borderRadius: 5,
            border: "1.5px solid var(--color-primary, #1a1a2e)",
            background: "transparent",
            color:
              submitting || !reason.trim()
                ? "var(--color-text-muted)"
                : "var(--color-primary, #1a1a2e)",
            cursor: submitting || !reason.trim() ? "not-allowed" : "pointer",
          }}
        >
          {submitting ? t("referrals", "mergeConflicts.btnResolving") : t("referrals", "mergeConflicts.btnSeparate")}
        </button>
      </div>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export default function MergeConflictsPanel({ initial }: Props) {
  const t = useTranslation();
  const [summaries, setSummaries] = useState<ActorSummary[]>(initial);
  const [openActorId, setOpenActorId] = useState<string | null>(null);
  const [drawerGroup, setDrawerGroup] = useState<ConflictGroup | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerError, setDrawerError] = useState<string | null>(null);

  async function openDrawer(candidateActorId: string) {
    setOpenActorId(candidateActorId);
    setDrawerGroup(null);
    setDrawerLoading(true);
    setDrawerError(null);
    try {
      const res = await fetch("/api/v1/admin/referrals/actors/merge-conflicts");
      const data: ApiResponse = await res.json();
      if (!data.ok || !data.groups) {
        setDrawerError(data.error ?? t("referrals", "mergeConflicts.networkError"));
        return;
      }
      const group = data.groups.find((g) => g.candidateActorId === candidateActorId) ?? null;
      setDrawerGroup(group);
    } catch {
      setDrawerError(t("referrals", "mergeConflicts.networkError"));
    } finally {
      setDrawerLoading(false);
    }
  }

  function closeDrawer() {
    setOpenActorId(null);
    setDrawerGroup(null);
    setDrawerLoading(false);
    setDrawerError(null);
  }

  function handleConflictResolved(candidateActorId: string, conflictAuditId: string) {
    // Remove resolved conflict from drawer group
    setDrawerGroup((prev) => {
      if (!prev || prev.candidateActorId !== candidateActorId) return prev;
      const remaining = prev.conflicts.filter((c) => c.conflictAuditId !== conflictAuditId);
      if (remaining.length === 0) {
        setTimeout(closeDrawer, 300);
        return null;
      }
      return { ...prev, conflicts: remaining, unresolvedCount: remaining.length };
    });

    // Decrement or remove actor from list
    setSummaries((prev) =>
      prev
        .map((s) =>
          s.candidateActorId === candidateActorId
            ? { ...s, unresolvedCount: Math.max(0, s.unresolvedCount - 1) }
            : s,
        )
        .filter((s) => s.unresolvedCount > 0),
    );
  }

  return (
    <div>
      {/* ── Actor list ─────────────────────────────────────────────────────── */}
      {summaries.length === 0 ? (
        <div
          style={{
            padding: "48px 24px",
            textAlign: "center",
            color: "var(--color-text-muted)",
            fontSize: 14,
          }}
        >
          {t("referrals", "mergeConflicts.noConflicts")}
        </div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
              {[
                t("referrals", "mergeConflicts.colExistingActor"),
                t("referrals", "mergeConflicts.colMatchedOn"),
                "",
              ].map((h, i) => (
                <th
                  key={i}
                  style={{
                    textAlign: "left",
                    padding: "8px 12px",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--color-text-muted)",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {summaries.map((summary) => (
              <tr
                key={summary.candidateActorId}
                style={{ borderBottom: "1px solid var(--color-border)" }}
              >
                <td style={{ padding: "12px" }}>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>
                    {summary.displayName ?? summary.candidateActorId}
                  </div>
                  {summary.email && (
                    <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                      {summary.email}
                    </div>
                  )}
                  {summary.actorType && (
                    <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 1 }}>
                      {summary.actorType.replace(/_/g, " ")}
                    </div>
                  )}
                </td>
                <td style={{ padding: "12px" }}>
                  <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                    {t("referrals", "mergeConflicts.colDetected")}
                  </span>
                </td>
                <td style={{ padding: "12px" }}>
                  <button
                    onClick={() => openDrawer(summary.candidateActorId)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "4px 10px",
                      fontSize: 12,
                      fontWeight: 600,
                      borderRadius: 4,
                      border: "1.5px solid var(--color-warning, #b45309)",
                      background: "transparent",
                      color: "var(--color-warning, #b45309)",
                      cursor: "pointer",
                    }}
                  >
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        minWidth: 18,
                        height: 18,
                        padding: "0 5px",
                        borderRadius: 9,
                        background: "var(--color-warning, #b45309)",
                        color: "#fff",
                        fontSize: 11,
                        fontWeight: 700,
                      }}
                    >
                      {summary.unresolvedCount}
                    </span>
                    {t("referrals", "mergeConflicts.badge")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* ── Drawer ─────────────────────────────────────────────────────────── */}
      {openActorId && (
        <>
          <div
            onClick={closeDrawer}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.35)",
              zIndex: 1000,
            }}
          />
          <aside
            style={{
              position: "fixed",
              top: 0,
              right: 0,
              bottom: 0,
              width: "min(520px, 95vw)",
              background: "var(--color-surface, #fff)",
              boxShadow: "-4px 0 32px rgba(0,0,0,0.15)",
              zIndex: 1001,
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: "20px 24px 16px",
                borderBottom: "1px solid var(--color-border)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--color-text-muted)",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    marginBottom: 2,
                  }}
                >
                  {t("referrals", "mergeConflicts.sideExistingActor")}
                </div>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
                  {drawerGroup?.candidateActor?.displayName ??
                    summaries.find((s) => s.candidateActorId === openActorId)?.displayName ??
                    openActorId}
                </h2>
                {drawerGroup?.candidateUser && (
                  <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 2 }}>
                    {t("referrals", "mergeConflicts.ownerLabel")}:{" "}
                    {drawerGroup.candidateUser.name ?? "—"}
                    {drawerGroup.candidateUser.email
                      ? ` · ${drawerGroup.candidateUser.email}`
                      : ""}
                  </div>
                )}
              </div>
              <button
                onClick={closeDrawer}
                aria-label={t("referrals", "mergeConflicts.close")}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: 20,
                  cursor: "pointer",
                  color: "var(--color-text-muted)",
                  lineHeight: 1,
                  padding: "4px 6px",
                  marginTop: -2,
                }}
              >
                ×
              </button>
            </div>

            {/* Info banner */}
            <div
              style={{
                margin: "12px 24px 0",
                padding: "10px 14px",
                borderRadius: 6,
                background: "var(--color-surface-raised, #f9fafb)",
                border: "1px solid var(--color-border)",
                fontSize: 12,
                color: "var(--color-text-muted)",
              }}
            >
              {t("referrals", "mergeConflicts.infoLink")}
              {" "}
              {t("referrals", "mergeConflicts.infoSeparate")}
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px 24px" }}>
              {drawerLoading && (
                <div
                  style={{
                    padding: "32px 0",
                    textAlign: "center",
                    color: "var(--color-text-muted)",
                    fontSize: 13,
                  }}
                >
                  {t("referrals", "mergeConflicts.drawerLoading")}
                </div>
              )}
              {drawerError && (
                <div
                  style={{
                    padding: "10px 14px",
                    borderRadius: 6,
                    background: "var(--color-danger-bg, #fee2e2)",
                    color: "var(--color-danger, #dc2626)",
                    fontSize: 13,
                  }}
                >
                  {drawerError}
                </div>
              )}
              {drawerGroup?.conflicts.map((conflict) => (
                <ConflictRow
                  key={conflict.conflictAuditId}
                  conflict={conflict}
                  actorId={openActorId}
                  onResolved={(auditId) =>
                    handleConflictResolved(openActorId, auditId)
                  }
                />
              ))}
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
