"use client";

import { useState } from "react";

export type AttributionSessionForBind = {
  id: string;
  bookingCode: string;
  // Lifecycle (Task: close attribution loop). Drives the status chip and
  // tells the host where their booking is in the QR → seated → bound →
  // verified pipeline. Optional for backwards compatibility with any older
  // callers that haven't been updated to select the new fields.
  status?:
    | "CAPTURED"
    | "SEATED"
    | "POS_BIND_INTENT_RECORDED"
    | "BOUND_TO_POS"
    | "VERIFIED_POS_SALE"
    | "CANCELED"
    | "EXPIRED";
  source?: "QR_RESERVATION" | "HOST_CHECKIN" | "HOST_WALKIN" | "MANUAL_ADMIN";
  invuOrderId?: string | null;
  bindMethod?: string | null;
  tableSession: {
    id: string;
    openedInvuOrderId: string | null;
    invuReferenceField: string | null;
    invuReferenceWritten?: boolean;
    syncStatus?: string;
    matchStatus?: string;
  } | null;
  bindings: Array<{ id: string; invuOrderId: string; bindingType: string; createdAt: string }>;
};

/** A first INVU bind is valid only once service has reached the seated stage. */
export function isInvuBindingReady(session: AttributionSessionForBind | null): boolean {
  return session?.status === "SEATED";
}

// Visual treatment for each lifecycle status — kept in this file because the
// chip and the bind affordance both consume it.
const STATUS_PILL: Record<
  NonNullable<AttributionSessionForBind["status"]>,
  { label: string; bg: string; border: string; color: string }
> = {
  CAPTURED: {
    label: "Captured · awaiting seat",
    bg: "rgba(200,169,110,0.1)",
    border: "rgba(200,169,110,0.4)",
    color: "#c8a96e",
  },
  SEATED: {
    label: "Seated · awaiting INVU",
    bg: "rgba(96,165,250,0.1)",
    border: "rgba(96,165,250,0.4)",
    color: "#60a5fa",
  },
  POS_BIND_INTENT_RECORDED: {
    label: "Bound · awaiting INVU close",
    bg: "rgba(167,139,250,0.12)",
    border: "rgba(167,139,250,0.4)",
    color: "#c4b5fd",
  },
  // Deprecated — retained for one release cycle so the chip still renders
  // for any in-flight rows that pre-date the bind/intent split.
  BOUND_TO_POS: {
    label: "Bound to INVU",
    bg: "rgba(167,139,250,0.12)",
    border: "rgba(167,139,250,0.4)",
    color: "#c4b5fd",
  },
  VERIFIED_POS_SALE: {
    label: "Verified · sale closed",
    bg: "rgba(16,185,129,0.12)",
    border: "rgba(16,185,129,0.45)",
    color: "#10b981",
  },
  CANCELED: {
    label: "Canceled",
    bg: "rgba(107,114,128,0.1)",
    border: "rgba(107,114,128,0.3)",
    color: "#9ca3af",
  },
  EXPIRED: {
    label: "Expired",
    bg: "rgba(248,113,113,0.08)",
    border: "rgba(248,113,113,0.25)",
    color: "#fca5a5",
  },
};

function StatusChip({ status }: { status: AttributionSessionForBind["status"] }) {
  if (!status) return null;
  const meta = STATUS_PILL[status];
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        padding: "3px 8px",
        borderRadius: 6,
        background: meta.bg,
        border: `1px solid ${meta.border}`,
        color: meta.color,
      }}
    >
      {meta.label}
    </span>
  );
}

type Props = {
  attributionSession: AttributionSessionForBind | null;
  onBound?: () => void;
  compact?: boolean;
  // Reservation table-label (Apr 28 2026). When the host has already
  // seated the guest, surface the seat's table inside the bind form so
  // they can sanity-check that the INVU order id they're about to type
  // belongs to the same table. Mismatch is allowed (servers move parties)
  // but it should be a deliberate override, not a silent typo.
  seatedTableLabel?: string | null;
};

export default function BindInvuOrderControl({ attributionSession, onBound, compact, seatedTableLabel }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [invuOrderId, setInvuOrderId] = useState("");
  const [binding, setBinding] = useState(false);
  const [bindError, setBindError] = useState<string | null>(null);
  const [optimisticBoundId, setOptimisticBoundId] = useState<string | null>(null);

  const session = attributionSession;
  const persistedBoundId =
    session?.tableSession?.openedInvuOrderId ?? session?.bindings?.[0]?.invuOrderId ?? null;
  const boundOrderId = optimisticBoundId ?? persistedBoundId;
  const canBind = !!session && !boundOrderId && isInvuBindingReady(session);

  async function submitBind() {
    if (!session || !invuOrderId.trim()) return;
    setBinding(true);
    setBindError(null);
    try {
      const res = await fetch("/api/v1/host/table-open-bind", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attributionSessionId: session.id,
          invuOrderId: invuOrderId.trim(),
          bindingType: "TABLE_OPEN_BINDING",
        }),
      });
      const d = await res.json();
      if (!res.ok || !d.ok) throw new Error(d?.error ?? "Bind failed");
      setOptimisticBoundId(invuOrderId.trim());
      setShowForm(false);
      setInvuOrderId("");
      onBound?.();
    } catch (e) {
      setBindError(e instanceof Error ? e.message : "Bind failed");
    } finally {
      setBinding(false);
    }
  }

  if (!session) {
    return (
      <div
        style={{
          fontSize: 11,
          color: "#6b7280",
          padding: "8px 10px",
          borderRadius: 8,
          background: "rgba(255,255,255,0.03)",
          border: "1px dashed rgba(255,255,255,0.1)",
        }}
      >
        No attribution session — INVU bind unavailable for this booking.
      </div>
    );
  }

  if (boundOrderId) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 12px",
            borderRadius: 10,
            background: "rgba(16,185,129,0.12)",
            border: "1px solid rgba(16,185,129,0.4)",
            fontSize: 11,
            fontWeight: 700,
            color: "#10b981",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          <span style={{ fontSize: 9, opacity: 0.7 }}>INVU</span>
          Bound · #{boundOrderId}
        </div>
        <StatusChip status={session.status} />
      </div>
    );
  }

  if (!isInvuBindingReady(session)) {
    return (
      <div
        style={{
          fontSize: 11,
          color: "#9ca3af",
          padding: "8px 10px",
          borderRadius: 8,
          background: "rgba(255,255,255,0.03)",
          border: "1px dashed rgba(255,255,255,0.1)",
          lineHeight: 1.45,
        }}
      >
        INVU binding becomes available after the guest is seated and the server has opened the POS table.
      </div>
    );
  }

  if (showForm) {
    return (
      <div
        style={{
          padding: 10,
          borderRadius: 10,
          border: "1px solid rgba(251,191,36,0.3)",
          background: "rgba(251,191,36,0.06)",
        }}
      >
        <div
          style={{
            fontSize: 11,
            color: "#fbbf24",
            fontWeight: 700,
            marginBottom: 8,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          Bind INVU order · {session.bookingCode}
        </div>
        {seatedTableLabel && (
          <div
            style={{
              fontSize: 11,
              color: "#d1d5db",
              marginBottom: 8,
              padding: "6px 10px",
              borderRadius: 8,
              background: "rgba(16,185,129,0.08)",
              border: "1px solid rgba(16,185,129,0.25)",
            }}
          >
            Guest seated at <span style={{ fontWeight: 800, color: "#a7f3d0" }}>{seatedTableLabel}</span> —
            the INVU order you bind should be the one open on this table.
          </div>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            value={invuOrderId}
            onChange={(e) => setInvuOrderId(e.target.value)}
            placeholder="INVU order id (e.g. 4831)"
            autoFocus
            style={{
              flex: 1,
              minWidth: 140,
              padding: "8px 10px",
              borderRadius: 8,
              background: "rgba(0,0,0,0.4)",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "white",
              fontSize: 13,
              outline: "none",
            }}
          />
          <button
            disabled={binding || !invuOrderId.trim()}
            onClick={submitBind}
            style={{
              background: "rgba(251,191,36,0.2)",
              border: "1px solid rgba(251,191,36,0.5)",
              borderRadius: 8,
              padding: "0 14px",
              color: "#fbbf24",
              fontSize: 12,
              fontWeight: 700,
              cursor: binding ? "not-allowed" : "pointer",
              opacity: binding ? 0.5 : 1,
            }}
          >
            {binding ? "Binding…" : "Bind"}
          </button>
          <button
            onClick={() => {
              setShowForm(false);
              setBindError(null);
              setInvuOrderId("");
            }}
            style={{
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 8,
              padding: "0 12px",
              color: "#6b7280",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
        </div>
        {bindError && (
          <div style={{ marginTop: 6, fontSize: 11, color: "#f87171" }}>{bindError}</div>
        )}
        <div style={{ marginTop: 8, fontSize: 10, color: "#9ca3af", lineHeight: 1.4 }}>
          Ask the server which INVU order id they opened on this table, then enter it here.
          Until bound, this reservation will only match heuristically and will land in the review queue.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <button
        onClick={() => setShowForm(true)}
        disabled={!canBind}
        style={{
          background: "rgba(251,191,36,0.12)",
          border: "1px solid rgba(251,191,36,0.4)",
          borderRadius: 9,
          padding: compact ? "5px 10px" : "7px 13px",
          color: "#fbbf24",
          fontSize: compact ? 11 : 12,
          fontWeight: 700,
          cursor: canBind ? "pointer" : "not-allowed",
          letterSpacing: "0.03em",
          opacity: canBind ? 1 : 0.4,
        }}
      >
        Bind opened INVU check
      </button>
      {session.status ? (
        <StatusChip status={session.status} />
      ) : (
        <span
          style={{
            fontSize: 10,
            padding: "3px 8px",
            borderRadius: 6,
            background: "rgba(248,113,113,0.08)",
            border: "1px solid rgba(248,113,113,0.2)",
            color: "#fca5a5",
            fontWeight: 600,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          Not bound to INVU
        </span>
      )}
    </div>
  );
}
