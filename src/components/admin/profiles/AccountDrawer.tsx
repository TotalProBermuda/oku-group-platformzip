"use client";

import { useEffect, useState } from "react";
import { X, ShieldCheck, Link2, Activity, Clock } from "lucide-react";
import { useTranslation, useLocale } from "@/components/i18n/LocaleProvider";

type Tab = "overview" | "roles" | "profiles" | "activity";

interface AccountDrawerProps {
  accountId: string;
  onClose: () => void;
  onRefresh?: () => void;
}

export default function AccountDrawer({ accountId, onClose, onRefresh }: AccountDrawerProps) {
  const t = useTranslation();
  const locale = useLocale();
  const dateLocale = locale === "es" ? "es-PA" : locale === "pt" ? "pt-BR" : "en-US";
  const [account, setAccount] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("overview");
  const [actioning, setActioning] = useState(false);

  const fetchAccount = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/admin/accounts/${accountId}`);
      const data = await res.json();
      setAccount(data.account);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAccount(); }, [accountId]);

  const handleSuspend = async () => {
    if (!confirm(t("admin", "areYouSure"))) return;
    setActioning(true);
    await fetch(`/api/v1/admin/accounts/${accountId}/suspend`, { method: "POST" });
    setActioning(false);
    fetchAccount();
    onRefresh?.();
  };

  const handleActivate = async () => {
    setActioning(true);
    await fetch(`/api/v1/admin/accounts/${accountId}/activate`, { method: "POST" });
    setActioning(false);
    fetchAccount();
    onRefresh?.();
  };

  const handleUnlinkProfile = async (linkId: string) => {
    if (!confirm(t("admin", "areYouSure"))) return;
    await fetch(`/api/v1/admin/accounts/${accountId}/profiles`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ linkId }),
    });
    fetchAccount();
  };

  const fmt = (d?: string | null) => d ? new Date(d).toLocaleString(dateLocale) : "—";

  const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "overview",  label: t("admin", "overview"),     icon: <ShieldCheck size={14} /> },
    { key: "roles",     label: t("admin", "rolesAccess"),  icon: <ShieldCheck size={14} /> },
    { key: "profiles",  label: t("admin", "linkedProfiles"), icon: <Link2 size={14} /> },
    { key: "activity",  label: t("admin", "activity"),     icon: <Activity size={14} /> },
  ];

  const statusColors: Record<string, { bg: string; color: string }> = {
    ACTIVE: { bg: "#dcfce7", color: "#16a34a" },
    SUSPENDED: { bg: "#fee2e2", color: "#dc2626" },
    PENDING: { bg: "#fef9c3", color: "#a16207" },
    LOCKED: { bg: "#fee2e2", color: "#dc2626" },
    ARCHIVED: { bg: "#f3f4f6", color: "#6b7280" },
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9000, display: "flex" }}>
      <div style={{ flex: 1, background: "rgba(0,0,0,0.4)" }} onClick={onClose} />
      <div style={{ width: 560, maxWidth: "100vw", background: "white", boxShadow: "-4px 0 32px rgba(0,0,0,0.12)", display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div style={{ padding: "24px 28px 0", borderBottom: "1px solid #e5e0d8", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ width: 52, height: 52, borderRadius: "50%", background: "#f3f4f6", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {account?.imageUrl ? (
                  <img src={account.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <span style={{ fontSize: 22, fontWeight: 700, color: "#9ca3af" }}>{(account?.name ?? account?.email)?.[0]?.toUpperCase() ?? "?"}</span>
                )}
              </div>
              <div>
                <div style={{ fontFamily: "var(--font-heading)", fontSize: 20, fontWeight: 700, color: "#1a1614" }}>
                  {loading ? "..." : account?.name ?? account?.email ?? "Account"}
                </div>
                {account && (
                  <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 4, ...statusColors[account.status] }}>
                    {account.status}
                  </span>
                )}
              </div>
            </div>
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", padding: 4 }}>
              <X size={20} />
            </button>
          </div>

          <div style={{ display: "flex", gap: 0, overflowX: "auto" }}>
            {TABS.map(tab_ => (
              <button
                key={tab_.key}
                onClick={() => setTab(tab_.key)}
                style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "10px 16px",
                  background: "none", border: "none", borderBottom: tab === tab_.key ? "2px solid #c41e3a" : "2px solid transparent",
                  color: tab === tab_.key ? "#c41e3a" : "#6b7280", fontSize: 13, fontWeight: tab === tab_.key ? 600 : 400,
                  cursor: "pointer", whiteSpace: "nowrap",
                }}
              >
                {tab_.icon} {tab_.label}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, padding: "24px 28px", overflowY: "auto" }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: "60px 0", color: "#9ca3af" }}>{t("admin", "loading")}</div>
          ) : !account ? (
            <div style={{ textAlign: "center", padding: "60px 0", color: "#dc2626" }}>{t("admin", "not_found")}</div>
          ) : (
            <>
              {tab === "overview" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                  <div className="dash-eyebrow" style={{ marginBottom: 16 }}>{t("admin", "accountDetails")}</div>
                  {[
                    { label: t("admin", "email"), value: account.email },
                    { label: t("admin", "status"), value: <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 4, ...statusColors[account.status] }}>{account.status}</span> },
                    { label: t("admin", "joined"), value: fmt(account.createdAt) },
                    { label: t("admin", "lastActive"), value: fmt(account.lastLoginAt) },
                    { label: t("admin", "linkedProfiles"), value: account._count?.accountProfileLinks ?? 0 },
                    { label: t("admin", "orders"), value: account._count?.orders ?? 0 },
                  ].map(row => (
                    <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #f3f4f6" }}>
                      <span style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "#9ca3af" }}>{row.label}</span>
                      <span style={{ fontSize: 14, color: "#1a1614" }}>{row.value}</span>
                    </div>
                  ))}
                  {account.internalNotes && (
                    <div style={{ marginTop: 20, padding: 16, background: "#fffbeb", borderRadius: 8, border: "1px solid #fde68a" }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#a16207", marginBottom: 4 }}>{t("admin", "internalNotes")}</div>
                      <p style={{ fontSize: 14, color: "#4b5563", margin: 0 }}>{account.internalNotes}</p>
                    </div>
                  )}
                </div>
              )}

              {tab === "roles" && (
                <div>
                  <div className="dash-eyebrow" style={{ marginBottom: 16 }}>{t("admin", "assignedRoles")}</div>
                  {account.roles?.length === 0 ? (
                    <div style={{ color: "#9ca3af", fontSize: 14 }}>{t("admin", "noRoles")}</div>
                  ) : (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {account.roles.map((r: { roleKey: string }) => (
                        <span key={r.roleKey} className="sponsor-tier-chip" style={{ fontSize: 13, padding: "6px 12px" }}>{r.roleKey}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {tab === "profiles" && (
                <div>
                  <div className="dash-eyebrow" style={{ marginBottom: 16 }}>{t("admin", "linkedProfiles")} ({account.accountProfileLinks?.length ?? 0})</div>
                  {!account.accountProfileLinks?.length ? (
                    <div style={{ color: "#9ca3af", fontSize: 14, textAlign: "center", padding: "32px 0" }}>{t("admin", "noLinkedProfiles")}</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {account.accountProfileLinks.map((link: any) => (
                        <div key={link.id} className="data-row" style={{ padding: "12px 16px" }}>
                          <div style={{ width: 36, height: 36, borderRadius: link.profile?.profileType === "COMPANY" ? 8 : "50%", background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            {link.profile?.avatarUrl || link.profile?.logoUrl ? (
                              <img src={link.profile.avatarUrl ?? link.profile.logoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit" }} />
                            ) : (
                              <span style={{ fontSize: 13, fontWeight: 700, color: "#9ca3af" }}>{link.profile?.displayName?.[0]}</span>
                            )}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, fontSize: 14 }}>{link.profile?.displayName}</div>
                            <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                              <span className="sponsor-tier-chip" style={{ fontSize: 10 }}>{link.profile?.profileType}</span>
                              {link.profile?.primaryCategory && <span className="sponsor-tier-chip" style={{ fontSize: 10 }}>{link.profile.primaryCategory}</span>}
                              <span className="sponsor-tier-chip" style={{ fontSize: 10, background: "#ede9fe", color: "#7c3aed" }}>{link.relationshipType}</span>
                              {link.isPrimary && <span className="sponsor-tier-chip" style={{ fontSize: 10, background: "#dcfce7", color: "#16a34a" }}>Primary</span>}
                            </div>
                          </div>
                          <button onClick={() => handleUnlinkProfile(link.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#dc2626", fontSize: 12, padding: "4px 8px" }}>
                            {t("admin", "unlink")}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {tab === "activity" && (
                <div>
                  <div className="dash-eyebrow" style={{ marginBottom: 16 }}>{t("admin", "recentActivity")}</div>
                  {!account.auditLogs?.length ? (
                    <div style={{ color: "#9ca3af", fontSize: 14 }}>{t("admin", "noActivity")}</div>
                  ) : account.auditLogs.slice(0, 20).map((log: any) => (
                    <div key={log.id} style={{ padding: "10px 0", borderBottom: "1px solid #f3f4f6", display: "flex", gap: 10, alignItems: "flex-start" }}>
                      <Clock size={14} color="#9ca3af" style={{ marginTop: 2, flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1614" }}>{log.action}</div>
                        {log.performedBy && (
                          <div style={{ fontSize: 11, color: "#9ca3af" }}>by {log.performedBy.name ?? log.performedBy.email}</div>
                        )}
                        <div style={{ fontSize: 11, color: "#9ca3af" }}>{fmt(log.createdAt)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {account && (
          <div style={{ padding: "16px 28px", borderTop: "1px solid #e5e0d8", display: "flex", gap: 8, justifyContent: "flex-end", flexShrink: 0 }}>
            {account.status === "ACTIVE" ? (
              <button className="btn btn-ghost" style={{ color: "#dc2626" }} onClick={handleSuspend} disabled={actioning}>
                {t("admin", "suspend")}
              </button>
            ) : (
              <button className="btn btn-primary" onClick={handleActivate} disabled={actioning}>
                {t("admin", "activate")}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
