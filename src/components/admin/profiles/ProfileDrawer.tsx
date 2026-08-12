"use client";

import { useEffect, useState } from "react";
import {
  X, Users, Building2, Star, Activity, DollarSign, ShieldCheck, ShieldOff,
  Calendar, ExternalLink, Mail, Phone, Hash, Briefcase, Award, Plus, Trash2, Loader,
} from "lucide-react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import type { UnifiedProfile } from "@/types/profiles";
import PersonaProfilePanel from "@/components/admin/PersonaProfilePanel";
import OperatorsPanel from "@/components/admin/OperatorsPanel";
import CompensationPlanPicker from "@/components/admin/CompensationPlanPicker";
import { useCurrentUserRoles } from "@/hooks/useCurrentUserRoles";

interface ProfileDrawerProps {
  profile: UnifiedProfile;
  onClose: () => void;
  onRefresh?: () => void;
}

type Tab = "overview" | "roles" | "personas" | "compensation" | "activity" | "subhosts";

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "9px 0", borderBottom: "1px solid #f3f4f6" }}>
      <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#9ca3af", minWidth: 140, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 13, color: "#1a1614", textAlign: "right", maxWidth: 280, wordBreak: "break-word" }}>{value ?? "—"}</span>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ flex: 1, padding: "14px 12px", background: "#fafaf9", borderRadius: 8, textAlign: "center", border: "1px solid #f3f4f6" }}>
      <div style={{ fontFamily: "var(--font-heading)", fontSize: 24, fontWeight: 700, color: "#1a1614" }}>{value}</div>
      <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 3, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
    </div>
  );
}

const CATEGORY_COLOR: Record<string, { bg: string; color: string }> = {
  admin: { bg: "#fce7f3", color: "#be185d" }, influencer: { bg: "#ede9fe", color: "#7c3aed" },
  partner: { bg: "#dbeafe", color: "#1d4ed8" }, investor: { bg: "#fef3c7", color: "#92400e" },
  staff: { bg: "#d1fae5", color: "#065f46" }, host: { bg: "#ffedd5", color: "#c2410c" },
  attendee: { bg: "#f0fdf4", color: "#15803d" }, referrer: { bg: "#fef9c3", color: "#a16207" },
  entity: { bg: "#f1f5f9", color: "#475569" }, visitor: { bg: "#f3f4f6", color: "#6b7280" },
};

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  ACTIVE: { bg: "#dcfce7", color: "#16a34a" }, PENDING: { bg: "#fef9c3", color: "#a16207" },
  SUSPENDED: { bg: "#fee2e2", color: "#dc2626" }, INACTIVE: { bg: "#f3f4f6", color: "#6b7280" },
  ARCHIVED: { bg: "#fee2e2", color: "#dc2626" },
};

const catLabel = (c: string) => c.replace(/_/g, " ").replace(/\b\w/g, x => x.toUpperCase());

const ROLE_LABEL: Record<string, string> = {
  SUPERADMIN:            "Superadmin",
  FB_DIRECTOR:           "F&B Director",
  RESTAURANT_SUPERVISOR: "Restaurant Supervisor",
  ADMIN_COMMERCIAL:      "F&B Director",
  ADMIN_IR:              "Admin — IR",
  ADMIN_HR:              "Admin — HR",
  INFLUENCER:            "Influencer",
  PARTNER:               "Partner",
  INVESTOR:              "Investor",
  STAFF_OKU:             "Staff (OKÜ)",
  STAFF_CATCH:           "Staff (CATCH)",
  RESTAURANT_HOST:       "Restaurant Host",
  STREETSIDE_HOST:       "Streetside Host",
  REFERRER:              "Referrer",
  ATTENDEE:              "Attendee",
  VISITOR:               "Visitor",
};

const REFERRER_TYPE_LABEL: Record<string, string> = {
  STREETSIDE_HOST: "Streetside Host", TAXI_DRIVER: "Taxi Driver",
  TOUR_GUIDE: "Tour Guide", HOTEL_CONCIERGE: "Hotel Concierge", PARTNER: "Partner",
};

const MEMBERSHIP_TIER_COLOR: Record<string, string> = {
  PATRON: "#7c3aed", FOUNDER: "#c41e3a",
};

export default function ProfileDrawer({ profile, onClose, onRefresh }: ProfileDrawerProps) {
  const locale     = useLocale();
  const dateLocale = locale === "es" ? "es-PA" : locale === "pt" ? "pt-BR" : "en-US";
  const [tab, setTab] = useState<Tab>("overview");
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [extUser, setExtUser] = useState<any>(null);
  const [extUserVersion, setExtUserVersion] = useState(0);
  const [compData, setCompData] = useState<any>(null);
  const [compLoading, setCompLoading] = useState(false);
  const { canEditUsers } = useCurrentUserRoles();

  const fmt = (d?: string | null) =>
    d ? new Date(d).toLocaleDateString(dateLocale, { year: "numeric", month: "short", day: "numeric" }) : "—";

  const refreshExtUser = () => setExtUserVersion(v => v + 1);

  useEffect(() => {
    if (profile.sourceType === "USER") {
      fetch(`/api/v1/admin/users/${profile.sourceId}`)
        .then(r => r.json())
        .then(d => setExtUser(d.data ?? null))
        .catch(() => {});
    }
  }, [profile.sourceId, profile.sourceType, extUserVersion]);

  useEffect(() => {
    if (tab === "compensation") {
      if (profile.sourceType === "REFERRER" && !compData && !compLoading) {
        setCompLoading(true);
        fetch(`/api/v1/admin/referrers/${profile.sourceId}`)
          .then(r => r.json())
          .then(d => setCompData(d.data ?? null))
          .catch(() => {})
          .finally(() => setCompLoading(false));
      }
    }
  }, [tab, profile.sourceType, profile.sourceId, compData, compLoading]);

  useEffect(() => {
    if (tab === "activity" && profile.sourceType === "USER" && auditLogs.length === 0) {
      setAuditLoading(true);
      fetch(`/api/v1/admin/users/${profile.sourceId}/audit`)
        .then(r => r.json())
        .then(d => setAuditLogs(d.logs ?? d.data ?? []))
        .catch(() => {})
        .finally(() => setAuditLoading(false));
    }
  }, [tab, profile.sourceType, profile.sourceId, auditLogs.length]);

  const ss = STATUS_STYLE[profile.status] ?? STATUS_STYLE.INACTIVE;
  const avatar = profile.avatarUrl ?? profile.logoUrl;

  // Derive the effective category from live platform roles when available,
  // so the badge stays accurate after role changes without needing a DB sync.
  function roleToCategory(roleKeys: string[]): string {
    if (roleKeys.some(r => ["SUPERADMIN","FB_DIRECTOR","ADMIN_COMMERCIAL","ADMIN_IR","ADMIN_HR"].includes(r))) return "admin";
    if (roleKeys.some(r => ["RESTAURANT_HOST","STREETSIDE_HOST","RESTAURANT_SUPERVISOR"].includes(r))) return "host";
    if (roleKeys.includes("INFLUENCER"))  return "influencer";
    if (roleKeys.includes("REFERRER"))    return "referrer";
    if (roleKeys.includes("PARTNER"))     return "partner";
    if (roleKeys.includes("INVESTOR"))    return "investor";
    if (roleKeys.some(r => r.startsWith("STAFF_"))) return "staff";
    if (roleKeys.includes("ATTENDEE"))    return "attendee";
    return "visitor";
  }

  const liveRoles: string[] = extUser?.roles?.map((r: any) => r.roleKey ?? r) ?? [];
  const effectiveCategory =
    profile.sourceType === "USER" && liveRoles.length > 0
      ? roleToCategory(liveRoles)
      : profile.primaryCategory;
  const catStyle = CATEGORY_COLOR[effectiveCategory] ?? CATEGORY_COLOR.visitor;

  const isCompanyEntity = profile.sourceType === "ENTITY" && profile.profileType === "COMPANY";

  const TABS = (
    [
      { key: "overview"     as Tab, label: "Overview",      icon: <Star size={13} />,       show: true },
      { key: "roles"        as Tab, label: profile.sourceType === "USER" ? "Roles & Access" : "Details", icon: <ShieldCheck size={13} />, show: true },
      { key: "subhosts"     as Tab, label: "Sub-Hosts",     icon: <Users size={13} />,      show: isCompanyEntity },
      { key: "personas"     as Tab, label: "Personas",      icon: <Award size={13} />,      show: true },
      { key: "compensation" as Tab, label: "Compensation",  icon: <DollarSign size={13} />, show: profile.compensationEligible || profile.primaryCategory === "influencer" || profile.primaryCategory === "referrer" },
      { key: "activity"     as Tab, label: "Activity",      icon: <Activity size={13} />,   show: profile.sourceType === "USER" },
    ] as { key: Tab; label: string; icon: React.ReactNode; show: boolean }[]
  ).filter(t => t.show);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9000, display: "flex" }}>
      <div style={{ flex: 1, background: "rgba(0,0,0,0.35)" }} onClick={onClose} />
      <div style={{ width: 580, maxWidth: "100vw", background: "white", boxShadow: "-4px 0 40px rgba(0,0,0,0.12)", display: "flex", flexDirection: "column", overflowY: "auto" }}>

        {/* Header */}
        <div style={{ padding: "22px 28px 0", borderBottom: "1px solid #e5e0d8", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ width: 52, height: 52, borderRadius: profile.profileType === "COMPANY" ? 10 : "50%", background: "#f0ede9", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                {avatar ? (
                  <img src={avatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <span style={{ fontWeight: 700, fontSize: 20, color: "#9ca3af" }}>{profile.displayName[0]?.toUpperCase()}</span>
                )}
              </div>
              <div>
                <div style={{ fontFamily: "var(--font-heading)", fontSize: 19, fontWeight: 700, color: "#1a1614", lineHeight: 1.2 }}>
                  {profile.displayName}
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 5, flexWrap: "wrap", alignItems: "center" }}>
                  <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 20, ...catStyle }}>{catLabel(effectiveCategory)}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: ss.bg, color: ss.color }}>{profile.status}</span>
                  <span style={{ fontSize: 10, color: "#9ca3af", display: "flex", alignItems: "center", gap: 3 }}>
                    {profile.profileType === "COMPANY" ? <Building2 size={10} /> : <Users size={10} />}
                    {profile.profileType === "COMPANY" ? "Company" : "Person"}
                  </span>
                  {profile.membershipTier && (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: "#f3e8ff", color: MEMBERSHIP_TIER_COLOR[profile.membershipTier] ?? "#7c3aed" }}>
                      {profile.membershipTier}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", padding: 4, flexShrink: 0 }}>
              <X size={20} />
            </button>
          </div>

          {/* Stat strip */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <StatBox label="Series" value={profile._count.seriesAssignments} />
            <StatBox label="Source" value={profile.sourceType} />
            {profile.hasAccess && <StatBox label="Access" value="Active" />}
            {profile.compensationEligible && <StatBox label="Comp." value="Eligible" />}
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 0, overflowX: "auto", scrollbarWidth: "none" }}>
            {TABS.map(t_ => (
              <button key={t_.key} onClick={() => setTab(t_.key)}
                style={{
                  display: "flex", alignItems: "center", gap: 5, padding: "9px 14px",
                  background: "none", border: "none", cursor: "pointer",
                  borderBottom: tab === t_.key ? "2px solid #c41e3a" : "2px solid transparent",
                  color: tab === t_.key ? "#c41e3a" : "#6b7280",
                  fontSize: 12, fontWeight: tab === t_.key ? 700 : 400,
                  whiteSpace: "nowrap", transition: "all 0.12s",
                }}
              >{t_.icon} {t_.label}</button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, padding: "22px 28px", overflowY: "auto" }}>
          {tab === "overview" && <OverviewTab profile={profile} extUser={extUser} fmt={fmt} />}
          {tab === "roles" && <RolesTab profile={profile} extUser={extUser} onRefresh={onRefresh} onRolesChanged={refreshExtUser} />}
          {tab === "subhosts" && <SubHostsTab profileId={profile.id} />}
          {tab === "personas" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              <PersonaProfilePanel
                userId={
                  profile.sourceType === "USER"
                    ? profile.sourceId
                    : extUser?.id ?? null
                }
                referrerId={
                  profile.sourceType === "REFERRER" ? profile.sourceId : null
                }
                initialUser={profile.sourceType === "USER" ? extUser : undefined}
                onChange={() => { refreshExtUser(); onRefresh?.(); }}
                emptyMessage={
                  profile.profileType === "COMPANY"
                    ? "Companies can host commercial personas through their associated users. Link a user account to this company, then assign a commercial persona from that user's profile."
                    : undefined
                }
              />
              {isCompanyEntity && (
                <div style={{ paddingTop: 18, borderTop: "1px solid #e8e2dd" }}>
                  <OperatorsPanel
                    title="Operators rolling up to this organization"
                    container={{ kind: "entity", parentEntityId: profile.sourceId }}
                    allowAddOperator
                    contextNames={{ entityName: profile.displayName ?? null }}
                  />
                </div>
              )}
            </div>
          )}
          {tab === "compensation" && <CompensationTab profile={profile} extUser={extUser} compData={compData} compLoading={compLoading} fmt={fmt} canEdit={canEditUsers} onCompDataInvalidated={() => {
            // For USER-backed profiles, the plan lives on extUser.referrer; refresh that loader.
            if (profile.sourceType === "USER") {
              refreshExtUser();
              onRefresh?.();
              return;
            }
            // For REFERRER-backed profiles, refetch the referrer detail endpoint.
            setCompData(null);
            setCompLoading(true);
            fetch(`/api/v1/admin/referrers/${profile.sourceId}`)
              .then(r => r.json())
              .then(d => setCompData(d.data ?? null))
              .catch(() => {})
              .finally(() => setCompLoading(false));
          }} />}
          {tab === "activity" && <ActivityTab auditLogs={auditLogs} loading={auditLoading} fmt={fmt} />}
        </div>

        {/* Footer */}
        <div style={{ padding: "14px 28px", borderTop: "1px solid #e5e0d8", display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: "#9ca3af" }}>Created {fmt(profile.createdAt)}</span>
          <div style={{ display: "flex", gap: 8 }}>
            {profile.sourceType === "USER" && (
              <a href={`/admin/users`} target="_blank" rel="noreferrer"
                style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#c41e3a", textDecoration: "none" }}>
                <ExternalLink size={12} /> User Admin
              </a>
            )}
            {profile.sourceType === "REFERRER" && (
              <a href={`/admin/compensation`} target="_blank" rel="noreferrer"
                style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#c41e3a", textDecoration: "none" }}>
                <ExternalLink size={12} /> Compensation
              </a>
            )}
            {profile.sourceType === "ENTITY" && (
              <a href={`/admin/entities`} target="_blank" rel="noreferrer"
                style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#c41e3a", textDecoration: "none" }}>
                <ExternalLink size={12} /> Entities Admin
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function OverviewTab({ profile, extUser, fmt }: { profile: UnifiedProfile; extUser: any; fmt: (d?: string | null) => string }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#9ca3af", marginBottom: 8 }}>Contact</div>
      {profile.email && <InfoRow label="Email" value={
        <a href={`mailto:${profile.email}`} style={{ color: "#1d4ed8", display: "flex", alignItems: "center", gap: 4 }}>
          <Mail size={12} /> {profile.email}
        </a>
      } />}
      {profile.phone && <InfoRow label="Phone" value={
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Phone size={12} /> {profile.phone}</span>
      } />}
      {profile.companyParent && <InfoRow label="Organization" value={
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Building2 size={12} /> {profile.companyParent}</span>
      } />}
      {profile.referralCode && <InfoRow label="Referral Code" value={
        <span style={{ display: "flex", alignItems: "center", gap: 4, fontFamily: "monospace" }}><Hash size={12} /> {profile.referralCode}</span>
      } />}
      {profile.influencerHandle && <InfoRow label="Handle" value={profile.influencerHandle} />}
      {profile.influencerRefCode && <InfoRow label="Ref Code" value={<span style={{ fontFamily: "monospace" }}>{profile.influencerRefCode}</span>} />}
      {profile.referrerType && <InfoRow label="Referrer Type" value={
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <Briefcase size={12} />
          {profile.referrerType.replace(/_/g, " ").replace(/\b\w/g, x => x.toUpperCase())}
        </span>
      } />}
      {profile.membershipTier && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#9ca3af", marginTop: 18, marginBottom: 8 }}>Membership</div>
          <InfoRow label="Tier" value={
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Award size={12} /> {profile.membershipTier}</span>
          } />
          <InfoRow label="Status" value={profile.membershipStatus} />
        </>
      )}
      {extUser && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#9ca3af", marginTop: 18, marginBottom: 8 }}>Platform</div>
          {extUser.lastLoginAt && <InfoRow label="Last Login" value={fmt(extUser.lastLoginAt)} />}
          {extUser.internalNotes && <InfoRow label="Internal Notes" value={extUser.internalNotes} />}
          {extUser.tags?.length > 0 && (
            <InfoRow label="Tags" value={
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "flex-end" }}>
                {extUser.tags.map((tag: string) => (
                  <span key={tag} style={{ fontSize: 10, padding: "2px 7px", borderRadius: 20, background: "#f3f4f6", color: "#374151" }}>{tag}</span>
                ))}
              </div>
            } />
          )}
          {extUser.referrer?.compensationPlan && (
            <InfoRow label="Comp Plan" value={extUser.referrer.compensationPlan.name} />
          )}
        </>
      )}
    </div>
  );
}

const ALL_ROLES: { key: string; label: string; group: string }[] = [
  { key: "SUPERADMIN",       label: "Superadmin",          group: "Admin" },
  { key: "FB_DIRECTOR",           label: "F&B Director",           group: "Admin" },
  { key: "RESTAURANT_SUPERVISOR", label: "Restaurant Supervisor",  group: "Host" },
  { key: "ADMIN_IR",         label: "Admin — IR",          group: "Admin" },
  { key: "ADMIN_HR",         label: "Admin — HR",          group: "Admin" },
  { key: "STAFF_OKU",        label: "Staff (OKÜ)",         group: "Staff" },
  { key: "STAFF_CATCH",      label: "Staff (CATCH)",       group: "Staff" },
  { key: "INFLUENCER",       label: "Influencer",          group: "External" },
  { key: "PARTNER",          label: "Partner",             group: "External" },
  { key: "INVESTOR",         label: "Investor",            group: "External" },
  { key: "REFERRER",         label: "Referrer",            group: "External" },
  { key: "RESTAURANT_HOST",  label: "Restaurant Host",     group: "Host" },
  { key: "STREETSIDE_HOST",  label: "Streetside Host",     group: "Host" },
  { key: "ATTENDEE",         label: "Attendee",            group: "Guest" },
  { key: "VISITOR",          label: "Visitor",             group: "Guest" },
];

function RolesTab({ profile, extUser, onRefresh, onRolesChanged }: { profile: UnifiedProfile; extUser: any; onRefresh?: () => void; onRolesChanged?: () => void }) {
  const [roles, setRoles] = useState<string[]>(profile.roles ?? []);
  const [saving, setSaving] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [selectedAdd, setSelectedAdd] = useState("");
  const [error, setError] = useState<string | null>(null);

  const userId = profile.sourceId;
  const available = ALL_ROLES.filter(r => !roles.includes(r.key));

  async function removeRole(roleKey: string) {
    if (roleKey === "SUPERADMIN") return;
    setSaving(roleKey); setError(null);
    try {
      const res = await fetch(`/api/v1/admin/users/${userId}/roles/${roleKey}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      setRoles(prev => prev.filter(r => r !== roleKey));
      onRolesChanged?.();
      onRefresh?.();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(null); }
  }

  async function addRole() {
    if (!selectedAdd) return;
    setSaving(selectedAdd); setError(null);
    try {
      const res = await fetch(`/api/v1/admin/users/${userId}/roles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleKey: selectedAdd }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      setRoles(prev => [...prev, selectedAdd]);
      setShowAdd(false); setSelectedAdd("");
      onRolesChanged?.();
      onRefresh?.();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(null); }
  }

  if (profile.sourceType === "USER") {
    return (
      <div>
        {/* ── Platform Roles ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#9ca3af" }}>Platform Roles</div>
          <button
            onClick={() => { setShowAdd(v => !v); setSelectedAdd(""); setError(null); }}
            style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, color: "#c41e3a", background: "none", border: "1px solid #fecdd3", borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}
          >
            <Plus size={11} /> Add Role
          </button>
        </div>

        {/* Add Role Row */}
        {showAdd && (
          <div style={{ display: "flex", gap: 6, marginBottom: 10, alignItems: "center" }}>
            <select
              value={selectedAdd}
              onChange={e => setSelectedAdd(e.target.value)}
              style={{ flex: 1, fontSize: 13, padding: "7px 10px", borderRadius: 7, border: "1px solid #e5e7eb", background: "#fff", color: "#1a1614" }}
            >
              <option value="">Select a role…</option>
              {["Admin","Staff","External","Host","Guest"].map(group => {
                const opts = available.filter(r => r.group === group);
                if (!opts.length) return null;
                return (
                  <optgroup key={group} label={group}>
                    {opts.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
                  </optgroup>
                );
              })}
            </select>
            <button
              onClick={addRole}
              disabled={!selectedAdd || saving === selectedAdd}
              style={{ padding: "7px 14px", fontSize: 12, fontWeight: 600, borderRadius: 7, border: "none", background: "#c41e3a", color: "#fff", cursor: selectedAdd ? "pointer" : "not-allowed", opacity: !selectedAdd ? 0.5 : 1 }}
            >
              {saving === selectedAdd ? <Loader size={12} /> : "Assign"}
            </button>
            <button onClick={() => setShowAdd(false)} style={{ padding: "7px 10px", fontSize: 12, borderRadius: 7, border: "1px solid #e5e7eb", background: "#fff", color: "#6b7280", cursor: "pointer" }}>
              ✕
            </button>
          </div>
        )}

        {error && <div style={{ fontSize: 12, color: "#dc2626", marginBottom: 10, padding: "8px 12px", background: "#fef2f2", borderRadius: 6, border: "1px solid #fecaca" }}>{error}</div>}

        {roles.length === 0 ? (
          <div style={{ color: "#9ca3af", fontSize: 13, padding: "12px 0" }}>No roles assigned.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {roles.map(role => {
              const isSuper = role === "SUPERADMIN";
              const isRemoving = saving === role;
              return (
                <div key={role} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "#fafaf9", borderRadius: 8, border: "1px solid #f3f4f6" }}>
                  <ShieldCheck size={14} color={isSuper ? "#7c3aed" : "#c41e3a"} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#1a1614", flex: 1 }}>{ROLE_LABEL[role] ?? role}</span>
                  {!isSuper && (
                    <button
                      onClick={() => removeRole(role)}
                      disabled={!!saving}
                      title="Remove role"
                      style={{ background: "none", border: "none", cursor: saving ? "not-allowed" : "pointer", color: "#9ca3af", display: "flex", alignItems: "center", padding: 4, borderRadius: 4, opacity: saving && !isRemoving ? 0.4 : 1 }}
                    >
                      {isRemoving ? <Loader size={12} /> : <Trash2 size={13} />}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Login Access ── */}
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#9ca3af", marginTop: 22, marginBottom: 12 }}>Login Access</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "#f0fdf4", borderRadius: 8, border: "1px solid #bbf7d0" }}>
          <ShieldCheck size={14} color="#16a34a" />
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1614" }}>{profile.email}</div>
            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>Platform account · {profile.status}</div>
          </div>
        </div>

        {/* ── Referrer Profile (if linked) ── */}
        {extUser?.referrer && (
          <>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#9ca3af", marginTop: 22, marginBottom: 12 }}>Referrer Profile</div>
            <InfoRow label="Referral Code" value={<span style={{ fontFamily: "monospace" }}>{extUser.referrer.referralCode}</span>} />
            <InfoRow label="Type" value={REFERRER_TYPE_LABEL[extUser.referrer.referrerType] ?? extUser.referrer.referrerType} />
            <InfoRow label="Active" value={extUser.referrer.isActive ? "Yes" : "No"} />
            <InfoRow label="Commissions" value={extUser.referrer._count?.commissions ?? 0} />
            <InfoRow label="Attributions" value={extUser.referrer._count?.attributions ?? 0} />
          </>
        )}
      </div>
    );
  }

  if (profile.sourceType === "REFERRER") {
    return (
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#9ca3af", marginBottom: 12 }}>Referrer Details</div>
        <InfoRow label="Type" value={REFERRER_TYPE_LABEL[profile.referrerType ?? ""] ?? profile.referrerType} />
        <InfoRow label="Referral Code" value={<span style={{ fontFamily: "monospace" }}>{profile.referralCode}</span>} />
        <InfoRow label="Organization" value={profile.organizationName} />
        <InfoRow label="Phone" value={profile.phone} />
        <InfoRow label="Status" value={profile.status} />
        <div style={{ marginTop: 20, padding: "14px 16px", background: "#fef9c3", borderRadius: 8, border: "1px solid #fde68a" }}>
          <div style={{ fontSize: 12, color: "#92400e" }}>
            <ShieldOff size={13} style={{ display: "inline", marginRight: 6 }} />
            This referrer does not have a platform login account. To grant access, create a user with the Referrer role.
          </div>
        </div>
      </div>
    );
  }

  if (profile.sourceType === "ENTITY") {
    return (
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#9ca3af", marginBottom: 12 }}>Entity Details</div>
        <InfoRow label="Type" value={profile.profileType} />
        <InfoRow label="Series Hosted" value={profile._count.seriesAssignments} />
        <div style={{ marginTop: 20, padding: "14px 16px", background: "#f1f5f9", borderRadius: 8, border: "1px solid #e2e8f0" }}>
          <div style={{ fontSize: 12, color: "#475569" }}>
            Entity profiles represent hosts, sponsors, or brand partners used across series and events.
          </div>
        </div>
      </div>
    );
  }

  return null;
}

// ─── SubHostsTab ──────────────────────────────────────────────────────────────

const COMMISSION_MODE_LABEL: Record<string, string> = {
  NONE: "No Commission", FLAT: "Flat Rate", PERCENTAGE: "Percentage", TIERED: "Tiered",
};

function SubHostsTab({ profileId }: { profileId: string }) {
  const [hosts, setHosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedHost, setExpandedHost] = useState<string | null>(null);

  const [form, setForm] = useState({
    userId: "", displayName: "", asReferrer: false,
    commissionPayer: "OKU", commissionMode: "NONE", commissionShareBps: "",
    seriesId: "",
  });

  const [userSearch, setUserSearch] = useState("");
  const [userResults, setUserResults] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  useEffect(() => {
    fetch(`/api/v1/admin/profiles/${profileId}/sub-hosts`)
      .then(r => r.json())
      .then(d => setHosts(d.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [profileId]);

  useEffect(() => {
    if (!userSearch || userSearch.length < 2) { setUserResults([]); return; }
    const timer = setTimeout(() => {
      setSearchLoading(true);
      fetch(`/api/v1/admin/users?search=${encodeURIComponent(userSearch)}&pageSize=10`)
        .then(r => r.json())
        .then(d => setUserResults(d.data ?? d.users ?? []))
        .catch(() => {})
        .finally(() => setSearchLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [userSearch]);

  async function addSubHost() {
    if (!form.userId || !form.displayName) { setError("Select a user and enter a display name"); return; }
    setSaving(true); setError(null);
    try {
      const res = await fetch(`/api/v1/admin/profiles/${profileId}/sub-hosts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: form.userId,
          displayName: form.displayName,
          asReferrer: form.asReferrer,
          commissionPayer: form.commissionPayer,
          commissionMode: form.commissionMode,
          commissionShareBps: form.commissionShareBps ? parseInt(form.commissionShareBps) * 100 : null,
          seriesId: form.seriesId || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      setHosts(prev => [...prev.filter(h => h.userId !== form.userId), json.data]);
      setShowAdd(false);
      setForm({ userId: "", displayName: "", asReferrer: false, commissionPayer: "OKU", commissionMode: "NONE", commissionShareBps: "", seriesId: "" });
      setUserSearch(""); setUserResults([]);
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  }

  async function removeSubHost(hostId: string) {
    if (!confirm("Remove this sub-host from the company?")) return;
    try {
      await fetch(`/api/v1/admin/profiles/${profileId}/sub-hosts/${hostId}`, { method: "DELETE" });
      setHosts(prev => prev.filter(h => h.id !== hostId));
    } catch {}
  }

  const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#9ca3af", marginBottom: 6, display: "block" };
  const inputStyle: React.CSSProperties = { width: "100%", fontSize: 13, padding: "8px 10px", borderRadius: 7, border: "1px solid #e5e7eb", background: "#fff", color: "#1a1614", boxSizing: "border-box" };
  const selectStyle: React.CSSProperties = { ...inputStyle };

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#9ca3af" }}>
          Sub-Hosts ({hosts.length})
        </div>
        <button
          onClick={() => { setShowAdd(v => !v); setError(null); }}
          style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, color: "#c41e3a", background: "none", border: "1px solid #fecdd3", borderRadius: 6, padding: "5px 12px", cursor: "pointer" }}
        >
          <Plus size={11} /> Add Sub-Host
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div style={{ background: "#fafaf9", border: "1px solid #e5e7eb", borderRadius: 10, padding: 16, marginBottom: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1614", marginBottom: 4 }}>Add Sub-Host</div>

          {/* User search */}
          <div>
            <label style={labelStyle}>Search User</label>
            <input
              value={userSearch}
              onChange={e => setUserSearch(e.target.value)}
              placeholder="Type name or email…"
              style={inputStyle}
            />
            {searchLoading && <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>Searching…</div>}
            {userResults.length > 0 && !form.userId && (
              <div style={{ border: "1px solid #e5e7eb", borderRadius: 7, marginTop: 4, background: "#fff", maxHeight: 160, overflowY: "auto" }}>
                {userResults.map((u: any) => (
                  <button key={u.id} onClick={() => {
                    setForm(f => ({ ...f, userId: u.id, displayName: u.name ?? f.displayName }));
                    setUserSearch(u.name ?? u.email);
                    setUserResults([]);
                  }} style={{ width: "100%", textAlign: "left", padding: "8px 12px", border: "none", background: "none", cursor: "pointer", fontSize: 13, color: "#1a1614", borderBottom: "1px solid #f3f4f6" }}>
                    <strong>{u.name ?? "—"}</strong> <span style={{ color: "#9ca3af", fontSize: 11 }}>{u.email}</span>
                  </button>
                ))}
              </div>
            )}
            {form.userId && (
              <div style={{ marginTop: 4, fontSize: 11, color: "#16a34a", display: "flex", alignItems: "center", gap: 4 }}>
                ✓ User selected — <button onClick={() => { setForm(f => ({ ...f, userId: "", displayName: "" })); setUserSearch(""); }} style={{ fontSize: 11, color: "#c41e3a", background: "none", border: "none", cursor: "pointer" }}>Change</button>
              </div>
            )}
          </div>

          {/* Display name */}
          <div>
            <label style={labelStyle}>Display Name</label>
            <input value={form.displayName} onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))} placeholder="e.g. Carlos — Boquete Host" style={inputStyle} />
          </div>

          {/* Also a referrer */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input type="checkbox" id="asReferrer" checked={form.asReferrer} onChange={e => setForm(f => ({ ...f, asReferrer: e.target.checked }))} style={{ width: 14, height: 14, cursor: "pointer" }} />
            <label htmlFor="asReferrer" style={{ fontSize: 13, color: "#1a1614", cursor: "pointer" }}>Also assign as a Referrer (generate referral code + QR)</label>
          </div>

          {/* Referrer options */}
          {form.asReferrer && (
            <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#9ca3af" }}>Referral Commission</div>

              <div>
                <label style={labelStyle}>Commission Payer</label>
                <select value={form.commissionPayer} onChange={e => setForm(f => ({ ...f, commissionPayer: e.target.value }))} style={selectStyle}>
                  <option value="OKU">OKU Hospitality Group pays</option>
                  <option value="ENTITY">This Company pays</option>
                </select>
                <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>
                  {form.commissionPayer === "OKU"
                    ? "OKU covers the commission — appears in platform AP ledger."
                    : "Company is responsible for paying this host's commissions."}
                </div>
              </div>

              <div>
                <label style={labelStyle}>Commission Mode</label>
                <select value={form.commissionMode} onChange={e => setForm(f => ({ ...f, commissionMode: e.target.value }))} style={selectStyle}>
                  <option value="NONE">No Commission</option>
                  <option value="PERCENTAGE">Percentage of ticket</option>
                  <option value="FLAT">Flat rate per ticket</option>
                </select>
              </div>

              {form.commissionMode !== "NONE" && (
                <div>
                  <label style={labelStyle}>{form.commissionMode === "PERCENTAGE" ? "Rate (%)" : "Amount ($)"}</label>
                  <div style={{ position: "relative", display: "inline-block" }}>
                    <input
                      type="number" min={0} max={form.commissionMode === "PERCENTAGE" ? 100 : undefined}
                      value={form.commissionShareBps}
                      onChange={e => setForm(f => ({ ...f, commissionShareBps: e.target.value }))}
                      placeholder={form.commissionMode === "PERCENTAGE" ? "e.g. 10" : "e.g. 5"}
                      style={{ ...inputStyle, width: 120, paddingRight: form.commissionMode === "PERCENTAGE" ? 28 : undefined }}
                    />
                    {form.commissionMode === "PERCENTAGE" && (
                      <span style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: "#9ca3af", pointerEvents: "none" }}>%</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {error && <div style={{ fontSize: 12, color: "#dc2626", padding: "8px 12px", background: "#fef2f2", borderRadius: 6, border: "1px solid #fecaca" }}>{error}</div>}

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={() => { setShowAdd(false); setError(null); }} style={{ padding: "8px 16px", fontSize: 12, borderRadius: 7, border: "1px solid #e5e7eb", background: "#fff", color: "#6b7280", cursor: "pointer" }}>Cancel</button>
            <button onClick={addSubHost} disabled={saving} style={{ padding: "8px 18px", fontSize: 12, fontWeight: 600, borderRadius: 7, border: "none", background: "#c41e3a", color: "#fff", cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1, display: "flex", alignItems: "center", gap: 6 }}>
              {saving ? <Loader size={12} /> : null} {saving ? "Saving…" : "Add Sub-Host"}
            </button>
          </div>
        </div>
      )}

      {/* Host list */}
      {loading && <div style={{ fontSize: 13, color: "#9ca3af", padding: "16px 0" }}>Loading sub-hosts…</div>}
      {!loading && hosts.length === 0 && !showAdd && (
        <div style={{ padding: "24px 0", textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
          <Users size={24} style={{ display: "block", margin: "0 auto 8px", opacity: 0.4 }} />
          No sub-hosts assigned yet. Add one above.
        </div>
      )}
      {hosts.map(host => {
        const isOpen = expandedHost === host.id;
        const referrer = host.referrerAssignments?.[0];
        return (
          <div key={host.id} style={{ border: "1px solid #e5e7eb", borderRadius: 10, marginBottom: 10, overflow: "hidden" }}>
            {/* Host row */}
            <div
              onClick={() => setExpandedHost(isOpen ? null : host.id)}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", cursor: "pointer", background: isOpen ? "#fafaf9" : "#fff" }}
            >
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#f0ede9", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#9ca3af", flexShrink: 0 }}>
                {host.displayName[0]?.toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1614" }}>{host.displayName}</div>
                <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 1 }}>{host.user?.email}</div>
              </div>
              {referrer ? (
                <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 20, background: "#fef9c3", color: "#a16207" }}>REFERRER</span>
              ) : (
                <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 20, background: "#f1f5f9", color: "#64748b" }}>HOST ONLY</span>
              )}
              <span style={{ fontSize: 11, color: "#c5bfb9" }}>{isOpen ? "▲" : "▼"}</span>
            </div>

            {/* Expanded details */}
            {isOpen && (
              <div style={{ padding: "12px 14px", borderTop: "1px solid #f3f4f6", background: "#fafaf9" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <InfoRow label="User" value={host.user?.name ?? host.user?.email} />
                  <InfoRow label="Status" value={host.isActive ? "Active" : "Inactive"} />
                  {referrer && (
                    <>
                      <InfoRow label="Referral Code" value={<code style={{ fontSize: 11, background: "#f3f4f6", padding: "2px 6px", borderRadius: 4 }}>{referrer.referralCode}</code>} />
                      <InfoRow label="Commission Payer" value={referrer.commissionPayer === "OKU" ? "OKÜ Hospitality Group" : "This Company"} />
                      <InfoRow label="Commission Mode" value={COMMISSION_MODE_LABEL[referrer.commissionMode] ?? referrer.commissionMode} />
                      {referrer.series && <InfoRow label="Scope" value={`${referrer.series.title} only`} />}
                      {!referrer.series && <InfoRow label="Scope" value="All OKÜ events" />}
                    </>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "flex-end" }}>
                  <button
                    onClick={() => removeSubHost(host.id)}
                    style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, padding: "5px 10px", borderRadius: 6, border: "1px solid #fecaca", background: "#fff", color: "#dc2626", cursor: "pointer" }}
                  >
                    <Trash2 size={11} /> Remove from company
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const STATUS_COMM_COLOR: Record<string, { bg: string; color: string }> = {
  PENDING:  { bg: "#fef9c3", color: "#a16207" },
  APPROVED: { bg: "#d1fae5", color: "#065f46" },
  PAID:     { bg: "#dbeafe", color: "#1d4ed8" },
  REJECTED: { bg: "#fee2e2", color: "#dc2626" },
};

const PAYOUT_CYCLE_OPTIONS = [
  { value: "DAILY",    label: "Daily",     desc: "Pays out every day — maximum hustle motivation" },
  { value: "WEEKLY",   label: "Weekly",    desc: "Pays out every 7 days" },
  { value: "BIWEEKLY", label: "Bi-weekly", desc: "Pays out every 2 weeks" },
  { value: "MONTHLY",  label: "Monthly",   desc: "Pays out once per month" },
] as const;

function CompensationTab({
  profile, extUser, compData, compLoading, fmt, canEdit, onCompDataInvalidated,
}: {
  profile: UnifiedProfile;
  extUser: any;
  compData: any;
  compLoading: boolean;
  fmt: (d?: string | null) => string;
  canEdit: boolean;
  onCompDataInvalidated: () => void;
}) {
  const fmtCents = (c: number) => `$${(c / 100).toFixed(2)}`;
  const influencer = extUser?.influencer ?? null;

  const [cycleForm, setCycleForm] = useState<{ payoutCycle: string; minPayoutDollars: string } | null>(null);
  const [cycleSaving, setCycleSaving] = useState(false);
  const [cycleSaved, setCycleSaved] = useState(false);
  const [cycleError, setCycleError] = useState("");

  const initCycleForm = () => {
    if (!influencer) return;
    setCycleForm({
      payoutCycle: influencer.payoutCycle ?? "MONTHLY",
      minPayoutDollars: influencer.minPayoutThresholdCents != null
        ? String(influencer.minPayoutThresholdCents / 100)
        : "25",
    });
  };

  const saveCycleForm = async () => {
    if (!influencer || !cycleForm) return;
    setCycleSaving(true);
    setCycleError("");
    try {
      const res = await fetch(`/api/v1/admin/influencer-profiles/${influencer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payoutCycle: cycleForm.payoutCycle,
          minPayoutThresholdCents: Math.round(parseFloat(cycleForm.minPayoutDollars || "0") * 100),
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Failed to save");
      influencer.payoutCycle = data.data.payoutCycle;
      influencer.minPayoutThresholdCents = data.data.minPayoutThresholdCents;
      setCycleForm(null);
      setCycleSaved(true);
      setTimeout(() => setCycleSaved(false), 2500);
    } catch (e: any) {
      setCycleError(e.message);
    } finally {
      setCycleSaving(false);
    }
  };

  const plan = compData?.compensationPlan ?? extUser?.referrer?.compensationPlan ?? null;
  const commissions: any[] = compData?.commissions ?? extUser?.referrer?.commissions ?? [];
  const attributions: any[] = compData?.attributions ?? extUser?.referrer?.attributions ?? [];

  const totalPaid    = commissions.filter((c: any) => c.status === "PAID").reduce((s: number, c: any) => s + c.amountCents, 0);
  const totalPending = commissions.filter((c: any) => c.status === "PENDING").reduce((s: number, c: any) => s + c.amountCents, 0);
  const patronized   = attributions.filter((a: any) => a.conversionStage === "PATRONIZED").length;
  const conv         = attributions.length > 0 ? Math.round((patronized / attributions.length) * 100) : 0;

  if (compLoading) {
    return <div style={{ textAlign: "center", padding: "40px 0", color: "#9ca3af", fontSize: 13 }}>Loading compensation data…</div>;
  }

  const inputStyle = { width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 13, outline: "none", background: "#fff" };

  return (
    <div>
      {/* Influencer-specific */}
      {profile.primaryCategory === "influencer" && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#9ca3af", marginBottom: 12 }}>Influencer Compensation</div>
          <div style={{ padding: "16px 18px", background: "linear-gradient(135deg, #1a1614 0%, #2d2520 100%)", borderRadius: 12, marginBottom: 14, color: "#fff" }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>Commission Rate</div>
            <div style={{ fontFamily: "var(--font-heading)", fontSize: 36, fontWeight: 700, color: "#fbbf24" }}>
              {influencer?.commissionRateBps ? `${(influencer.commissionRateBps / 100).toFixed(0)}%` : "—"}
            </div>
          </div>
          <InfoRow label="Ref Code"  value={<span style={{ fontFamily: "monospace" }}>{profile.influencerRefCode ?? "—"}</span>} />
          <InfoRow label="Approved"  value={influencer?.approved ? "Yes" : "Pending"} />

          {/* Pay Cycle Section */}
          <div style={{ marginTop: 20, marginBottom: 4 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#9ca3af" }}>Pay Cycle</div>
              {!cycleForm && (
                <button
                  onClick={initCycleForm}
                  style={{ fontSize: 11, color: "#c41e3a", background: "none", border: "none", cursor: "pointer", fontWeight: 600, padding: "2px 6px" }}
                >
                  {cycleSaved ? "✓ Saved" : "Edit"}
                </button>
              )}
            </div>

            {cycleForm ? (
              <div style={{ background: "#fafaf9", borderRadius: 10, border: "1px solid #e5e7eb", padding: "14px 16px" }}>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", display: "block", marginBottom: 5 }}>Pay Frequency</label>
                  <select
                    value={cycleForm.payoutCycle}
                    onChange={e => setCycleForm(f => f ? { ...f, payoutCycle: e.target.value } : f)}
                    style={inputStyle}
                  >
                    {PAYOUT_CYCLE_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label} — {o.desc}</option>
                    ))}
                  </select>
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", display: "block", marginBottom: 5 }}>Minimum Payout ($)</label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={cycleForm.minPayoutDollars}
                    onChange={e => setCycleForm(f => f ? { ...f, minPayoutDollars: e.target.value } : f)}
                    placeholder="e.g. 25"
                    style={{ ...inputStyle, width: 130 }}
                  />
                  <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>Balance must exceed this before a payout triggers.</div>
                </div>
                {cycleError && <div style={{ fontSize: 12, color: "#dc2626", marginBottom: 10 }}>{cycleError}</div>}
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={saveCycleForm}
                    disabled={cycleSaving}
                    style={{ padding: "7px 16px", borderRadius: 8, background: "#1a1614", color: "#fff", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600 }}
                  >
                    {cycleSaving ? "Saving…" : "Save"}
                  </button>
                  <button
                    onClick={() => { setCycleForm(null); setCycleError(""); }}
                    style={{ padding: "7px 12px", borderRadius: 8, background: "none", border: "1px solid #e5e7eb", cursor: "pointer", fontSize: 12, color: "#6b7280" }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div style={{ padding: "12px 14px", background: "#fafaf9", borderRadius: 8, border: "1px solid #f3f4f6" }}>
                  <div style={{ fontSize: 10, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>Frequency</div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "#1a1614" }}>
                    {PAYOUT_CYCLE_OPTIONS.find(o => o.value === (influencer?.payoutCycle ?? "MONTHLY"))?.label ?? "Monthly"}
                  </div>
                </div>
                <div style={{ padding: "12px 14px", background: "#fafaf9", borderRadius: 8, border: "1px solid #f3f4f6" }}>
                  <div style={{ fontSize: 10, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>Min. Payout</div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "#1a1614" }}>
                    {influencer?.minPayoutThresholdCents != null ? `$${(influencer.minPayoutThresholdCents / 100).toFixed(0)}` : "$25"}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div style={{ marginTop: 20 }}>
            <a href="/admin/compensation" style={{ fontSize: 13, color: "#c41e3a", textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
              <ExternalLink size={13} /> View in Compensation Admin
            </a>
          </div>
        </>
      )}

      {/* Referrer / Host */}
      {(profile.primaryCategory === "referrer" || profile.primaryCategory === "host") && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#9ca3af", marginBottom: 12 }}>Compensation Plan</div>

          {plan ? (
            <div style={{ padding: "16px 18px", background: "linear-gradient(135deg, #1a1614 0%, #2d2520 100%)", borderRadius: 12, marginBottom: 16, color: "#fff" }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{plan.name}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 12 }}>{plan.modelType?.replace(/_/g, " ")}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {plan.commissionPercent != null && (
                  <span style={{ padding: "4px 10px", borderRadius: 20, background: "rgba(251,191,36,0.15)", border: "1px solid rgba(251,191,36,0.3)", fontSize: 12, color: "#fbbf24", fontWeight: 700 }}>
                    {plan.commissionPercent}% commission
                  </span>
                )}
                {plan.hourlyRateCents != null && (
                  <span style={{ padding: "4px 10px", borderRadius: 20, background: "rgba(52,211,153,0.15)", border: "1px solid rgba(52,211,153,0.3)", fontSize: 12, color: "#34d399", fontWeight: 700 }}>
                    {fmtCents(plan.hourlyRateCents)}/hr
                  </span>
                )}
                {plan.flatPerCoverCents != null && (
                  <span style={{ padding: "4px 10px", borderRadius: 20, background: "rgba(96,165,250,0.15)", border: "1px solid rgba(96,165,250,0.3)", fontSize: 12, color: "#60a5fa", fontWeight: 700 }}>
                    {fmtCents(plan.flatPerCoverCents)}/cover
                  </span>
                )}
                {plan.flatPerPartyCents != null && (
                  <span style={{ padding: "4px 10px", borderRadius: 20, background: "rgba(167,139,250,0.15)", border: "1px solid rgba(167,139,250,0.3)", fontSize: 12, color: "#a78bfa", fontWeight: 700 }}>
                    {fmtCents(plan.flatPerPartyCents)}/party
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div style={{ padding: "14px 16px", background: "#fafaf9", borderRadius: 8, border: "1px dashed #d1cdc7", marginBottom: 12 }}>
              <div style={{ fontSize: 13, color: "#9ca3af" }}>No compensation plan assigned.</div>
            </div>
          )}

          <CompensationPlanPicker
            userId={profile.sourceId}
            currentPlanId={plan?.id ?? null}
            currentPlanName={plan?.name ?? null}
            plans={compData?.plans ?? undefined}
            readOnly={!canEdit}
            onSaved={() => onCompDataInvalidated()}
          />
          {!canEdit && (
            <div style={{ fontSize: 11, color: "#9ca3af", marginTop: -8, marginBottom: 12, fontStyle: "italic" }}>
              Read-only — your role cannot change compensation plans.
            </div>
          )}

          {/* Stats strip */}
          {(commissions.length > 0 || attributions.length > 0) && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 18 }}>
                {[
                  { label: "Paid Out",   value: fmtCents(totalPaid),    color: "#16a34a" },
                  { label: "Pending",    value: fmtCents(totalPending), color: "#d97706" },
                  { label: "Conv. Rate", value: `${conv}%`,             color: conv >= 50 ? "#16a34a" : conv >= 25 ? "#d97706" : "#c41e3a" },
                ].map(s => (
                  <div key={s.label} style={{ padding: "12px 10px", background: "#fafaf9", borderRadius: 8, border: "1px solid #f3f4f6", textAlign: "center" }}>
                    <div style={{ fontFamily: "var(--font-heading)", fontSize: 18, fontWeight: 700, color: s.color }}>{s.value}</div>
                    <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 2, textTransform: "uppercase", letterSpacing: "0.05em" }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Commission History */}
          {commissions.length > 0 && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#9ca3af", marginBottom: 10 }}>Commission History</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {commissions.slice(0, 8).map((c: any, i: number) => {
                  const cs = STATUS_COMM_COLOR[c.status] ?? STATUS_COMM_COLOR.PENDING;
                  return (
                    <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 12px", background: "#fafaf9", borderRadius: 8, border: "1px solid #f3f4f6" }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1614" }}>{fmtCents(c.amountCents)}</div>
                        {c.reservation && (
                          <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 1 }}>
                            {c.reservation.partySize} guests{c.reservation.conceptRequested ? ` · ${c.reservation.conceptRequested}` : ""}
                          </div>
                        )}
                        {c.createdAt && <div style={{ fontSize: 10, color: "#c4bfba", marginTop: 1 }}>{new Date(c.createdAt).toLocaleDateString()}</div>}
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 4, letterSpacing: "0.04em", background: cs.bg, color: cs.color }}>
                        {c.status}
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          <div style={{ marginTop: 20 }}>
            <a href="/admin/compensation" style={{ fontSize: 13, color: "#c41e3a", textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
              <ExternalLink size={13} /> View in Compensation Admin
            </a>
          </div>
        </>
      )}
    </div>
  );
}

function ActivityTab({ auditLogs, loading, fmt }: { auditLogs: any[]; loading: boolean; fmt: (d?: string | null) => string }) {
  if (loading) return <div style={{ textAlign: "center", padding: "40px 0", color: "#9ca3af" }}>Loading activity…</div>;
  if (auditLogs.length === 0) return <div style={{ color: "#9ca3af", fontSize: 13 }}>No activity logged.</div>;
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#9ca3af", marginBottom: 12 }}>Audit Log</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {auditLogs.map((log: any, i: number) => (
          <div key={i} style={{ display: "flex", gap: 12, padding: "10px 0", borderBottom: "1px solid #f3f4f6", alignItems: "flex-start" }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#c41e3a", marginTop: 4, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, color: "#1a1614" }}>{log.action?.replace(/_/g, " ") ?? log.label ?? "Event"}</div>
              {log.performedBy && (
                <div style={{ fontSize: 11, color: "#6b7280", marginTop: 1 }}>by {log.performedBy.name ?? log.performedBy.email}</div>
              )}
              <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 1 }}>{fmt(log.createdAt)}</div>
              {log.notes && <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2, fontStyle: "italic" }}>{log.notes}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
