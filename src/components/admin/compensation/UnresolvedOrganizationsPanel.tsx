"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "@/components/i18n/LocaleProvider";

type UnresolvedRow = {
  actorId: string;
  actorDisplayName: string;
  actorType: string;
  organizationName: string;
  assignmentIds: string[];
};

type SoleProprietorRow = {
  actorId: string;
  actorDisplayName: string;
  actorType: string;
  organizationName: string;
  flaggedAt: string | null;
};

type EntitySearchHit = {
  id: string;
  displayName: string;
  type: string;
  organizationKind: string | null;
  websiteUrl: string | null;
};

type View = "unresolved" | "selfManaged";

const ORG_KINDS = [
  "Hotel",
  "Hostel",
  "Restaurant",
  "Bar / Lounge",
  "Taxi Fleet",
  "Tour Operator",
  "Concierge Desk",
  "Promoter Group",
  "Influencer Network",
  "Travel Agency",
  "Other",
];

const ACTOR_TYPE_TO_KIND_HINT: Record<string, string> = {
  HOTEL_CONCIERGE: "Hotel",
  TAXI_DRIVER: "Taxi Fleet",
  TOUR_GUIDE: "Tour Operator",
  PROMOTER: "Promoter Group",
  INFLUENCER: "Influencer Network",
  INFLUENCER_SUB_REFERRER: "Influencer Network",
  STREETSIDE_HOST: "Promoter Group",
};

export default function UnresolvedOrganizationsPanel() {
  const t = useTranslation();
  const [view, setView] = useState<View>("unresolved");
  const [unresolved, setUnresolved] = useState<UnresolvedRow[]>([]);
  const [selfManaged, setSelfManaged] = useState<SoleProprietorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyActor, setBusyActor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openAction, setOpenAction] = useState<{ actorId: string; kind: "link" | "create" } | null>(
    null,
  );

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const [u, s] = await Promise.all([
        fetch("/api/v1/admin/referrals/unresolved-organizations").then((r) => r.json()),
        fetch("/api/v1/admin/referrals/sole-proprietors").then((r) => r.json()),
      ]);
      if (!u.ok) throw new Error(u.error || "Failed to load unresolved");
      if (!s.ok) throw new Error(s.error || "Failed to load sole proprietors");
      setUnresolved(u.items ?? []);
      setSelfManaged(s.items ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function markSoleProprietor(actorId: string) {
    setBusyActor(actorId);
    try {
      const res = await fetch(
        `/api/v1/admin/referrals/unresolved-organizations/${actorId}/mark-sole-proprietor`,
        { method: "POST" },
      ).then((r) => r.json());
      if (!res.ok) throw new Error(res.error || "Failed");
      await refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusyActor(null);
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontFamily: "var(--font-heading)", fontSize: 24, marginBottom: 4 }}>
        {t("admin", "unresolvedOrgsTitle")}
      </h1>
      <p style={{ color: "var(--color-text-muted)", fontSize: 13, marginBottom: 20 }}>
        {t("admin", "unresolvedOrgsBlurb")}
      </p>

      <div
        style={{
          display: "flex",
          gap: 4,
          marginBottom: 16,
          borderBottom: "1px solid var(--color-border, #e8e2dd)",
        }}
      >
        <ViewTab active={view === "unresolved"} onClick={() => setView("unresolved")}>
          {t("admin", "unresolvedOrgsTabUnresolved")}
          <Pill count={unresolved.length} tone="warn" />
        </ViewTab>
        <ViewTab active={view === "selfManaged"} onClick={() => setView("selfManaged")}>
          {t("admin", "unresolvedOrgsTabSelfManaged")}
          <Pill count={selfManaged.length} tone="info" />
        </ViewTab>
      </div>

      {error && (
        <div
          style={{
            padding: 10,
            background: "#fef2f2",
            border: "1px solid #fca5a5",
            color: "#991b1b",
            borderRadius: 6,
            fontSize: 13,
            marginBottom: 12,
          }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 24, color: "var(--color-text-muted)", fontSize: 13 }}>
          {t("admin", "loading") || "Loading…"}
        </div>
      ) : view === "unresolved" ? (
        <UnresolvedTable
          rows={unresolved}
          busyActor={busyActor}
          openAction={openAction}
          onOpenAction={setOpenAction}
          onCloseAction={() => setOpenAction(null)}
          onResolved={() => {
            setOpenAction(null);
            void refresh();
          }}
          onMarkSole={markSoleProprietor}
          t={t}
        />
      ) : (
        <SelfManagedTable rows={selfManaged} t={t} />
      )}
    </div>
  );
}

function ViewTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "none",
        border: "none",
        padding: "10px 14px",
        fontSize: 13,
        fontWeight: 600,
        color: active ? "var(--color-text)" : "var(--color-text-muted)",
        borderBottom: active ? "2px solid var(--brand-primary, #c41e3a)" : "2px solid transparent",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      {children}
    </button>
  );
}

function Pill({ count, tone }: { count: number; tone: "warn" | "info" }) {
  const bg = tone === "warn" ? "#f59e0b" : "#6366f1";
  return (
    <span
      style={{
        fontSize: 10,
        padding: "1px 7px",
        background: bg,
        color: "#fff",
        borderRadius: 10,
        fontWeight: 700,
      }}
    >
      {count}
    </span>
  );
}

function UnresolvedTable({
  rows,
  busyActor,
  openAction,
  onOpenAction,
  onCloseAction,
  onResolved,
  onMarkSole,
  t,
}: {
  rows: UnresolvedRow[];
  busyActor: string | null;
  openAction: { actorId: string; kind: "link" | "create" } | null;
  onOpenAction: (a: { actorId: string; kind: "link" | "create" }) => void;
  onCloseAction: () => void;
  onResolved: () => void;
  onMarkSole: (id: string) => void;
  t: (ns: string, key: string) => string;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title={t("admin", "unresolvedOrgsEmptyTitle")}
        body={t("admin", "unresolvedOrgsEmptyBody")}
      />
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {rows.map((row) => (
        <div
          key={row.actorId}
          style={{
            background: "var(--layer-1, #fff)",
            border: "1px solid var(--color-border, #e8e2dd)",
            borderRadius: 8,
          }}
        >
          <div
            style={{
              padding: 14,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div style={{ minWidth: 200 }}>
              <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginBottom: 2 }}>
                {row.actorDisplayName} · {row.actorType.replace(/_/g, " ")}
              </div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{row.organizationName}</div>
              <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 2 }}>
                {row.assignmentIds.length}{" "}
                {row.assignmentIds.length === 1
                  ? t("admin", "unresolvedOrgsAssignment")
                  : t("admin", "unresolvedOrgsAssignments")}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                onClick={() => onOpenAction({ actorId: row.actorId, kind: "link" })}
                disabled={busyActor === row.actorId}
                style={btnStyle("ghost")}
              >
                {t("admin", "unresolvedOrgsActionLink")}
              </button>
              <button
                onClick={() => onOpenAction({ actorId: row.actorId, kind: "create" })}
                disabled={busyActor === row.actorId}
                style={btnStyle("primary")}
              >
                {t("admin", "unresolvedOrgsActionCreate")}
              </button>
              <button
                onClick={() => onMarkSole(row.actorId)}
                disabled={busyActor === row.actorId}
                style={btnStyle("ghost")}
              >
                {t("admin", "unresolvedOrgsActionMarkSole")}
              </button>
            </div>
          </div>
          {openAction?.actorId === row.actorId && openAction.kind === "link" && (
            <LinkPanel
              actorId={row.actorId}
              defaultQuery={row.organizationName}
              onClose={onCloseAction}
              onDone={onResolved}
              t={t}
            />
          )}
          {openAction?.actorId === row.actorId && openAction.kind === "create" && (
            <CreatePanel
              actorId={row.actorId}
              defaultName={row.organizationName}
              defaultKind={ACTOR_TYPE_TO_KIND_HINT[row.actorType] ?? ""}
              onClose={onCloseAction}
              onDone={onResolved}
              t={t}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function SelfManagedTable({
  rows,
  t,
}: {
  rows: SoleProprietorRow[];
  t: (ns: string, key: string) => string;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title={t("admin", "unresolvedOrgsSelfEmptyTitle")}
        body={t("admin", "unresolvedOrgsSelfEmptyBody")}
      />
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {rows.map((row) => (
        <div
          key={row.actorId}
          style={{
            padding: 12,
            background: "var(--layer-1, #fff)",
            border: "1px solid var(--color-border, #e8e2dd)",
            borderRadius: 8,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{row.actorDisplayName}</div>
            <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
              {row.actorType.replace(/_/g, " ")} · {row.organizationName}
            </div>
          </div>
          <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
            {row.flaggedAt
              ? `${t("admin", "unresolvedOrgsFlaggedAt")} ${new Date(row.flaggedAt).toLocaleDateString()}`
              : ""}
          </div>
        </div>
      ))}
    </div>
  );
}

function LinkPanel({
  actorId,
  defaultQuery,
  onClose,
  onDone,
  t,
}: {
  actorId: string;
  defaultQuery: string;
  onClose: () => void;
  onDone: () => void;
  t: (ns: string, key: string) => string;
}) {
  const [q, setQ] = useState(defaultQuery);
  const [hits, setHits] = useState<EntitySearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    setSearching(true);
    const id = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/v1/admin/entities/search?q=${encodeURIComponent(q)}`,
        ).then((r) => r.json());
        if (!alive) return;
        setHits(res.ok ? res.items : []);
      } finally {
        if (alive) setSearching(false);
      }
    }, 200);
    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, [q]);

  async function pick(entityId: string) {
    setSubmitting(true);
    setErr(null);
    try {
      const res = await fetch(
        `/api/v1/admin/referrals/unresolved-organizations/${actorId}/link`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entityId }),
        },
      ).then((r) => r.json());
      if (!res.ok) throw new Error(res.error || "Link failed");
      onDone();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Link failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={subPanelStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <strong style={{ fontSize: 13 }}>{t("admin", "unresolvedOrgsLinkTitle")}</strong>
        <button onClick={onClose} style={btnStyle("ghost")}>
          ✕
        </button>
      </div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t("admin", "unresolvedOrgsLinkSearchPlaceholder")}
        style={inputStyle}
      />
      <div style={{ marginTop: 8, maxHeight: 240, overflowY: "auto" }}>
        {searching && (
          <div style={{ padding: 8, fontSize: 12, color: "var(--color-text-muted)" }}>
            {t("admin", "unresolvedOrgsLinkSearching")}
          </div>
        )}
        {!searching && hits.length === 0 && q.length >= 2 && (
          <div style={{ padding: 8, fontSize: 12, color: "var(--color-text-muted)" }}>
            {t("admin", "unresolvedOrgsLinkNoResults")}
          </div>
        )}
        {hits.map((h) => (
          <div
            key={h.id}
            style={{
              padding: 8,
              borderBottom: "1px solid var(--color-border, #f0e9e3)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 8,
            }}
          >
            <div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{h.displayName}</div>
              <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
                {h.type}
                {h.organizationKind ? ` · ${h.organizationKind}` : ""}
              </div>
            </div>
            <button
              onClick={() => pick(h.id)}
              disabled={submitting}
              style={btnStyle("primary")}
            >
              {t("admin", "unresolvedOrgsLinkPick")}
            </button>
          </div>
        ))}
      </div>
      {err && (
        <div style={{ marginTop: 8, fontSize: 12, color: "#991b1b" }}>{err}</div>
      )}
    </div>
  );
}

function CreatePanel({
  actorId,
  defaultName,
  defaultKind,
  onClose,
  onDone,
  t,
}: {
  actorId: string;
  defaultName: string;
  defaultKind: string;
  onClose: () => void;
  onDone: () => void;
  t: (ns: string, key: string) => string;
}) {
  const [name, setName] = useState(defaultName);
  const [kind, setKind] = useState(defaultKind);
  const [website, setWebsite] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const kindOptions = useMemo(() => ORG_KINDS, []);

  async function submit() {
    setSubmitting(true);
    setErr(null);
    try {
      const res = await fetch(
        `/api/v1/admin/referrals/unresolved-organizations/${actorId}/create-entity`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            displayName: name,
            organizationKind: kind || undefined,
            websiteUrl: website || undefined,
            type: "COMPANY",
          }),
        },
      ).then((r) => r.json());
      if (!res.ok) throw new Error(res.error || "Create failed");
      onDone();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Create failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={subPanelStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <strong style={{ fontSize: 13 }}>{t("admin", "unresolvedOrgsCreateTitle")}</strong>
        <button onClick={onClose} style={btnStyle("ghost")}>
          ✕
        </button>
      </div>
      <label style={labelStyle}>{t("admin", "unresolvedOrgsCreateName")}</label>
      <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
      <label style={labelStyle}>{t("admin", "unresolvedOrgsCreateKind")}</label>
      <select value={kind} onChange={(e) => setKind(e.target.value)} style={inputStyle}>
        <option value="">{t("admin", "unresolvedOrgsCreateKindPlaceholder")}</option>
        {kindOptions.map((k) => (
          <option key={k} value={k}>
            {k}
          </option>
        ))}
      </select>
      <label style={labelStyle}>{t("admin", "unresolvedOrgsCreateWebsite")}</label>
      <input
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        placeholder="https://"
        style={inputStyle}
      />
      <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button onClick={onClose} style={btnStyle("ghost")}>
          {t("admin", "unresolvedOrgsCancel")}
        </button>
        <button
          onClick={submit}
          disabled={submitting || !name.trim()}
          style={btnStyle("primary")}
        >
          {t("admin", "unresolvedOrgsCreateSubmit")}
        </button>
      </div>
      {err && (
        <div style={{ marginTop: 8, fontSize: 12, color: "#991b1b" }}>{err}</div>
      )}
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div
      style={{
        padding: 32,
        textAlign: "center",
        background: "var(--layer-1, #fff)",
        border: "1px dashed var(--color-border, #e8e2dd)",
        borderRadius: 8,
        color: "var(--color-text-muted)",
      }}
    >
      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4, color: "var(--color-text)" }}>
        {title}
      </div>
      <div style={{ fontSize: 13 }}>{body}</div>
    </div>
  );
}

const subPanelStyle: React.CSSProperties = {
  padding: 14,
  background: "#faf7f3",
  borderTop: "1px solid var(--color-border, #e8e2dd)",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  fontSize: 13,
  border: "1px solid var(--color-border, #e8e2dd)",
  borderRadius: 6,
  background: "#fff",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 600,
  color: "var(--color-text-muted)",
  marginTop: 8,
  marginBottom: 4,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

function btnStyle(variant: "primary" | "ghost"): React.CSSProperties {
  if (variant === "primary") {
    return {
      padding: "6px 12px",
      fontSize: 12,
      fontWeight: 700,
      background: "var(--brand-primary, #c41e3a)",
      color: "#fff",
      border: "none",
      borderRadius: 6,
      cursor: "pointer",
    };
  }
  return {
    padding: "6px 12px",
    fontSize: 12,
    fontWeight: 600,
    background: "none",
    color: "var(--color-text)",
    border: "1px solid var(--color-border, #e8e2dd)",
    borderRadius: 6,
    cursor: "pointer",
  };
}
