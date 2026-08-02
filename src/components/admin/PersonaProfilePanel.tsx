"use client";

import { useEffect, useState, useCallback } from "react";
import AddOperatorModal from "@/components/admin/AddOperatorModal";

// ── Referrer resolution card ─────────────────────────────────────────────────

type ReferrerResolutionState =
  | "resolved_v2"
  | "actor_no_link"
  | "actor_unlinked"
  | "resolved_legacy"
  | "unresolved"
  | "not_applicable"
  | "merge_required";

type ResolutionActor = {
  id: string;
  displayName: string;
  actorType: string;
  actorTypeCode: string | null;
  activeLinkCount: number;
};

type ResolutionLegacy = {
  id: string;
  fullName: string;
  referrerType: string;
  referralCode: string;
};

type ReferrerResolutionData = {
  state: ReferrerResolutionState;
  label: string;
  reason: string;
  actor: ResolutionActor | null;
  legacyReferrer: ResolutionLegacy | null;
};

const RESOLUTION_STATE_STYLE: Record<
  ReferrerResolutionState,
  { bg: string; color: string; border: string; dot: string }
> = {
  resolved_v2:      { bg: "#ecfdf5", color: "#065f46", border: "#a7f3d0", dot: "●" },
  actor_no_link:    { bg: "#fffbeb", color: "#92400e", border: "#fde68a", dot: "◑" },
  actor_unlinked:   { bg: "#fffbeb", color: "#92400e", border: "#fde68a", dot: "◑" },
  resolved_legacy:  { bg: "#f0f9ff", color: "#0c4a6e", border: "#bae6fd", dot: "○" },
  unresolved:       { bg: "#fef2f2", color: "#991b1b", border: "#fecaca", dot: "○" },
  not_applicable:   { bg: "#f9fafb", color: "#6b7280", border: "#e5e7eb", dot: "–" },
  merge_required:   { bg: "#fef3c7", color: "#92400e", border: "#fcd34d", dot: "⚠" },
};

function ReferrerResolutionCard({ userId }: { userId: string }) {
  const [resolution, setResolution] = useState<ReferrerResolutionData | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [resolveMsg, setResolveMsg] = useState<{ text: string; error?: boolean } | null>(null);

  const load = useCallback(async () => {
    setLoadErr(null);
    try {
      const r = await fetch(`/api/v1/admin/users/${userId}/referrer-resolution`);
      const d = await r.json();
      if (d.ok) setResolution(d.resolution);
      else setLoadErr(d.error ?? "Failed to load");
    } catch {
      setLoadErr("Network error");
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const doResolve = async (mode: "link" | "create" | "create_link", actorId?: string) => {
    setResolving(true);
    setResolveMsg(null);
    try {
      const r = await fetch(`/api/v1/admin/users/${userId}/referrer-resolution/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, actorId }),
      });
      const d = await r.json();
      if (d.ok) {
        setResolution(d.resolution);
        setResolveMsg({ text: "Done — referrer profile resolved." });
        setTimeout(() => setResolveMsg(null), 3500);
      } else {
        setResolveMsg({ text: d.error ?? "Resolve failed", error: true });
      }
    } catch {
      setResolveMsg({ text: "Network error", error: true });
    } finally {
      setResolving(false);
    }
  };

  if (loadErr) {
    return (
      <div style={{ padding: "10px 14px", background: "#fef2f2", borderRadius: 8, fontSize: 12, color: "#dc2626", border: "1px solid #fecaca" }}>
        Could not load referrer resolution: {loadErr}
      </div>
    );
  }
  if (!resolution) {
    return <p style={{ fontSize: 12, color: "#9ca3af" }}>Loading referrer resolution…</p>;
  }

  // Not a referrer-capable user — hide the card entirely.
  if (resolution.state === "not_applicable") return null;

  const style = RESOLUTION_STATE_STYLE[resolution.state];
  // merge_required is informational only; no action buttons.
  const isActionable = ["actor_no_link", "actor_unlinked", "unresolved"].includes(resolution.state);

  return (
    <div>
      <SectionTitle>Referrer Profile</SectionTitle>
      <p style={{ fontSize: 12, color: "var(--color-text-muted, #7d7269)", marginBottom: 12 }}>
        Diagnosis of this user&apos;s referrer identity — actor linkage and active referral code status.
      </p>
    <div style={{ border: "1px solid var(--color-border, #e8e2dd)", borderRadius: 12, overflow: "hidden" }}>
      {/* State badge */}
      <div style={{
        padding: "8px 14px", fontSize: 11, fontWeight: 700,
        background: style.bg, color: style.color, border: `1px solid ${style.border}`,
        display: "flex", alignItems: "center", gap: 8,
        borderRadius: "11px 11px 0 0",
      }}>
        <span>{style.dot} {resolution.label}</span>
        {resolution.actor && (
          <span style={{ fontWeight: 400, opacity: 0.85 }}>
            · {resolution.actor.displayName}
            {resolution.actor.actorTypeCode ? ` (${resolution.actor.actorTypeCode})` : ` (${resolution.actor.actorType})`}
          </span>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: "12px 14px", background: "#fafaf9" }}>
        <p style={{ fontSize: 12, color: "#5f5750", margin: "0 0 10px", lineHeight: 1.5 }}>
          {resolution.reason}
        </p>

        {resolution.legacyReferrer && (
          <div style={{ fontSize: 11, color: "#7d7269", marginBottom: 10 }}>
            Legacy record: <strong>{resolution.legacyReferrer.fullName}</strong>
            {" "}({resolution.legacyReferrer.referrerType}) · code{" "}
            <code style={{ background: "#ede8e1", padding: "1px 5px", borderRadius: 3 }}>
              {resolution.legacyReferrer.referralCode}
            </code>
          </div>
        )}

        {resolveMsg && (
          <div style={{
            padding: "6px 10px", fontSize: 12, borderRadius: 6, marginBottom: 10,
            background: resolveMsg.error ? "#fef2f2" : "#f0fdf4",
            color: resolveMsg.error ? "#dc2626" : "#15803d",
            border: `1px solid ${resolveMsg.error ? "#fecaca" : "#bbf7d0"}`,
          }}>
            {resolveMsg.text}
          </div>
        )}

        {isActionable && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {resolution.state === "actor_no_link" && (
              <button
                onClick={() => doResolve("create_link")}
                disabled={resolving}
                style={{
                  padding: "6px 14px", fontSize: 12, fontWeight: 700,
                  background: "#1a1614", color: "#fff", border: "none",
                  borderRadius: 7, cursor: resolving ? "not-allowed" : "pointer",
                  opacity: resolving ? 0.6 : 1,
                }}
              >
                {resolving ? "Working…" : "Create Referral Code"}
              </button>
            )}
            {resolution.state === "actor_unlinked" && resolution.actor && (
              <button
                onClick={() => doResolve("link", resolution.actor!.id)}
                disabled={resolving}
                style={{
                  padding: "6px 14px", fontSize: 12, fontWeight: 700,
                  background: "#1a1614", color: "#fff", border: "none",
                  borderRadius: 7, cursor: resolving ? "not-allowed" : "pointer",
                  opacity: resolving ? 0.6 : 1,
                }}
              >
                {resolving ? "Working…" : "Link Actor to User"}
              </button>
            )}
            {resolution.state === "unresolved" && (
              <button
                onClick={() => doResolve("create")}
                disabled={resolving}
                style={{
                  padding: "6px 14px", fontSize: 12, fontWeight: 700,
                  background: "#1a1614", color: "#fff", border: "none",
                  borderRadius: 7, cursor: resolving ? "not-allowed" : "pointer",
                  opacity: resolving ? 0.6 : 1,
                }}
              >
                {resolving ? "Working…" : "Create Referrer Profile"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
    </div>
  );
}

const REFERRER_TYPE_LABELS: Record<string, string> = {
  STREETSIDE_HOST: "Streetside Host",
  TAXI_DRIVER:     "Taxi Driver",
  TOUR_GUIDE:      "Tour Guide",
  HOTEL_CONCIERGE: "Hotel Concierge",
  PARTNER:         "Partner",
};

const COMP_MODEL_LABELS: Record<string, string> = {
  COMMISSION_ONLY:              "Commission Only",
  COMMISSION_PLUS_HOURLY:       "Commission + Hourly",
  HOURLY_ONLY:                  "Hourly Only",
  FIXED_SALARY:                 "Fixed Salary",
  FIXED_SALARY_PLUS_COMMISSION: "Salary + Commission",
  FLAT_PER_SEATED_PARTY:        "Flat Per Party",
  FLAT_PER_SEATED_COVER:        "Flat Per Cover",
  CUSTOM:                       "Custom",
};

const fmtMoney = (cents: number) => `$${((cents ?? 0) / 100).toFixed(2)}`;

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--color-text-muted, #7d7269)", margin: "0 0 12px" }}>
      {children}
    </h3>
  );
}

const SCOPE_LABEL: Record<string, string> = {
  GLOBAL: "Global",
  SERIES: "Series",
  CAMPAIGN: "Campaign",
  VENUE: "Venue",
};
// Aligned with prisma `ReferralCompensationMode` enum.
const COMP_MODE_LABEL: Record<string, string> = {
  NONE: "—",
  PERCENT_OF_TRANSACTION: "% of transaction",
  PERCENT_OF_PARENT_COMMISSION: "% of parent commission",
  FLAT_PER_COVER: "Flat / cover",
  FLAT_PER_PARTY: "Flat / party",
};

type ActorAssignment = {
  id: string;
  scopeType: string;
  scopeId: string | null;
  parentEntityId: string | null;
  parentEntityType: string | null;
  isActive: boolean;
  compensationMode: string;
  rateBps: number | null;
  flatAmountCents: number | null;
};

type ActorRecord = {
  id: string;
  displayName: string | null;
  actorType: string | null;
  organizationName: string | null;
  assignments?: ActorAssignment[];
};

type ActorDashboard = {
  ok: true;
  assignments: ActorAssignment[];
  commissionStats: { pendingCents: number; approvedCents: number; paidCents: number; totalCents: number; entryCount: number };
  attributionStats: { total: number; arrived: number; seated: number; completed: number };
};

type LegacyReferrerRef = { id: string; fullName?: string | null } | null | undefined;

function ActorPrimaryBlock({
  actor, dashboard, legacyReferrer, parentEntities, onUnlink, saving,
}: {
  actor: ActorRecord;
  dashboard: ActorDashboard | null;
  legacyReferrer: LegacyReferrerRef;
  parentEntities: Map<string, { id: string; displayName: string; type: string }>;
  onUnlink: () => void;
  saving: boolean;
}) {
  const stats = dashboard?.commissionStats;
  const attrib = dashboard?.attributionStats;
  const assignments: ActorAssignment[] = dashboard?.assignments ?? actor.assignments ?? [];
  return (
    <div style={{ background: "#f8f5f3", border: "1px solid var(--color-border, #e8e2dd)", borderRadius: 12, padding: 20 }}>
      <div style={{
        marginBottom: 14, padding: "8px 12px", borderRadius: 8, fontSize: 11, fontWeight: 600,
        display: "flex", alignItems: "center", gap: 8,
        background: "#ecfdf5", color: "#065f46", border: "1px solid #a7f3d0",
      }}>
        <span>● ReferralActor v2 (primary)</span>
        <span style={{ fontWeight: 400, opacity: 0.85 }}>
          {assignments.length} active assignment{assignments.length === 1 ? "" : "s"}
          {legacyReferrer ? " · legacy Referrer linked for stat cross-walk" : ""}
        </span>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--color-text-muted, #7d7269)", marginBottom: 4 }}>Operator</div>
          <div style={{ fontFamily: "var(--font-heading)", fontSize: 20, fontWeight: 400 }}>{actor.displayName ?? "—"}</div>
          <div style={{ fontSize: 12, color: "var(--color-text-muted, #7d7269)" }}>
            {actor.actorType ?? "—"}
            {actor.organizationName ? ` · ${actor.organizationName}` : ""}
          </div>
        </div>
        {legacyReferrer && (
          <div style={{ display: "flex", gap: 8 }}>
            <a
              href={`/admin/compensation?referrerId=${legacyReferrer.id}`}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: 11, color: "#1a1614", background: "none", border: "1px solid var(--color-border, #e8e2dd)", borderRadius: 6, padding: "4px 10px", textDecoration: "none", fontWeight: 700, whiteSpace: "nowrap" }}
              title="Open the referrer record in the Compensation admin"
            >
              Open Referrer ↗
            </a>
            <button onClick={onUnlink} disabled={saving} style={{ fontSize: 11, color: "#dc2626", background: "none", border: "1px solid #fca5a5", borderRadius: 6, padding: "4px 10px", cursor: saving ? "not-allowed" : "pointer", fontWeight: 700 }}>
              Unlink Persona
            </button>
          </div>
        )}
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-muted, #7d7269)", marginBottom: 6 }}>Assignments</div>
        {assignments.length === 0 ? (
          <div style={{ fontSize: 12, color: "#9b8f85", padding: "10px 12px", border: "1px dashed #e5e0d8", borderRadius: 8 }}>None yet.</div>
        ) : (
          <div style={{ display: "grid", gap: 6 }}>
            {assignments.map((a) => {
              const parent = a.parentEntityId ? parentEntities.get(a.parentEntityId) : null;
              return (
                <div key={a.id} style={{ background: "#fff", border: "1px solid #ece6df", borderRadius: 8, padding: "8px 12px", display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12 }}>
                  <span>
                    <strong>{SCOPE_LABEL[a.scopeType] ?? a.scopeType}</strong>
                    {a.scopeId ? <span style={{ color: "#9b8f85" }}> · {a.scopeId.slice(0, 8)}…</span> : null}
                    {parent ? (
                      <span style={{ color: "#5f5750" }}> · rolls up to <strong>{parent.displayName}</strong></span>
                    ) : a.parentEntityId ? (
                      <span style={{ color: "#9b8f85" }}> · org {a.parentEntityId.slice(0, 8)}…</span>
                    ) : null}
                  </span>
                  <span style={{ color: "#5f5750" }}>
                    {COMP_MODE_LABEL[a.compensationMode] ?? a.compensationMode}
                    {a.rateBps ? ` · ${(a.rateBps / 100).toFixed(2)}%` : ""}
                    {a.flatAmountCents ? ` · ${fmtMoney(a.flatAmountCents)}` : ""}
                    {a.isActive === false ? " · inactive" : ""}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {stats && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
          <Stat label="Attributions" value={String(attrib?.total ?? 0)} />
          <Stat label="Pending" value={fmtMoney(stats.pendingCents ?? 0)} />
          <Stat label="Approved" value={fmtMoney(stats.approvedCents ?? 0)} />
          <Stat label="Paid" value={fmtMoney(stats.paidCents ?? 0)} />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "#f8f5f3", borderRadius: 8, padding: "10px 14px", border: "1px solid var(--color-border, #e8e2dd)" }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--color-text-muted, #7d7269)", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text, #1a1614)", wordBreak: "break-word" }}>{value}</div>
    </div>
  );
}

export type PersonaProfilePanelProps = {
  /** When provided, the panel fetches the user (with linked referrer) and supports linking. */
  userId?: string | null;
  /** When provided (and `userId` is absent), resolves the actor by legacy Referrer.id —
   *  required for referrers that have no linked platform user. */
  referrerId?: string | null;
  /** Optional callback after a link/unlink/plan change so parents can refresh. */
  onChange?: () => void;
  /** Pre-fetched user record (avoids an extra request when the parent already has it). */
  initialUser?: any;
  /** Show a friendly empty state (e.g., for company entities without a platform account). */
  emptyMessage?: string;
};

export default function PersonaProfilePanel({
  userId,
  referrerId,
  onChange,
  initialUser,
  emptyMessage,
}: PersonaProfilePanelProps) {
  const [user, setUser] = useState<any>(initialUser ?? null);
  const [compensation, setCompensation] = useState<any>(null);
  const [availableReferrers, setAvailableReferrers] = useState<any[]>([]);
  const [actor, setActor] = useState<ActorRecord | null>(null);
  const [actorDashboard, setActorDashboard] = useState<ActorDashboard | null>(null);
  const [parentEntities, setParentEntities] = useState<Map<string, { id: string; displayName: string; type: string }>>(new Map());
  const [linkReferrerId, setLinkReferrerId] = useState("");
  const [newPlanId, setNewPlanId] = useState("");
  const [loading, setLoading] = useState(false);
  const [compLoading, setCompLoading] = useState(false);
  const [refLoading, setRefLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [showAddOperator, setShowAddOperator] = useState(false);

  const flash = (text: string, error = false) => {
    setMsg({ text, error });
    setTimeout(() => setMsg(null), 3500);
  };

  const fetchUser = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/v1/admin/users/${userId}`);
      const d = await r.json();
      if (d.ok) setUser(d.data);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const fetchCompensation = useCallback(async () => {
    if (!userId) return;
    setCompLoading(true);
    try {
      const r = await fetch(`/api/v1/admin/users/${userId}/compensation`);
      const d = await r.json();
      if (d.ok) setCompensation(d.data);
    } finally {
      setCompLoading(false);
    }
  }, [userId]);

  const fetchActor = useCallback(async () => {
    if (!userId && !referrerId) return;
    try {
      const url = userId
        ? `/api/v1/admin/users/${userId}/referral-actor`
        : `/api/v1/admin/referrers/${referrerId}/referral-actor`;
      const r = await fetch(url);
      const d = await r.json() as { ok: boolean; actor?: ActorRecord | null };
      if (!d.ok) return;
      setActor(d.actor ?? null);
      if (d.actor?.id) {
        const dash = await fetch(`/api/v1/referral-actors/${d.actor.id}/dashboard`).then(x => x.json() as Promise<ActorDashboard | { ok: false }>).catch(() => null);
        if (dash && dash.ok) {
          setActorDashboard(dash);
          // Resolve parent entity names so assignments show "rolls up to <name>".
          const parentIds = Array.from(new Set(
            dash.assignments.map(a => a.parentEntityId).filter((x): x is string => !!x)
          ));
          if (parentIds.length > 0) {
            try {
              const ents = await Promise.all(parentIds.map(id =>
                fetch(`/api/v1/admin/entities/${id}`).then(x => x.json()).catch(() => null)
              ));
              const map = new Map<string, { id: string; displayName: string; type: string }>();
              for (const e of ents) {
                const ent = e?.entity ?? e?.data ?? e;
                if (ent?.id && ent?.displayName) map.set(ent.id, { id: ent.id, displayName: ent.displayName, type: ent.type ?? "" });
              }
              setParentEntities(map);
            } catch {}
          }
        }
      }
    } catch {}
  }, [userId, referrerId]);

  const fetchReferrers = useCallback(async () => {
    setRefLoading(true);
    try {
      // Picker should only surface Referrer profiles that are not yet linked
      // to a platform user, so Superadmin can attach one cleanly.
      const r = await fetch("/api/v1/admin/referrers?unlinkedOnly=true");
      const d = await r.json();
      if (d.ok) setAvailableReferrers(d.data);
    } finally {
      setRefLoading(false);
    }
  }, []);

  useEffect(() => {
    if (userId) {
      if (!initialUser) fetchUser();
      fetchCompensation();
      fetchReferrers();
      fetchActor();
    } else if (referrerId) {
      // Referrer-only mode: still load actor + dashboard so referrers without
      // a linked platform user render their actor-backed persona block.
      fetchActor();
    }
  }, [userId, referrerId, initialUser, fetchUser, fetchCompensation, fetchReferrers, fetchActor]);

  const api = async (url: string, method = "POST", body?: unknown) => {
    setSaving(true);
    try {
      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      return await r.json();
    } finally {
      setSaving(false);
    }
  };

  const linkPersona = async () => {
    if (!userId || !linkReferrerId) return;
    const d = await api(`/api/v1/admin/users/${userId}/compensation`, "POST", { referrerId: linkReferrerId });
    if (d.ok) {
      flash(d.message ?? "Linked");
      setLinkReferrerId("");
      await Promise.all([fetchUser(), fetchCompensation()]);
      onChange?.();
    } else flash(d.error ?? "Failed to link", true);
  };

  const unlinkPersona = async () => {
    if (!userId) return;
    const d = await api(`/api/v1/admin/users/${userId}/compensation`, "POST", { referrerId: null });
    if (d.ok) {
      flash(d.message ?? "Unlinked");
      await Promise.all([fetchUser(), fetchCompensation()]);
      onChange?.();
    } else flash(d.error ?? "Failed to unlink", true);
  };

  const changePlan = async (planId: string | null) => {
    if (!userId) return;
    const d = await api(`/api/v1/admin/users/${userId}/compensation`, "PATCH", { compensationPlanId: planId });
    if (d.ok) {
      flash(d.message ?? "Plan updated");
      setNewPlanId("");
      await Promise.all([fetchUser(), fetchCompensation()]);
      onChange?.();
    } else flash(d.error ?? "Failed to update plan", true);
  };

  // Referrer-only mode: no platform user, but we may still have an actor.
  if (!userId) {
    if (actor) {
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{
            padding: "10px 14px", background: "#fefaf3", borderRadius: 10,
            border: "1px solid #fde9c8", fontSize: 12, color: "#78350f",
          }}>
            This referrer has no linked platform login. Persona is shown read-only from the ReferralActor primitive.
          </div>
          <ActorPrimaryBlock
            actor={actor}
            dashboard={actorDashboard}
            legacyReferrer={null}
            parentEntities={parentEntities}
            onUnlink={async () => {}}
            saving={false}
          />
        </div>
      );
    }
    return (
      <div style={{ padding: "24px", background: "#f8f5f3", borderRadius: 12, border: "1px dashed var(--color-border, #e8e2dd)" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--color-text-muted, #7d7269)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
          No Platform Account
        </div>
        <div style={{ fontSize: 13, color: "var(--color-text-muted, #7d7269)", lineHeight: 1.6, marginBottom: referrerId ? 14 : 0 }}>
          {emptyMessage ?? "This profile is not connected to a platform login account, so a commercial persona cannot be linked. Create a user with the appropriate role to enable persona linking."}
        </div>
        {referrerId && (
          <>
            <button
              type="button"
              onClick={() => setShowAddOperator(true)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "8px 14px", fontSize: 13, fontWeight: 600,
                background: "#1a1614", color: "#fff", border: "none",
                borderRadius: 8, cursor: "pointer",
              }}
            >
              + Add operator
            </button>
            {showAddOperator && (
              <AddOperatorModal
                container={{ kind: "soloReferrer", legacyReferrerId: referrerId }}
                contextNames={{ referrerName: null }}
                onClose={() => setShowAddOperator(false)}
                onCreated={() => { setShowAddOperator(false); fetchActor(); onChange?.(); }}
              />
            )}
          </>
        )}
      </div>
    );
  }

  if (loading || !user) {
    return <p style={{ fontSize: 13, color: "#9ca3af" }}>Loading persona…</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {msg && (
        <div style={{
          padding: "8px 12px", fontSize: 12, borderRadius: 6,
          background: msg.error ? "#fef2f2" : "#f0fdf4",
          color: msg.error ? "#dc2626" : "#15803d",
          border: `1px solid ${msg.error ? "#fecaca" : "#bbf7d0"}`,
        }}>
          {msg.text}
        </div>
      )}

      <ReferrerResolutionCard userId={userId} />

      <div>
        <SectionTitle>Commercial Persona</SectionTitle>
        <p style={{ fontSize: 12, color: "var(--color-text-muted, #7d7269)", marginBottom: 16 }}>
          A commercial persona defines how this user participates in revenue generation — as a Streetside Host, Concierge, Taxi Driver, etc.
          This is separate from their access role and determines which compensation plan applies.
        </p>

        {actor ? (
          <ActorPrimaryBlock
            actor={actor}
            dashboard={actorDashboard}
            legacyReferrer={user.referrer}
            parentEntities={parentEntities}
            onUnlink={unlinkPersona}
            saving={saving}
          />
        ) : user.referrer ? (
          <div style={{ background: "#f8f5f3", border: "1px solid var(--color-border, #e8e2dd)", borderRadius: 12, padding: 20 }}>
            <div style={{
              marginBottom: 14, padding: "8px 12px", borderRadius: 8, fontSize: 11, fontWeight: 600,
              display: "flex", alignItems: "center", gap: 8,
              background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a",
            }}>
              <span>○ Legacy Referrer (not yet migrated)</span>
              <span style={{ fontWeight: 400, opacity: 0.85 }}>
                Run the referrals migration in Admin → Compensation to upgrade.
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--color-text-muted, #7d7269)", marginBottom: 4 }}>Commercial Persona</div>
                <div style={{ fontFamily: "var(--font-heading)", fontSize: 20, fontWeight: 400 }}>{user.referrer.fullName}</div>
                <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <span className="badge badge-info">{REFERRER_TYPE_LABELS[user.referrer.referrerType] || user.referrer.referrerType}</span>
                  <span style={{ padding: "2px 10px", fontSize: 11, background: user.referrer.isActive ? "#f0fdf4" : "#f9fafb", color: user.referrer.isActive ? "#16a34a" : "#6b7280", borderRadius: 20, fontWeight: 700 }}>
                    {user.referrer.isActive ? "ACTIVE" : "INACTIVE"}
                  </span>
                </div>
                <div style={{ marginTop: 8, fontSize: 13, color: "var(--color-text-muted, #7d7269)" }}>
                  Code: <code style={{ background: "#ede8e1", padding: "1px 6px", borderRadius: 4 }}>{user.referrer.referralCode}</code>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <a
                  href={`/admin/compensation?referrerId=${user.referrer.id}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: 11, color: "#1a1614", background: "none", border: "1px solid var(--color-border, #e8e2dd)", borderRadius: 6, padding: "4px 10px", textDecoration: "none", fontWeight: 700, whiteSpace: "nowrap" }}
                  title={`Open referrer ${user.referrer.referralCode} in the Compensation admin`}
                >
                  Open Referrer ↗
                </a>
                <button onClick={unlinkPersona} disabled={saving} style={{ fontSize: 11, color: "#dc2626", background: "none", border: "1px solid #fca5a5", borderRadius: 6, padding: "4px 10px", cursor: saving ? "not-allowed" : "pointer", fontWeight: 700 }}>
                  Unlink
                </button>
              </div>
            </div>

            <div style={{ marginTop: 16, padding: "12px 16px", background: "#fff", borderRadius: 8, border: "1px solid var(--color-border, #e8e2dd)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--color-text-muted, #7d7269)", marginBottom: 8 }}>Compensation Plan</div>
              {user.referrer.compensationPlan ? (
                <div>
                  <div style={{ fontWeight: 600 }}>{user.referrer.compensationPlan.name}</div>
                  <div style={{ fontSize: 12, color: "var(--color-text-muted, #7d7269)", marginTop: 4 }}>
                    {COMP_MODEL_LABELS[user.referrer.compensationPlan.modelType] || user.referrer.compensationPlan.modelType}
                    {user.referrer.compensationPlan.flatPerCoverCents > 0 && (
                      <> · ${(user.referrer.compensationPlan.flatPerCoverCents / 100).toFixed(2)} per cover</>
                    )}
                    {user.referrer.compensationPlan.commissionPercent && (
                      <> · {Number(user.referrer.compensationPlan.commissionPercent)}% commission</>
                    )}
                    {user.referrer.compensationPlan.hourlyRateCents > 0 && (
                      <> · ${(user.referrer.compensationPlan.hourlyRateCents / 100).toFixed(2)}/hr</>
                    )}
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 13, color: "#9ca3af" }}>No plan assigned</div>
              )}
              <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
                <select
                  value={newPlanId}
                  onChange={(e) => setNewPlanId(e.target.value)}
                  style={{ flex: 1, padding: "7px 10px", border: "1px solid #e0d9d3", borderRadius: 7, fontSize: 13 }}
                >
                  <option value="">— Select a plan —</option>
                  {(compensation?.plans ?? []).map((p: any) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <button
                  onClick={() => changePlan(newPlanId || null)}
                  disabled={saving || !newPlanId}
                  style={{ padding: "7px 14px", background: "#1a1614", color: "#fff", border: "none", borderRadius: 7, cursor: saving || !newPlanId ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 700, opacity: saving || !newPlanId ? 0.5 : 1, whiteSpace: "nowrap" }}
                >
                  Assign Plan
                </button>
                {user.referrer.compensationPlan && (
                  <button
                    onClick={() => changePlan(null)}
                    disabled={saving}
                    style={{ padding: "7px 10px", background: "none", border: "1px solid #fca5a5", borderRadius: 7, cursor: saving ? "not-allowed" : "pointer", fontSize: 12, color: "#dc2626", fontWeight: 700 }}
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>

            {compLoading ? (
              <p style={{ fontSize: 13, color: "#9ca3af", marginTop: 12 }}>Loading performance data…</p>
            ) : compensation?.commissionTotals && (
              <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                <Stat label="Total Commissions" value={String(user.referrer._count?.commissions ?? 0)} />
                <Stat label="Total Attributions" value={String(user.referrer._count?.attributions ?? 0)} />
                <Stat label="Pending Payout" value={fmtMoney(compensation.commissionTotals.pending)} />
                <Stat label="Approved" value={fmtMoney(compensation.commissionTotals.approved)} />
                <Stat label="Paid Out" value={fmtMoney(compensation.commissionTotals.paid)} />
              </div>
            )}
          </div>
        ) : (
          <div style={{ padding: "24px", background: "#f8f5f3", borderRadius: 12, border: "1px dashed var(--color-border, #e8e2dd)" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--color-text-muted, #7d7269)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>No Commercial Persona Linked</div>
            <div style={{ fontSize: 13, color: "var(--color-text-muted, #7d7269)", marginBottom: 16, lineHeight: 1.6 }}>
              A commercial persona connects this user to a Referrer profile — which determines their referral code, type (Tour Guide, Taxi Driver, etc.), and compensation plan.
              Select an existing unlinked Referrer profile below to attach one.
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <select
                className="form-input"
                value={linkReferrerId}
                onChange={(e) => setLinkReferrerId(e.target.value)}
                style={{ flex: 1 }}
                disabled={refLoading}
              >
                <option value="">{refLoading ? "Loading profiles…" : availableReferrers.length === 0 ? "No referrer profiles available" : "Select a referrer profile…"}</option>
                {availableReferrers
                  .filter((r: any) => !r.userId || r.userId === userId)
                  .map((r: any) => (
                    <option key={r.id} value={r.id}>
                      {r.user?.name || r.user?.email || "Unnamed"} — {r.referrerType?.replace(/_/g, " ")} ({r.referralCode})
                    </option>
                  ))}
              </select>
              <button className="btn btn-primary" onClick={linkPersona} disabled={!linkReferrerId || saving} style={{ whiteSpace: "nowrap" }}>
                Link Profile
              </button>
            </div>
          </div>
        )}
      </div>

      {compensation?.influencerProfile && (
        <div>
          <SectionTitle>Influencer Profile</SectionTitle>
          <div style={{ background: "#f8f5f3", border: "1px solid var(--color-border, #e8e2dd)", borderRadius: 12, padding: 20 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Stat label="Commission Entries" value={String(compensation.influencerProfile._count?.ledger ?? 0)} />
              <Stat label="Total Earned" value={fmtMoney(compensation.ledgerTotals?.earned ?? 0)} />
              <Stat label="Total Paid" value={fmtMoney(compensation.ledgerTotals?.paid ?? 0)} />
              <Stat label="Outstanding" value={fmtMoney((compensation.ledgerTotals?.earned ?? 0) - (compensation.ledgerTotals?.paid ?? 0))} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
