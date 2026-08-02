"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslation, useLocale } from "@/components/i18n/LocaleProvider";
import { Users, ShieldCheck, Clock, Ban, Link2, Search, Plus, Filter } from "lucide-react";
import AccountDrawer from "@/components/admin/profiles/AccountDrawer";

const ROLE_OPTIONS = ["SUPERADMIN","ADMIN_COMMERCIAL","ADMIN_HR","ADMIN_IR","STAFF_OKU","STAFF_CATCH","INFLUENCER","PARTNER","INVESTOR","REFERRER","ATTENDEE"];
const STATUS_OPTIONS = ["ACTIVE","SUSPENDED","PENDING","LOCKED","ARCHIVED"];

interface AccountRow {
  id: string;
  name?: string;
  email: string;
  status: string;
  createdAt: string;
  lastLoginAt?: string;
  imageUrl?: string;
  roles: { roleKey: string }[];
  accountProfileLinks: { id: string; relationshipType: string; isPrimary: boolean; profile: { id: string; displayName: string; profileType: string; primaryCategory?: string } }[];
  _count: { accountProfileLinks: number };
}

interface Summary {
  totalCount: number;
  activeCount: number;
  suspendedCount: number;
  linkedCount: number;
  unlinkedCount: number;
  pendingCount: number;
}

export default function AccountsPage() {
  const t = useTranslation();
  const locale = useLocale();
  const dateLocale = locale === "es" ? "es-PA" : locale === "pt" ? "pt-BR" : "en-US";

  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [linkedFilter, setLinkedFilter] = useState("");

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: "50" });
    if (search) params.set("q", search);
    if (roleFilter) params.set("role", roleFilter);
    if (statusFilter) params.set("status", statusFilter);
    if (linkedFilter) params.set("linked", linkedFilter);

    try {
      const res = await fetch(`/api/v1/admin/accounts?${params}`);
      const data = await res.json();
      setAccounts(data.accounts ?? []);
      setTotal(data.total ?? 0);
      setSummary(data.summary ?? null);
    } finally {
      setLoading(false);
    }
  }, [page, search, roleFilter, statusFilter, linkedFilter]);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  const fmt = (d?: string | null) => d ? new Date(d).toLocaleDateString(dateLocale) : "—";
  const statusColor = (s: string) => s === "ACTIVE" ? { bg: "#dcfce7", color: "#16a34a" } : s === "SUSPENDED" ? { bg: "#fee2e2", color: "#dc2626" } : s === "PENDING" ? { bg: "#fef9c3", color: "#a16207" } : { bg: "#f3f4f6", color: "#6b7280" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div className="dash-eyebrow">{t("admin", "accountsLabel")}</div>
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: 28, margin: 0, color: "#1a1614" }}>
            {t("admin", "accountsTitle")}
          </h1>
          <p style={{ color: "#7c7168", fontSize: 14, margin: "4px 0 0" }}>
            {t("admin", "accountsDesc")}
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="kpi-grid">
        {[
          { label: t("admin", "totalAccounts"),   value: summary?.totalCount   ?? "—", icon: <Users size={20} color="#c41e3a" /> },
          { label: t("admin", "activeAccounts"),  value: summary?.activeCount  ?? "—", icon: <ShieldCheck size={20} color="#16a34a" /> },
          { label: t("admin", "pendingInvites"),  value: summary?.pendingCount ?? "—", icon: <Clock size={20} color="#d97706" /> },
          { label: t("admin", "suspended"),       value: summary?.suspendedCount ?? "—", icon: <Ban size={20} color="#dc2626" /> },
          { label: t("admin", "linkedAccounts"),  value: summary?.linkedCount  ?? "—", icon: <Link2 size={20} color="#9333ea" /> },
          { label: t("admin", "unlinked"),        value: summary?.unlinkedCount ?? "—", icon: <Link2 size={20} color="#9ca3af" /> },
        ].map(card => (
          <div key={card.label} className="stat-card-glass" style={{ padding: "20px 24px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#9ca3af" }}>{card.label}</span>
              {card.icon}
            </div>
            <div style={{ fontFamily: "var(--font-heading)", fontSize: 32, fontWeight: 700, color: "#1a1614" }}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* Filter Bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 220 }}>
          <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }} />
          <input className="form-input" style={{ paddingLeft: 36, margin: 0 }} placeholder={t("admin", "searchAccounts")} value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <select className="form-input" style={{ margin: 0, minWidth: 140 }} value={roleFilter} onChange={e => { setRoleFilter(e.target.value); setPage(1); }}>
          <option value="">{t("admin", "allRoles")}</option>
          {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <select className="form-input" style={{ margin: 0, minWidth: 120 }} value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}>
          <option value="">{t("admin", "allStatuses")}</option>
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="form-input" style={{ margin: 0, minWidth: 130 }} value={linkedFilter} onChange={e => { setLinkedFilter(e.target.value); setPage(1); }}>
          <option value="">{t("admin", "allLinked")}</option>
          <option value="true">{t("admin", "linked")}</option>
          <option value="false">{t("admin", "unlinked")}</option>
        </select>
        <button className="btn btn-ghost" style={{ display: "flex", alignItems: "center", gap: 6 }} onClick={() => { setSearch(""); setRoleFilter(""); setStatusFilter(""); setLinkedFilter(""); setPage(1); }}>
          <Filter size={14} /> {t("admin", "clearFilters")}
        </button>
      </div>

      {/* Table */}
      <div className="glass-card" style={{ overflow: "hidden", padding: 0 }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #e5e0d8", background: "#fafaf9" }}>
                {[t("admin", "name"), t("admin", "email"), t("admin", "roles"),
                  t("admin", "linkedProfiles"), t("admin", "status"),
                  t("admin", "joined"), t("admin", "lastActive"), ""].map((h, i) => (
                  <th key={i} style={{ padding: "12px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#9ca3af", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ padding: "40px", textAlign: "center", color: "#9ca3af" }}>{t("admin", "loading")}</td></tr>
              ) : accounts.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: "40px", textAlign: "center", color: "#9ca3af" }}>{t("admin", "noAccounts")}</td></tr>
              ) : accounts.map(acc => {
                const sc = statusColor(acc.status);
                return (
                  <tr key={acc.id} style={{ borderBottom: "1px solid #f3f4f6", cursor: "pointer" }} onClick={() => setSelectedId(acc.id)}>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#f3f4f6", overflow: "hidden", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {acc.imageUrl ? (
                            <img src={acc.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          ) : (
                            <span style={{ fontSize: 14, fontWeight: 700, color: "#9ca3af" }}>{(acc.name ?? acc.email)[0]?.toUpperCase()}</span>
                          )}
                        </div>
                        <span style={{ fontWeight: 600, color: "#1a1614" }}>{acc.name ?? "—"}</span>
                      </div>
                    </td>
                    <td style={{ padding: "12px 16px", color: "#6b7280" }}>{acc.email}</td>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {acc.roles.slice(0, 2).map(r => (
                          <span key={r.roleKey} className="sponsor-tier-chip" style={{ fontSize: 10 }}>{r.roleKey}</span>
                        ))}
                        {acc.roles.length > 2 && <span style={{ fontSize: 11, color: "#9ca3af" }}>+{acc.roles.length - 2}</span>}
                      </div>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      {acc._count.accountProfileLinks > 0 ? (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                          {acc.accountProfileLinks.slice(0, 2).map(l => (
                            <span key={l.id} style={{ fontSize: 11, color: "#6b7280" }}>{l.profile.displayName}</span>
                          ))}
                          {acc._count.accountProfileLinks > 2 && <span style={{ fontSize: 11, color: "#9ca3af" }}>+{acc._count.accountProfileLinks - 2}</span>}
                        </div>
                      ) : <span style={{ color: "#9ca3af", fontSize: 12 }}>—</span>}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 4, background: sc.bg, color: sc.color }}>{acc.status}</span>
                    </td>
                    <td style={{ padding: "12px 16px", color: "#9ca3af", fontSize: 12 }}>{fmt(acc.createdAt)}</td>
                    <td style={{ padding: "12px 16px", color: "#9ca3af", fontSize: 12 }}>{fmt(acc.lastLoginAt)}</td>
                    <td style={{ padding: "12px 16px" }}>
                      <button className="btn btn-ghost" style={{ fontSize: 12, padding: "4px 10px" }} onClick={e => { e.stopPropagation(); setSelectedId(acc.id); }}>
                        {t("admin", "viewBtn")}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {total > 50 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", borderTop: "1px solid #e5e0d8", fontSize: 13, color: "#7c7168" }}>
            <span>{total} {t("admin", "totalAccounts")}</span>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-ghost" style={{ fontSize: 12 }} disabled={page <= 1} onClick={() => setPage(p => p - 1)}>←</button>
              <span style={{ padding: "4px 8px" }}>{page}</span>
              <button className="btn btn-ghost" style={{ fontSize: 12 }} disabled={page * 50 >= total} onClick={() => setPage(p => p + 1)}>→</button>
            </div>
          </div>
        )}
      </div>

      {selectedId && (
        <AccountDrawer accountId={selectedId} onClose={() => setSelectedId(null)} onRefresh={fetchAccounts} />
      )}
    </div>
  );
}
