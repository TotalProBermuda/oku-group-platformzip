"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useTranslation } from "@/components/i18n/LocaleProvider";
import {
  Users, Building2, Link2, Search, Plus,
  ShieldCheck, ShieldOff, Calendar, DollarSign, MoreHorizontal, Star, X,
} from "lucide-react";
import ProfileDrawer from "@/components/admin/profiles/ProfileDrawer";
import CreateProfileModal from "@/components/admin/profiles/CreateProfileModal";
import type { UnifiedProfile } from "@/types/profiles";

export type { UnifiedProfile };

interface Summary {
  totalCount: number;
  peopleCount: number;
  companiesCount: number;
  withAccessCount: number;
  hostCount: number;
  referrerCount: number;
}

const CATEGORY_OPTIONS = [
  ["admin","Admin"], ["influencer","Influencer"], ["partner","Partner"],
  ["investor","Investor"], ["staff","Staff"], ["host","Host"],
  ["attendee","Attendee"], ["referrer","Referrer"], ["entity","Entity"], ["visitor","Visitor"],
];
const STATUS_OPTIONS = ["ACTIVE","SUSPENDED","INACTIVE","ARCHIVED","PENDING"];

function ActionMenu({ profile, onView, portalHref }: { profile: UnifiedProfile; onView: () => void; portalHref?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={e => { e.stopPropagation(); setOpen(v => !v); }}
        style={{ background: "none", border: "1px solid #e5e0d8", borderRadius: 6, padding: "4px 8px", cursor: "pointer", display: "flex", alignItems: "center", color: "#6b7280" }}
      >
        <MoreHorizontal size={14} />
      </button>
      {open && (
        <div style={{ position: "absolute", right: 0, top: "100%", marginTop: 4, background: "white", border: "1px solid #e5e0d8", borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.12)", zIndex: 100, minWidth: 160, overflow: "hidden" }}>
          {portalHref && (
            <a
              href={portalHref}
              onClick={() => setOpen(false)}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 16px", background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#1a1614", textDecoration: "none" }}
              onMouseEnter={e => (e.currentTarget.style.background = "#f9fafb")}
              onMouseLeave={e => (e.currentTarget.style.background = "none")}
            >
              Open Portal
            </a>
          )}
          <button onClick={() => { setOpen(false); onView(); }}
            style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 16px", background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#1a1614" }}
            onMouseEnter={e => (e.currentTarget.style.background = "#f9fafb")}
            onMouseLeave={e => (e.currentTarget.style.background = "none")}
          >View Details</button>
        </div>
      )}
    </div>
  );
}

function AccessBadge({ links, count }: { links: UnifiedProfile["accountLinks"]; count: number }) {
  if (count === 0) return <span style={{ fontSize: 11, color: "#9ca3af", display: "flex", alignItems: "center", gap: 4 }}><ShieldOff size={12} /> No Access</span>;
  const first = links[0];
  if (!first) return <span style={{ fontSize: 11, color: "#16a34a", display: "flex", alignItems: "center", gap: 4 }}><ShieldCheck size={12} /> {count} linked</span>;
  const color = first.user.status === "ACTIVE" ? "#16a34a" : first.user.status === "SUSPENDED" ? "#dc2626" : "#d97706";
  return (
    <span style={{ fontSize: 11, color, display: "flex", alignItems: "center", gap: 4 }}>
      <ShieldCheck size={12} />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 140 }}>{first.user.email}</span>
    </span>
  );
}

function AssignmentsBadge({ seriesCount }: { seriesCount: number }) {
  if (seriesCount === 0) return <span style={{ fontSize: 11, color: "#9ca3af" }}>—</span>;
  return <span style={{ fontSize: 11, color: "#1a1614", display: "flex", alignItems: "center", gap: 4 }}><Calendar size={11} /> {seriesCount} series</span>;
}

function CompBadge({ eligible }: { eligible: boolean }) {
  if (!eligible) return <span style={{ fontSize: 11, color: "#9ca3af" }}>—</span>;
  return <span style={{ fontSize: 11, color: "#d97706", display: "flex", alignItems: "center", gap: 4 }}><DollarSign size={11} /> Eligible</span>;
}

const CATEGORY_COLOR: Record<string, { bg: string; color: string }> = {
  admin:      { bg: "#fce7f3", color: "#be185d" },
  influencer: { bg: "#ede9fe", color: "#7c3aed" },
  partner:    { bg: "#dbeafe", color: "#1d4ed8" },
  investor:   { bg: "#fef3c7", color: "#92400e" },
  staff:      { bg: "#d1fae5", color: "#065f46" },
  host:       { bg: "#ffedd5", color: "#c2410c" },
  attendee:   { bg: "#f0fdf4", color: "#15803d" },
  referrer:   { bg: "#fef9c3", color: "#a16207" },
  entity:     { bg: "#f1f5f9", color: "#475569" },
  visitor:    { bg: "#f3f4f6", color: "#6b7280" },
};

const STATUS_STYLE: Record<string, { background: string; color: string }> = {
  ACTIVE:    { background: "#dcfce7", color: "#16a34a" },
  PENDING:   { background: "#fef9c3", color: "#a16207" },
  SUSPENDED: { background: "#fee2e2", color: "#dc2626" },
  INACTIVE:  { background: "#f3f4f6", color: "#6b7280" },
  ARCHIVED:  { background: "#fee2e2", color: "#dc2626" },
};

const catLabel = (c: string) => CATEGORY_OPTIONS.find(o => o[0] === c)?.[1] ?? c.replace(/_/g, " ").replace(/\b\w/g, x => x.toUpperCase());

const ROLE_LABELS: Record<string, string> = {
  SUPERADMIN: "Superadmin",
  FB_DIRECTOR: "F&B Director",
  ADMIN_COMMERCIAL: "Commercial Admin",
  ADMIN_HR: "Admin HR",
  ADMIN_IR: "Admin IR",
  ADMIN_FINANCE: "Finance Admin",
  RESTAURANT_SUPERVISOR: "Restaurant Supervisor",
  RESTAURANT_HOST: "Restaurant Host",
  STREETSIDE_HOST: "Streetside Host",
  STAFF_OKU: "OKU Staff",
  STAFF_CATCH: "Catch Staff",
  INFLUENCER: "Influencer",
  PARTNER: "Partner",
  INVESTOR: "Investor",
  REFERRER: "Referrer",
  ATTENDEE: "Attendee",
  MEMBER: "Member",
};

const ROLE_PRIORITY = [
  "SUPERADMIN",
  "FB_DIRECTOR",
  "RESTAURANT_SUPERVISOR",
  "RESTAURANT_HOST",
  "STREETSIDE_HOST",
  "ADMIN_COMMERCIAL",
  "ADMIN_HR",
  "ADMIN_IR",
  "ADMIN_FINANCE",
  "INFLUENCER",
  "PARTNER",
  "INVESTOR",
  "REFERRER",
  "STAFF_OKU",
  "STAFF_CATCH",
  "ATTENDEE",
  "MEMBER",
];

function primaryRole(profile: UnifiedProfile): string {
  return ROLE_PRIORITY.find(role => profile.roles.includes(role)) ?? profile.roles[0] ?? "";
}

function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role.replace(/_/g, " ").replace(/\b\w/g, x => x.toUpperCase());
}

function canonicalPortal(profile: UnifiedProfile): string | null {
  const roles = profile.roles;
  if (roles.includes("SUPERADMIN") || roles.includes("FB_DIRECTOR") || roles.some(r => r.startsWith("ADMIN_"))) return "/admin";
  if (roles.includes("RESTAURANT_SUPERVISOR") || roles.includes("RESTAURANT_HOST")) return "/host/dashboard";
  if (roles.includes("STREETSIDE_HOST")) return "/host/streetside";
  if (roles.includes("PARTNER")) return "/partner/dashboard";
  if (roles.includes("INFLUENCER")) return "/influencer/dashboard";
  if (roles.includes("REFERRER")) return "/referrer/dashboard";
  if (roles.includes("INVESTOR")) return "/investor";
  return null;
}

function categoryHelp(category: string): string | null {
  if (category === "admin") {
    return "Admin shows owner and back-office operators such as F&B Director. Restaurant Supervisor is a Host profile; select Host or clear filters to view it.";
  }
  if (category === "host") {
    return "Host shows live-service operators such as Restaurant Supervisor. F&B Director remains under Admin.";
  }
  return null;
}

function Chip({ label, active, onClick, color }: { label: string; active: boolean; onClick: () => void; color?: string }) {
  const accent = color ?? "#c41e3a";
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        padding: "5px 13px", borderRadius: 999, fontSize: 12, fontWeight: active ? 600 : 500,
        whiteSpace: "nowrap", cursor: "pointer", transition: "all 0.15s",
        border: active ? `1.5px solid ${accent}` : "1.5px solid #e5e0d8",
        background: active ? `${accent}15` : "white",
        color: active ? accent : "#6b7280",
        boxShadow: active ? `0 0 0 3px ${accent}18` : "none",
      }}
    >
      {label}
    </button>
  );
}

function ChipRow({ label, chips, value, onChange }: {
  label: string;
  chips: { key: string; label: string; color?: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#b0a89e", minWidth: 80, flexShrink: 0 }}>{label}</span>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {chips.map(c => (
          <Chip key={c.key} label={c.label} active={value === c.key} onClick={() => onChange(value === c.key ? "" : c.key)} color={c.color} />
        ))}
      </div>
    </div>
  );
}

export default function ProfilesPage() {
  useTranslation();

  const [profiles, setProfiles] = useState<UnifiedProfile[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [accessFilter, setAccessFilter] = useState("");
  const [compFilter, setCompFilter] = useState("");

  const [activeCard, setActiveCard] = useState<string | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<UnifiedProfile | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const fetchProfiles = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: "50" });
    if (search)         params.set("q", search);
    if (typeFilter)     params.set("profileType", typeFilter);
    if (categoryFilter) params.set("category", categoryFilter);
    if (statusFilter)   params.set("status", statusFilter);
    if (accessFilter)   params.set("hasAccess", accessFilter);
    if (compFilter)     params.set("compensationEligible", compFilter);
    try {
      const res  = await fetch(`/api/v1/admin/profiles?${params}`);
      const data = await res.json();
      setProfiles(data.profiles ?? []);
      setTotal(data.total ?? 0);
      setSummary(data.summary ?? null);
    } finally {
      setLoading(false);
    }
  }, [page, search, typeFilter, categoryFilter, statusFilter, accessFilter, compFilter]);

  useEffect(() => { fetchProfiles(); }, [fetchProfiles]);

  const clearFilters = () => {
    setSearch(""); setTypeFilter(""); setCategoryFilter(""); setStatusFilter("");
    setAccessFilter(""); setCompFilter(""); setPage(1); setActiveCard(null);
  };

  const applyCardFilter = (cardKey: string, applyFn: () => void) => {
    if (activeCard === cardKey) {
      clearFilters();
    } else {
      clearFilters();
      setActiveCard(cardKey);
      applyFn();
    }
  };

  const hasFilters = search || typeFilter || categoryFilter || statusFilter || accessFilter || compFilter;

  const SUMMARY_CARDS: {
    key: string; label: string; value: number | string;
    icon: React.ReactNode; accent: string; bg: string;
    onActivate: () => void;
  }[] = [
    {
      key: "all", label: "Total Profiles", value: summary?.totalCount ?? "—",
      icon: <Users size={20} />, accent: "#c41e3a", bg: "rgba(196,30,58,0.06)",
      onActivate: () => {},
    },
    {
      key: "people", label: "People", value: summary?.peopleCount ?? "—",
      icon: <Users size={20} />, accent: "#1d4ed8", bg: "rgba(29,78,216,0.06)",
      onActivate: () => setTypeFilter("PERSON"),
    },
    {
      key: "companies", label: "Companies", value: summary?.companiesCount ?? "—",
      icon: <Building2 size={20} />, accent: "#0d7a4e", bg: "rgba(13,122,78,0.06)",
      onActivate: () => setTypeFilter("COMPANY"),
    },
    {
      key: "access", label: "Platform Access", value: summary?.withAccessCount ?? "—",
      icon: <ShieldCheck size={20} />, accent: "#9333ea", bg: "rgba(147,51,234,0.06)",
      onActivate: () => setAccessFilter("true"),
    },
    {
      key: "hosts", label: "Hosts", value: summary?.hostCount ?? "—",
      icon: <Star size={20} />, accent: "#d97706", bg: "rgba(217,119,6,0.06)",
      onActivate: () => setCategoryFilter("host"),
    },
    {
      key: "referrers", label: "Referrers", value: summary?.referrerCount ?? "—",
      icon: <Link2 size={20} />, accent: "#0891b2", bg: "rgba(8,145,178,0.06)",
      onActivate: () => setCategoryFilter("referrer"),
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div className="dash-eyebrow">ADMIN · REGISTRY</div>
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: 28, margin: 0, color: "#1a1614" }}>Profiles</h1>
          <p style={{ color: "#7c7168", fontSize: 14, margin: "4px 0 0", maxWidth: 520 }}>
            All people and companies across platform access, hosting, partnerships, referrals, and events.
          </p>
        </div>
        <button className="btn btn-primary" style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }} onClick={() => setShowCreate(true)}>
          <Plus size={16} /> New Profile
        </button>
      </div>

      {/* KPI Cards — clickable filters */}
      <div className="kpi-grid">
        {SUMMARY_CARDS.map(card => {
          const isActive = activeCard === card.key;
          return (
            <button
              key={card.key}
              onClick={() => applyCardFilter(card.key, card.onActivate)}
              style={{
                background: isActive ? card.bg : "white",
                border: isActive ? `2px solid ${card.accent}` : "1.5px solid #e5e0d8",
                borderRadius: 14, padding: "18px 22px",
                cursor: card.key === "all" ? "default" : "pointer",
                textAlign: "left", transition: "all 0.18s",
                boxShadow: isActive ? `0 0 0 4px ${card.accent}18, 0 2px 12px rgba(0,0,0,0.06)` : "0 1px 4px rgba(0,0,0,0.04)",
                transform: isActive ? "translateY(-2px)" : "none",
                position: "relative",
                pointerEvents: card.key === "all" ? "none" : undefined,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: isActive ? card.accent : "#9ca3af" }}>
                  {card.label}
                </span>
                <span style={{ color: isActive ? card.accent : "#d1cdc7", transition: "color 0.18s" }}>
                  {card.icon}
                </span>
              </div>
              <div style={{ fontFamily: "var(--font-heading)", fontSize: 30, fontWeight: 700, color: isActive ? card.accent : "#1a1614", transition: "color 0.18s" }}>
                {card.value}
              </div>
              {isActive && card.key !== "all" && (
                <div style={{
                  position: "absolute", top: 8, right: 8,
                  width: 18, height: 18, borderRadius: "50%",
                  background: card.accent, display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <X size={10} color="white" />
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Search + Chip Filters */}
      <div style={{
        background: "white", border: "1px solid #e5e0d8", borderRadius: 14,
        padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14,
      }}>
        {/* Search bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ position: "relative", flex: 1 }}>
            <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#9ca3af", pointerEvents: "none" }} />
            <input
              className="form-input"
              style={{ paddingLeft: 36, margin: 0, fontSize: 13, borderRadius: 10 }}
              placeholder="Search name, email, ref code…"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          {hasFilters && (
            <button onClick={clearFilters} style={{
              display: "flex", alignItems: "center", gap: 6, padding: "7px 13px",
              background: "#f3f4f6", border: "none", borderRadius: 8, cursor: "pointer",
              fontSize: 12, color: "#6b7280", fontWeight: 500, whiteSpace: "nowrap",
            }}>
              <X size={12} /> Clear all
            </button>
          )}
        </div>

        <div style={{ height: 1, background: "#f3f4f6" }} />

        {/* Chip filter rows */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <ChipRow
            label="Type"
            value={typeFilter}
            onChange={v => { setTypeFilter(v); setPage(1); setActiveCard(v === "PERSON" ? "people" : v === "COMPANY" ? "companies" : null); }}
            chips={[
              { key: "PERSON", label: "Person", color: "#1d4ed8" },
              { key: "COMPANY", label: "Company", color: "#0d7a4e" },
            ]}
          />
          <ChipRow
            label="Category"
            value={categoryFilter}
            onChange={v => { setCategoryFilter(v); setPage(1); setActiveCard(v === "host" ? "hosts" : v === "referrer" ? "referrers" : null); }}
            chips={CATEGORY_OPTIONS.map(([k, l]) => ({
              key: k, label: l,
              color: CATEGORY_COLOR[k]?.color,
            }))}
          />
          <ChipRow
            label="Status"
            value={statusFilter}
            onChange={v => { setStatusFilter(v); setPage(1); }}
            chips={STATUS_OPTIONS.map(s => ({
              key: s, label: s.charAt(0) + s.slice(1).toLowerCase(),
              color: STATUS_STYLE[s]?.color,
            }))}
          />
          <ChipRow
            label="Access"
            value={accessFilter}
            onChange={v => { setAccessFilter(v); setPage(1); setActiveCard(v === "true" ? "access" : null); }}
            chips={[
              { key: "true", label: "Has Access", color: "#9333ea" },
              { key: "false", label: "No Access", color: "#6b7280" },
            ]}
          />
          <ChipRow
            label="Compensation"
            value={compFilter}
            onChange={v => { setCompFilter(v); setPage(1); }}
            chips={[
              { key: "true", label: "Eligible", color: "#d97706" },
              { key: "false", label: "Not Eligible", color: "#6b7280" },
            ]}
          />
        </div>
      </div>

      {/* Active filter summary */}
      {hasFilters && !loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 12, color: "#9ca3af", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span>Showing <strong style={{ color: "#1a1614" }}>{total}</strong> {total === 1 ? "profile" : "profiles"}</span>
            {[
              typeFilter && `type: ${typeFilter.toLowerCase()}`,
              categoryFilter && `category: ${categoryFilter}`,
              statusFilter && `status: ${statusFilter.toLowerCase()}`,
              accessFilter === "true" && "has access",
              accessFilter === "false" && "no access",
              compFilter === "true" && "compensation eligible",
              compFilter === "false" && "not eligible",
              search && `"${search}"`,
            ].filter(Boolean).map((tag, i) => (
              <span key={i} style={{ padding: "2px 8px", background: "#f3f4f6", borderRadius: 4, color: "#4b5563", fontSize: 11 }}>{tag as string}</span>
            ))}
          </div>
          {categoryFilter && categoryHelp(categoryFilter) && (
            <div style={{ fontSize: 12, color: "#7c7168", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "8px 10px" }}>
              {categoryHelp(categoryFilter)}
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <div style={{ background: "white", border: "1px solid #e5e0d8", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#fafaf9", borderBottom: "2px solid #e5e0d8" }}>
                {["Name","Type","Role / Category","Company / Parent","Access","Series","Compensation","Status",""].map((h, i) => (
                  <th key={i} style={{ padding: "11px 14px", textAlign: "left", fontSize: 10, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "#9ca3af", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} style={{ padding: "48px", textAlign: "center", color: "#9ca3af" }}>Loading…</td></tr>
              ) : profiles.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ padding: "60px", textAlign: "center" }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                      <Users size={32} color="#d1cdc7" />
                      <div style={{ color: "#9ca3af", fontSize: 14 }}>No profiles match these filters</div>
                      <button className="btn btn-ghost" style={{ fontSize: 13 }} onClick={clearFilters}>Clear filters</button>
                    </div>
                  </td>
                </tr>
              ) : profiles.map((p, idx) => {
                const catStyle = CATEGORY_COLOR[p.primaryCategory] ?? CATEGORY_COLOR.visitor;
                const stStyle  = STATUS_STYLE[p.status] ?? STATUS_STYLE.INACTIVE;
                const avatar   = p.avatarUrl ?? p.logoUrl;
                const topRole  = primaryRole(p);
                const portal   = canonicalPortal(p);
                return (
                  <tr
                    key={p.id}
                    style={{ borderBottom: idx < profiles.length - 1 ? "1px solid #f3f4f6" : "none", cursor: "pointer", transition: "background 0.1s" }}
                    onClick={() => setSelectedProfile(p)}
                    onMouseEnter={e => (e.currentTarget.style.background = "#fafaf9")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >
                    <td style={{ padding: "13px 14px", minWidth: 200 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 36, height: 36, borderRadius: p.profileType === "COMPANY" ? 8 : "50%", background: "#f0ede9", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                          {avatar ? (
                            <img src={avatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          ) : (
                            <span style={{ fontWeight: 700, color: "#9ca3af", fontSize: 13 }}>{p.displayName[0]?.toUpperCase()}</span>
                          )}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, color: "#1a1614", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.displayName}</div>
                          {p.email && <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.email}</div>}
                          {!p.email && p.referralCode && <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 1 }}>#{p.referralCode}</div>}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: "13px 14px", whiteSpace: "nowrap" }}>
                      <span style={{ fontSize: 11, color: "#6b7280", display: "flex", alignItems: "center", gap: 4 }}>
                        {p.profileType === "COMPANY" ? <Building2 size={12} /> : <Users size={12} />}
                        {p.profileType === "COMPANY" ? "Company" : "Person"}
                      </span>
                    </td>
                    <td style={{ padding: "13px 14px" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 5, alignItems: "flex-start" }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "#1a1614" }}>
                          {topRole ? roleLabel(topRole) : catLabel(p.primaryCategory)}
                        </span>
                        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
                          <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 20, letterSpacing: "0.03em", ...catStyle }}>
                            {catLabel(p.primaryCategory)}
                          </span>
                          {portal && (
                            <span style={{ fontSize: 10, color: "#6b7280", background: "#f3f4f6", padding: "3px 7px", borderRadius: 20 }}>
                              {portal}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: "13px 14px", maxWidth: 160 }}>
                      {p.companyParent ? (
                        <span style={{ fontSize: 11, color: "#6b7280", display: "flex", alignItems: "center", gap: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          <Building2 size={11} />{p.companyParent}
                        </span>
                      ) : <span style={{ color: "#d1cdc7", fontSize: 11 }}>—</span>}
                    </td>
                    <td style={{ padding: "13px 14px" }}>
                      <AccessBadge links={p.accountLinks} count={p._count.accountLinks} />
                    </td>
                    <td style={{ padding: "13px 14px" }}>
                      <AssignmentsBadge seriesCount={p._count.seriesAssignments} />
                    </td>
                    <td style={{ padding: "13px 14px" }}>
                      <CompBadge eligible={p.compensationEligible} />
                    </td>
                    <td style={{ padding: "13px 14px" }}>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 4, letterSpacing: "0.04em", ...stStyle }}>{p.status}</span>
                    </td>
                    <td style={{ padding: "13px 14px" }} onClick={e => e.stopPropagation()}>
                      <ActionMenu profile={p} onView={() => setSelectedProfile(p)} portalHref={portal ?? undefined} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {!loading && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderTop: "1px solid #f3f4f6", fontSize: 12, color: "#9ca3af" }}>
            <span>{total} {total === 1 ? "profile" : "profiles"}</span>
            {total > 50 && (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button className="btn btn-ghost" style={{ fontSize: 12, padding: "3px 8px" }} disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
                <span style={{ padding: "3px 8px" }}>Page {page} of {Math.ceil(total / 50)}</span>
                <button className="btn btn-ghost" style={{ fontSize: 12, padding: "3px 8px" }} disabled={page * 50 >= total} onClick={() => setPage(p => p + 1)}>Next →</button>
              </div>
            )}
          </div>
        )}
      </div>

      {selectedProfile && (
        <ProfileDrawer profile={selectedProfile} onClose={() => setSelectedProfile(null)} onRefresh={fetchProfiles} />
      )}
      {showCreate && (
        <CreateProfileModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); fetchProfiles(); }}
        />
      )}
    </div>
  );
}
