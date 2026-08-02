"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Users, Hash, Building2, Loader2, Plus, ChevronDown, ChevronRight } from "lucide-react";
import AddOperatorModal from "@/components/admin/AddOperatorModal";
import type { OperatorContainer } from "@/lib/operatorContainer";

type Container =
  | { kind: "entity"; parentEntityId: string }
  | { kind: "scope"; scopeType: "GLOBAL" | "VENUE" | "SERIES" | "CAMPAIGN"; scopeId?: string };

type OperatorRow = {
  actorId: string;
  displayName: string;
  actorType: string;
  /** Slug into ReferralActorTypeDef when the actor is on the v2 catalog; null for legacy actors. */
  actorTypeCode: string | null;
  /** Pre-resolved display label from the rollup — uses the catalog's custom label when available. */
  actorTypeLabel: string;
  organizationName: string | null;
  email: string | null;
  status: string;
  user: { id: string; name: string | null; email: string | null } | null;
  referralCode: string | null;
  assignment: {
    id: string;
    scopeType: string;
    scopeId: string | null;
    compensationMode: string;
    rateBps: number | null;
    flatAmountCents: number | null;
    parentEntityId: string | null;
  } | null;
  stats: {
    initiated: number;
    patronized: number;
    covers: number;
    pendingCents: number;
    approvedCents: number;
    paidCents: number;
    grossCents: number;
  };
};

type RollupAggregate = {
  operatorCount: number;
  activeCount: number;
  initiated: number;
  patronized: number;
  covers: number;
  pendingCents: number;
  approvedCents: number;
  paidCents: number;
  grossCents: number;
};

type RollupDto = {
  container: unknown;
  parentEntity: { id: string; displayName: string; type: string } | null;
  range: { from: string; to: string; label: string };
  operators: OperatorRow[];
  aggregate: RollupAggregate;
  legacyStatsAvailable: boolean;
};

const EMPTY_AGG: RollupAggregate = {
  operatorCount: 0, activeCount: 0, initiated: 0, patronized: 0, covers: 0,
  pendingCents: 0, approvedCents: 0, paidCents: 0, grossCents: 0,
};

export type OperatorsPanelProps = {
  container: Container;
  /** Optional override for the panel header. */
  title?: string;
  /** Compact variant — hides the team aggregate strip and uses denser rows. */
  compact?: boolean;
  /** Open the actor's detail surface (e.g. drawer). Falls back to no-op. */
  onOperatorClick?: (actorId: string) => void;
  /** Show the "+ Add operator" CTA. Defaults to false to preserve existing call sites. */
  allowAddOperator?: boolean;
  /** Optional context names used in the modal's confirmation text. */
  contextNames?: { entityName?: string | null; scopeName?: string | null };
};

const COMP_MODE_LABEL: Record<string, string> = {
  NONE: "No commission",
  PERCENT_OF_TRANSACTION: "% of transaction",
  PERCENT_OF_PARENT_COMMISSION: "% of parent commission",
  FLAT_PER_COVER: "Flat / cover",
  FLAT_PER_PARTY: "Flat / party",
};

const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;

function formatRate(mode: string, rateBps: number | null, flatAmountCents: number | null): string {
  switch (mode) {
    case "PERCENT_OF_TRANSACTION":
    case "PERCENT_OF_PARENT_COMMISSION":
      return rateBps != null ? `${(rateBps / 100).toFixed(1)}%` : "—";
    case "FLAT_PER_COVER":
    case "FLAT_PER_PARTY":
      return flatAmountCents != null ? fmt(flatAmountCents) : "—";
    default:
      return "—";
  }
}

export default function OperatorsPanel({
  container, title, compact, onOperatorClick, allowAddOperator, contextNames,
}: OperatorsPanelProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rollup, setRollup] = useState<RollupDto | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);

  // Stable, typed signature for the effect dependency array.
  const containerKey = useMemo(
    () =>
      container.kind === "entity"
        ? `entity:${container.parentEntityId}`
        : `scope:${container.scopeType}:${container.scopeId ?? ""}`,
    [container]
  );

  useEffect(() => {
    const params = new URLSearchParams();
    if (container.kind === "entity") {
      params.set("parentEntityId", container.parentEntityId);
    } else {
      params.set("scopeType", container.scopeType);
      if (container.scopeId) params.set("scopeId", container.scopeId);
    }
    setLoading(true);
    setError(null);
    fetch(`/api/v1/operators/rollup?${params.toString()}`)
      .then(r => r.json())
      .then((d: { ok: boolean; rollup?: RollupDto; error?: string }) => {
        if (d.ok && d.rollup) setRollup(d.rollup);
        else setError(d.error ?? "Failed to load operators");
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
    // containerKey collapses the discriminated union into a primitive so we
    // don't need cast-based dependency hacks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerKey, reloadTick]);

  const modalContainer: OperatorContainer | null = useMemo(() => {
    if (container.kind === "entity") return { kind: "entity", parentEntityId: container.parentEntityId };
    return { kind: "scope", scopeType: container.scopeType, scopeId: container.scopeId };
  }, [container]);

  const handleCreated = useCallback(() => {
    setShowModal(false);
    setReloadTick(t => t + 1);
  }, []);

  if (loading) {
    return (
      <div style={{ padding: 24, display: "flex", alignItems: "center", gap: 8, color: "#9ca3af", fontSize: 13 }}>
        <Loader2 size={14} className="spin" /> Loading operators…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "12px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, color: "#991b1b", fontSize: 13 }}>
        {error}
      </div>
    );
  }

  const allOps: OperatorRow[] = rollup?.operators ?? [];
  const ops: OperatorRow[] = allOps.filter(o => o.status === "ACTIVE");
  const inactiveOps: OperatorRow[] = allOps.filter(o => o.status !== "ACTIVE");
  const agg: RollupAggregate = rollup?.aggregate ?? EMPTY_AGG;
  const parent = rollup?.parentEntity ?? null;

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Users size={14} color="#7d7269" />
          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#7d7269" }}>
            {title ?? "Operators"}
          </h3>
          <span style={{ fontSize: 11, color: "#9ca3af" }}>
            {agg.operatorCount} total · {agg.activeCount} active
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {parent && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "#6b7280" }}>
              <Building2 size={11} /> {parent.displayName}
            </span>
          )}
          {allowAddOperator && (
            <button
              type="button"
              onClick={() => setShowModal(true)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                padding: "6px 12px", fontSize: 12, fontWeight: 600,
                background: "#1a1614", color: "#fff", border: "none",
                borderRadius: 6, cursor: "pointer",
              }}
            >
              <Plus size={12} /> Add operator
            </button>
          )}
        </div>
      </div>

      {/* Honest disclaimer when legacy stats cannot be scoped */}
      {rollup?.legacyStatsAvailable === false && agg.operatorCount > 0 && (
        <div style={{ marginBottom: 12, padding: "8px 12px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, fontSize: 11, color: "#92400e" }}>
          Pre-migration commissions are tied only to a venue-scoped legacy Referrer record and cannot be filtered to this scope. Per-scope dollar totals will populate as v2 actor attributions accrue.
        </div>
      )}

      {/* Aggregate strip */}
      {!compact && agg.operatorCount > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 14 }}>
          <Stat label="Initiated" value={String(agg.initiated)} />
          <Stat label="Covers" value={String(agg.covers)} />
          <Stat label="Gross Comm." value={fmt(agg.grossCents)} />
          <Stat label="Pending" value={fmt(agg.pendingCents)} accent="#92700a" />
        </div>
      )}

      {/* Roster */}
      {ops.length === 0 ? (
        <div style={{ padding: "24px 16px", background: "#fafaf9", border: "1px dashed #e5e0d8", borderRadius: 10, fontSize: 13, color: "#7d7269", textAlign: "center" }}>
          No operators are currently assigned to this {container.kind === "entity" ? "organization" : container.scopeType.toLowerCase()}.
        </div>
      ) : (
        <div style={{ background: "#fff", border: "1px solid #e8e2dd", borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#faf8f6", borderBottom: "1px solid #e8e2dd" }}>
                {["Operator", "Type", "Rate", "Covers", "Gross", "Paid", "Pending"].map(h => (
                  <th key={h} style={{ padding: "10px 12px", fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#7d7269", textAlign: ["Operator", "Type"].includes(h) ? "left" : "right" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ops.map((o) => (
                <tr
                  key={o.actorId}
                  style={{ borderBottom: "1px solid #f0ebe7", cursor: onOperatorClick ? "pointer" : "default" }}
                  onClick={() => onOperatorClick?.(o.actorId)}
                >
                  <td style={{ padding: "10px 12px" }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: "#1a1614" }}>{o.displayName}</div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 2 }}>
                      {o.referralCode && (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, fontFamily: "monospace", color: "#7d7269" }}>
                          <Hash size={10} /> {o.referralCode}
                        </span>
                      )}
                      {o.user && (
                        <span style={{ fontSize: 10, color: "#16a34a" }}>● Login</span>
                      )}
                      {o.status !== "ACTIVE" && (
                        <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 20, background: "#f3f4f6", color: "#6b7280" }}>{o.status}</span>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: "10px 12px", fontSize: 12, color: "#4a403a" }}>
                    {o.actorTypeLabel}
                  </td>
                  <td style={{ padding: "10px 12px", fontSize: 12, textAlign: "right" }}>
                    <div style={{ fontWeight: 600, color: "#1a1614" }}>
                      {formatRate(o.assignment?.compensationMode ?? "NONE", o.assignment?.rateBps ?? null, o.assignment?.flatAmountCents ?? null)}
                    </div>
                    <div style={{ fontSize: 10, color: "#9ca3af" }}>
                      {COMP_MODE_LABEL[o.assignment?.compensationMode ?? "NONE"]}
                    </div>
                  </td>
                  <td style={{ padding: "10px 12px", fontSize: 12, textAlign: "right" }}>{o.stats.covers}</td>
                  <td style={{ padding: "10px 12px", fontSize: 12, textAlign: "right", fontWeight: 600 }}>{fmt(o.stats.grossCents)}</td>
                  <td style={{ padding: "10px 12px", fontSize: 12, textAlign: "right", color: "#1f8a55" }}>{fmt(o.stats.paidCents)}</td>
                  <td style={{ padding: "10px 12px", fontSize: 12, textAlign: "right", color: "#92700a" }}>{fmt(o.stats.pendingCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Inactive operators (collapsed by default) */}
      {inactiveOps.length > 0 && (
        <div style={{ marginTop: 14, border: "1px solid #f0ebe7", borderRadius: 10, background: "#fafaf9" }}>
          <button
            type="button"
            onClick={() => setShowInactive(s => !s)}
            style={{
              width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "10px 14px", background: "none", border: "none", cursor: "pointer",
              fontSize: 12, fontWeight: 600, color: "#6b7280",
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              {showInactive ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              Inactive operators ({inactiveOps.length})
            </span>
          </button>
          {showInactive && (
            <ul style={{ listStyle: "none", margin: 0, padding: "0 14px 12px" }}>
              {inactiveOps.map(o => (
                <li
                  key={o.actorId}
                  onClick={() => onOperatorClick?.(o.actorId)}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "6px 0", borderTop: "1px solid #f0ebe7",
                    cursor: onOperatorClick ? "pointer" : "default",
                    fontSize: 12, color: "#6b7280",
                  }}
                >
                  <span>{o.displayName}</span>
                  <span style={{ display: "inline-flex", gap: 6 }}>
                    <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 20, background: "#f3f4f6" }}>{o.status}</span>
                    {o.referralCode && <code style={{ fontSize: 10, color: "#9ca3af" }}>{o.referralCode}</code>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {rollup?.range && (
        <div style={{ marginTop: 8, fontSize: 10, color: "#9ca3af", textAlign: "right" }}>
          Period: {rollup.range.label}
        </div>
      )}

      {showModal && modalContainer && (
        <AddOperatorModal
          container={modalContainer}
          contextNames={{
            entityName: contextNames?.entityName ?? parent?.displayName ?? null,
            scopeName: contextNames?.scopeName ?? null,
          }}
          onClose={() => setShowModal(false)}
          onCreated={handleCreated}
        />
      )}

      <style jsx>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ background: "#fafaf9", border: "1px solid #f0ebe7", borderRadius: 8, padding: "10px 12px" }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#9ca3af", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: accent ?? "#1a1614" }}>{value}</div>
    </div>
  );
}
