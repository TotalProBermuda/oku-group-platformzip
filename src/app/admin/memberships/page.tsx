"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslation, useLocale } from "@/components/i18n/LocaleProvider";

interface Membership {
  id: string;
  tier: string;
  status: string;
  startsAt: string;
  renewsAt: string | null;
  priceAnnualCents: number | null;
  user: { id: string; name: string | null; email: string };
}

interface Application {
  id: string;
  fullName: string;
  email: string;
  company: string | null;
  roleTitle: string | null;
  reasonForInterest: string;
  status: string;
  createdAt: string;
  user: { id: string; name: string | null; email: string } | null;
}

type Tab = "members" | "applications";
type PatchState = Record<string, "idle" | "loading" | "done" | "error">;

const TIER_STYLES: Record<string, { bg: string; color: string }> = {
  PATRON: { bg: "var(--color-primary-muted)", color: "var(--color-primary)" },
  FOUNDER: { bg: "#f5f0e8", color: "#7a6020" },
  EXPLORER: { bg: "var(--color-info-bg)", color: "var(--color-info)" },
  INSIDER: { bg: "var(--color-success-bg)", color: "var(--color-success)" },
};

const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  ACTIVE: { bg: "var(--color-success-bg)", color: "var(--color-success)" },
  EXPIRED: { bg: "var(--color-danger-bg)", color: "var(--color-danger)" },
  CANCELLED: { bg: "var(--color-border)", color: "var(--color-text-muted)" },
  PAUSED: { bg: "var(--color-warning-bg)", color: "var(--color-warning)" },
  PENDING_APPROVAL: { bg: "var(--color-warning-bg)", color: "var(--color-warning)" },
};

export default function AdminMembershipsPage() {
  const t = useTranslation();
  const locale = useLocale();
  const dateLocale = locale === "es" ? "es-PA" : locale === "pt" ? "pt-BR" : "en-US";

  function fmtDate(d: string | null | undefined) {
    if (!d) return "—";
    return new Date(d).toLocaleDateString(dateLocale, { month: "short", day: "numeric", year: "numeric" });
  }

  const [tab, setTab] = useState<Tab>("members");
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [loadingApps, setLoadingApps] = useState(true);
  const [patchState, setPatchState] = useState<PatchState>({});
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [expandedApp, setExpandedApp] = useState<string | null>(null);
  const [tierFilter, setTierFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  useEffect(() => {
    const params = new URLSearchParams();
    if (tierFilter) params.set("tier", tierFilter);
    if (statusFilter) params.set("status", statusFilter);
    setLoadingMembers(true);
    fetch(`/api/v1/admin/memberships?${params}`)
      .then((r) => r.json())
      .then((d) => setMemberships(d.memberships ?? []))
      .finally(() => setLoadingMembers(false));
  }, [tierFilter, statusFilter]);

  useEffect(() => {
    fetch("/api/v1/admin/founder-applications")
      .then((r) => r.json())
      .then((d) => setApplications(d.applications ?? []))
      .finally(() => setLoadingApps(false));
  }, []);

  async function updateMembership(id: string, data: any) {
    setPatchState((s) => ({ ...s, [id]: "loading" }));
    const res = await fetch(`/api/v1/admin/memberships/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      const updated = await res.json();
      setMemberships((ms) => ms.map((m) => m.id === id ? { ...m, ...updated.membership } : m));
      setPatchState((s) => ({ ...s, [id]: "done" }));
      setTimeout(() => setPatchState((s) => ({ ...s, [id]: "idle" })), 1500);
    } else {
      setPatchState((s) => ({ ...s, [id]: "error" }));
    }
  }

  async function updateApplication(id: string, status: string) {
    setPatchState((s) => ({ ...s, [id]: "loading" }));
    const res = await fetch(`/api/v1/admin/founder-applications/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, reviewNotes: reviewNotes[id] ?? "" }),
    });
    if (res.ok) {
      const updated = await res.json();
      setApplications((apps) => apps.map((a) => a.id === id ? { ...a, ...updated.application } : a));
      setPatchState((s) => ({ ...s, [id]: "done" }));
      setTimeout(() => setPatchState((s) => ({ ...s, [id]: "idle" })), 1500);
    } else {
      setPatchState((s) => ({ ...s, [id]: "error" }));
    }
  }

  const pendingApps = applications.filter((a) => ["SUBMITTED", "UNDER_REVIEW"].includes(a.status));

  return (
    <div className="page-container" style={{ padding: "32px 24px" }}>
      <div style={{ marginBottom: 28 }}>
        <Link href="/admin" style={{ fontSize: 13, color: "var(--color-text-muted)", textDecoration: "none" }}>← {t("admin", "adminPanel")}</Link>
        <h1 style={{ fontFamily: "Georgia, serif", fontSize: 28, fontWeight: 400, margin: "12px 0 4px" }}>{t("admin", "memberships")}</h1>
        <p style={{ color: "var(--color-text-secondary)", fontSize: 14, margin: 0 }}>{t("admin", "cardMembershipsDesc")}</p>
      </div>

      <div style={{ display: "flex", gap: 0, borderBottom: "2px solid var(--color-border)", marginBottom: 28 }}>
        {(["members", "applications"] as Tab[]).map((tabKey) => (
          <button key={tabKey} onClick={() => setTab(tabKey)} style={{
            background: "none", border: "none", cursor: "pointer",
            padding: "10px 20px", fontSize: 14, fontWeight: tab === tabKey ? 700 : 500,
            color: tab === tabKey ? "var(--color-primary)" : "var(--color-text-secondary)",
            borderBottom: tab === tabKey ? "2px solid var(--color-primary)" : "2px solid transparent",
            marginBottom: -2,
            position: "relative" as const,
          }}>
            {tabKey === "members" ? t("admin", "membersTab") : t("admin", "founderApplications")}
            {tabKey === "applications" && pendingApps.length > 0 && (
              <span style={{ marginLeft: 6, background: "var(--color-primary)", color: "#fff", borderRadius: "50%", width: 18, height: 18, fontSize: 11, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                {pendingApps.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "members" && (
        <>
          <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
            <select value={tierFilter} onChange={(e) => setTierFilter(e.target.value)}
              style={{ padding: "8px 12px", border: "1px solid var(--color-border)", borderRadius: 6, fontSize: 13, background: "var(--color-surface)" }}>
              <option value="">{t("admin", "allStatuses")}</option>
              <option value="PATRON">Patron</option>
              <option value="FOUNDER">Founder</option>
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
              style={{ padding: "8px 12px", border: "1px solid var(--color-border)", borderRadius: 6, fontSize: 13, background: "var(--color-surface)" }}>
              <option value="">{t("admin", "allStatuses")}</option>
              <option value="ACTIVE">{t("admin", "active")}</option>
              <option value="EXPIRED">{t("admin", "inactive")}</option>
              <option value="CANCELLED">{t("admin", "cancel")}</option>
              <option value="PAUSED">{t("admin", "pause")}</option>
            </select>
            <span style={{ fontSize: 13, color: "var(--color-text-muted)", alignSelf: "center" }}>{memberships.length}</span>
          </div>

          {loadingMembers ? (
            <div style={{ textAlign: "center", padding: "40px", color: "var(--color-text-muted)" }}>{t("admin", "loading")}</div>
          ) : memberships.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px", color: "var(--color-text-muted)" }}>{t("admin", "noMembershipsFound")}</div>
          ) : (
            <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 12, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                    {[t("admin","members"), t("admin","tier"), t("admin","status"), t("admin","since"), t("admin","renews"), t("admin","price"), t("admin","actions")].map((h) => (
                      <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "var(--color-text-secondary)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {memberships.map((m, idx) => {
                    const ts = TIER_STYLES[m.tier] ?? TIER_STYLES.PATRON;
                    const ss = STATUS_STYLES[m.status] ?? STATUS_STYLES.ACTIVE;
                    return (
                      <tr key={m.id} style={{ borderBottom: idx < memberships.length - 1 ? "1px solid var(--color-border-light)" : "none" }}>
                        <td style={{ padding: "14px 16px" }}>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{m.user.name ?? "—"}</div>
                          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{m.user.email}</div>
                        </td>
                        <td style={{ padding: "14px 16px" }}>
                          <span style={{ background: ts.bg, color: ts.color, fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 4, letterSpacing: "0.06em" }}>{m.tier}</span>
                        </td>
                        <td style={{ padding: "14px 16px" }}>
                          <span style={{ background: ss.bg, color: ss.color, fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 4, letterSpacing: "0.06em" }}>{m.status}</span>
                        </td>
                        <td style={{ padding: "14px 16px", fontSize: 13, color: "var(--color-text-secondary)" }}>{fmtDate(m.startsAt)}</td>
                        <td style={{ padding: "14px 16px", fontSize: 13, color: "var(--color-text-secondary)" }}>{fmtDate(m.renewsAt)}</td>
                        <td style={{ padding: "14px 16px", fontSize: 13 }}>{m.priceAnnualCents ? `$${(m.priceAnnualCents / 100).toLocaleString()}` : "—"}</td>
                        <td style={{ padding: "14px 16px" }}>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {m.status !== "ACTIVE" && (
                              <button onClick={() => updateMembership(m.id, { status: "ACTIVE" })} disabled={patchState[m.id] === "loading"}
                                style={{ fontSize: 12, padding: "5px 10px", border: "1px solid var(--color-success)", color: "var(--color-success)", background: "none", borderRadius: 5, cursor: "pointer" }}>
                                {t("admin", "activate")}
                              </button>
                            )}
                            {m.status === "ACTIVE" && (
                              <button onClick={() => updateMembership(m.id, { status: "PAUSED" })} disabled={patchState[m.id] === "loading"}
                                style={{ fontSize: 12, padding: "5px 10px", border: "1px solid var(--color-warning)", color: "var(--color-warning)", background: "none", borderRadius: 5, cursor: "pointer" }}>
                                {t("admin", "pause")}
                              </button>
                            )}
                            {m.tier !== "FOUNDER" && (
                              <button onClick={() => updateMembership(m.id, { tier: "FOUNDER", status: "ACTIVE" })} disabled={patchState[m.id] === "loading"}
                                style={{ fontSize: 12, padding: "5px 10px", border: "1px solid #7a6020", color: "#7a6020", background: "none", borderRadius: 5, cursor: "pointer" }}>
                                {t("admin", "upgradeToFounder")}
                              </button>
                            )}
                            {patchState[m.id] === "done" && <span style={{ fontSize: 12, color: "var(--color-success)" }}>✓</span>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === "applications" && (
        <>
          {loadingApps ? (
            <div style={{ textAlign: "center", padding: "40px", color: "var(--color-text-muted)" }}>{t("admin", "loading")}</div>
          ) : applications.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px", color: "var(--color-text-muted)" }}>{t("admin", "noApplicationsYet")}</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {applications.map((app) => {
                const ss = STATUS_STYLES[app.status] ?? STATUS_STYLES.ACTIVE;
                const isExpanded = expandedApp === app.id;
                return (
                  <div key={app.id} style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 12, overflow: "hidden" }}>
                    <div style={{ padding: "20px 24px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                          <span style={{ fontWeight: 700, fontSize: 15 }}>{app.fullName}</span>
                          <span style={{ background: ss.bg, color: ss.color, fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 4, letterSpacing: "0.06em" }}>{app.status.replace("_", " ")}</span>
                        </div>
                        <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>{app.email}{app.company ? ` · ${app.company}` : ""}{app.roleTitle ? ` · ${app.roleTitle}` : ""}</div>
                        <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 4 }}>{t("admin", "submittedOn")} {fmtDate(app.createdAt)}</div>
                      </div>
                      <button onClick={() => setExpandedApp(isExpanded ? null : app.id)}
                        style={{ background: "none", border: "1px solid var(--color-border)", borderRadius: 6, padding: "7px 14px", fontSize: 13, cursor: "pointer" }}>
                        {isExpanded ? t("admin", "cancel") : t("admin", "reviewApplication")}
                      </button>
                    </div>

                    {isExpanded && (
                      <div style={{ padding: "0 24px 24px", borderTop: "1px solid var(--color-border-light)" }}>
                        <div style={{ marginTop: 20, marginBottom: 16 }}>
                          <p style={{ fontSize: 12, fontWeight: 700, color: "var(--color-text-secondary)", letterSpacing: "0.08em", marginBottom: 8 }}>{t("admin", "applicationReason").toUpperCase()}</p>
                          <p style={{ fontSize: 14, color: "var(--color-text)", lineHeight: 1.7, background: "var(--color-bg)", padding: "14px 16px", borderRadius: 8, margin: 0 }}>{app.reasonForInterest}</p>
                        </div>
                        <div style={{ marginBottom: 16 }}>
                          <p style={{ fontSize: 12, fontWeight: 700, color: "var(--color-text-secondary)", letterSpacing: "0.08em", marginBottom: 8 }}>{t("admin", "reviewNotes").toUpperCase()}</p>
                          <textarea value={reviewNotes[app.id] ?? ""} onChange={(e) => setReviewNotes((n) => ({ ...n, [app.id]: e.target.value }))} rows={3}
                            placeholder={t("admin", "reviewNotesPlaceholder")}
                            style={{ width: "100%", padding: "10px 12px", border: "1px solid var(--color-border)", borderRadius: 6, fontSize: 13, resize: "vertical", fontFamily: "inherit", background: "var(--color-bg)", boxSizing: "border-box" as const }} />
                        </div>
                        {["SUBMITTED", "UNDER_REVIEW"].includes(app.status) && (
                          <div style={{ display: "flex", gap: 10 }}>
                            <button onClick={() => updateApplication(app.id, "UNDER_REVIEW")} disabled={patchState[app.id] === "loading"}
                              style={{ padding: "9px 16px", border: "1px solid var(--color-border)", borderRadius: 6, fontSize: 13, cursor: "pointer", background: "none" }}>
                              {t("admin", "markUnderReview")}
                            </button>
                            <button onClick={() => updateApplication(app.id, "APPROVED")} disabled={patchState[app.id] === "loading"}
                              style={{ padding: "9px 16px", background: "#1a1614", color: "#e8d5a3", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                              {t("admin", "approveGrantFounder")}
                            </button>
                            <button onClick={() => updateApplication(app.id, "DECLINED")} disabled={patchState[app.id] === "loading"}
                              style={{ padding: "9px 16px", border: "1px solid var(--color-danger)", color: "var(--color-danger)", background: "none", borderRadius: 6, fontSize: 13, cursor: "pointer" }}>
                              {t("admin", "decline")}
                            </button>
                            {patchState[app.id] === "done" && <span style={{ fontSize: 13, color: "var(--color-success)", alignSelf: "center" }}>✓ {t("admin", "updated")}</span>}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
