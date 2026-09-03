"use client";
import { useState, useEffect } from "react";
import CompensationPlanPicker from "@/components/admin/CompensationPlanPicker";
import { useCurrentUserRoles } from "@/hooks/useCurrentUserRoles";

const ALL_ROLES = [
  "VISITOR","ATTENDEE","INFLUENCER","PARTNER","INVESTOR","REFERRER",
  "STAFF_OKU","STAFF_CATCH",
  "FB_DIRECTOR","RESTAURANT_SUPERVISOR","ADMIN_IR","ADMIN_HR","SUPERADMIN",
];

const ROLE_LABELS: Record<string, string> = {
  VISITOR:               "Visitor",
  ATTENDEE:              "Attendee",
  INFLUENCER:            "Influencer",
  PARTNER:               "Partner",
  INVESTOR:              "Investor",
  REFERRER:              "Referrer",
  STAFF_OKU:             "OKÜ Staff",
  STAFF_CATCH:           "Catch Staff",
  RESTAURANT_HOST:       "Restaurant Host",
  STREETSIDE_HOST:       "Streetside Host",
  FB_DIRECTOR:           "F&B Director",
  RESTAURANT_SUPERVISOR: "Restaurant Supervisor",
  ADMIN_IR:              "Admin · IR",
  ADMIN_HR:              "Admin · HR",
  SUPERADMIN:            "Superadmin",
  // Legacy role retained as an F&B Director alias until seeded/live users migrate.
  ADMIN_COMMERCIAL:      "F&B Director",
};

const ROLE_TINTS: Record<string, { bg: string; fg: string }> = {
  REFERRER:              { bg: "#c9a96e22", fg: "#92764a" },
  INFLUENCER:            { bg: "#c41e3a14", fg: "#a01830" },
  PARTNER:               { bg: "#1e40af14", fg: "#1e3a8a" },
  INVESTOR:              { bg: "#7c3aed14", fg: "#5b21b6" },
  STAFF_OKU:             { bg: "#0f766e14", fg: "#115e59" },
  STAFF_CATCH:           { bg: "#0369a114", fg: "#075985" },
  FB_DIRECTOR:           { bg: "#7c3aed14", fg: "#5b21b6" },
  RESTAURANT_SUPERVISOR: { bg: "#c8a96e22", fg: "#92764a" },
  ADMIN_COMMERCIAL:      { bg: "#b4530914", fg: "#9a3412" },
  ADMIN_IR:              { bg: "#4f46e514", fg: "#4338ca" },
  ADMIN_HR:              { bg: "#db277714", fg: "#be185d" },
  SUPERADMIN:            { bg: "#dc262614", fg: "#b91c1c" },
};

const REFERRER_TYPE_LABELS: Record<string, string> = {
  STREETSIDE_HOST:  "Streetside Host",
  TAXI_DRIVER:      "Taxi Driver",
  TOUR_GUIDE:       "Tour Guide",
  HOTEL_CONCIERGE:  "Hotel Concierge",
  PARTNER:          "Partner",
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

const STATUS_COLORS: Record<string, string> = {
  ACTIVE:                  "#16a34a",
  SUSPENDED:               "#d97706",
  LOCKED:                  "#dc2626",
  ARCHIVED:                "#6b7280",
  BANNED:                  "#7f1d1d",
  PENDING:                 "#2563eb",
  PASSWORD_RESET_REQUIRED: "#c2410c",
};

const STATUS_OPTIONS = [
  { value: "ACTIVE",                  label: "Activate" },
  { value: "SUSPENDED",               label: "Suspend" },
  { value: "LOCKED",                  label: "Lock Account" },
  { value: "ARCHIVED",                label: "Archive" },
  { value: "BANNED",                  label: "Ban" },
  { value: "PASSWORD_RESET_REQUIRED", label: "Force Password Reset" },
];

type Tab = "overview" | "roles" | "personas" | "compensation" | "security" | "audit" | "notes";
const TABS: { key: Tab; label: string }[] = [
  { key: "overview",      label: "Overview" },
  { key: "roles",         label: "Roles" },
  { key: "personas",      label: "Personas" },
  { key: "compensation",  label: "Compensation" },
  { key: "security",      label: "Security" },
  { key: "audit",         label: "Audit" },
  { key: "notes",         label: "Notes" },
];

export default function UserDrawer({
  userId,
  onClose,
  onUserUpdated,
}: {
  userId: string;
  onClose: () => void;
  onUserUpdated: () => void;
}) {
  const [user, setUser]               = useState<any>(null);
  const [audit, setAudit]             = useState<any[]>([]);
  const [compensation, setCompensation] = useState<any>(null);
  const [tab, setTab]                 = useState<Tab>("overview");
  const [loading, setLoading]         = useState(true);
  const [compLoading, setCompLoading] = useState(false);
  const [saving, setSaving]           = useState(false);
  const [msg, setMsg]                 = useState<{ text: string; error?: boolean } | null>(null);

  const [editName, setEditName]   = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [notes, setNotes]         = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [statusReason, setStatusReason] = useState("");
  const [addRole, setAddRole]               = useState("");
  const [linkReferrerId, setLinkReferrerId] = useState("");
  const { canEditUsers } = useCurrentUserRoles();
  const [availableReferrers, setAvailableReferrers] = useState<any[]>([]);
  const [refLoading, setRefLoading] = useState(false);

  const flash = (text: string, error = false) => {
    setMsg({ text, error });
    setTimeout(() => setMsg(null), 3500);
  };

  const fetchUser = async () => {
    setLoading(true);
    const r = await fetch(`/api/v1/admin/users/${userId}`);
    const d = await r.json();
    if (d.ok) {
      setUser(d.data);
      setEditName(d.data.name  ?? "");
      setEditEmail(d.data.email ?? "");
      setEditPhone(d.data.phone ?? "");
      setNotes(d.data.internalNotes ?? "");
      setTagsInput((d.data.tags ?? []).join(", "));
    }
    setLoading(false);
  };

  const fetchAudit = async () => {
    const r = await fetch(`/api/v1/admin/users/${userId}/audit`);
    const d = await r.json();
    if (d.ok) setAudit(d.data);
  };

  const fetchCompensation = async () => {
    setCompLoading(true);
    const r = await fetch(`/api/v1/admin/users/${userId}/compensation`);
    const d = await r.json();
    if (d.ok) setCompensation(d.data);
    setCompLoading(false);
  };

  const fetchReferrers = async () => {
    setRefLoading(true);
    // Picker should only surface Referrer profiles that are not yet linked
    // to a platform user, so Superadmin can attach one cleanly.
    const r = await fetch("/api/v1/admin/referrers?unlinkedOnly=true");
    const d = await r.json();
    if (d.ok) setAvailableReferrers(d.data);
    setRefLoading(false);
  };

  useEffect(() => { fetchUser(); fetchAudit(); }, [userId]);

  useEffect(() => {
    if (tab === "compensation" || tab === "personas") fetchCompensation();
    if (tab === "personas") fetchReferrers();
  }, [tab]);

  const api = async (url: string, method = "POST", body?: unknown) => {
    setSaving(true);
    const r = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const d = await r.json();
    setSaving(false);
    return d;
  };

  const saveProfile = async () => {
    const d = await api(`/api/v1/admin/users/${userId}`, "PATCH", { name: editName, email: editEmail, phone: editPhone });
    if (d.ok) { flash("Profile saved"); fetchUser(); onUserUpdated(); }
    else flash(d.error, true);
  };

  const saveNotes = async () => {
    const tags = tagsInput.split(",").map((t: string) => t.trim()).filter(Boolean);
    const d = await api(`/api/v1/admin/users/${userId}`, "PATCH", { internalNotes: notes, tags });
    if (d.ok) { flash("Notes saved"); fetchUser(); }
    else flash(d.error, true);
  };

  const changeStatus = async (status: string) => {
    const d = await api(`/api/v1/admin/users/${userId}/status`, "POST", { status, reason: statusReason });
    if (d.ok) { flash(`Status set to ${status}`); setStatusReason(""); fetchUser(); fetchAudit(); onUserUpdated(); }
    else flash(d.error, true);
  };

  const assignRole = async () => {
    if (!addRole) return;
    const d = await api(`/api/v1/admin/users/${userId}/roles`, "POST", { roleKey: addRole });
    if (d.ok) { flash(`Role ${addRole} assigned`); setAddRole(""); fetchUser(); fetchAudit(); onUserUpdated(); }
    else flash(d.error, true);
  };

  const removeRole = async (roleKey: string) => {
    const d = await api(`/api/v1/admin/users/${userId}/roles/${roleKey}`, "DELETE");
    if (d.ok) { flash(`Role ${roleKey} removed`); fetchUser(); fetchAudit(); onUserUpdated(); }
    else flash(d.error, true);
  };

  const forceLogout = async () => {
    const d = await api(`/api/v1/admin/users/${userId}/force-logout`);
    if (d.ok) { flash(d.message); fetchAudit(); }
    else flash(d.error, true);
  };

  const linkPersona = async () => {
    const d = await api(`/api/v1/admin/users/${userId}/compensation`, "POST", { referrerId: linkReferrerId || null });
    if (d.ok) { flash(d.message); setLinkReferrerId(""); fetchUser(); fetchCompensation(); fetchAudit(); }
    else flash(d.error, true);
  };

  const unlinkPersona = async () => {
    const d = await api(`/api/v1/admin/users/${userId}/compensation`, "POST", { referrerId: null });
    if (d.ok) { flash(d.message); fetchUser(); fetchCompensation(); fetchAudit(); }
    else flash(d.error, true);
  };

  const fmt = (d: string) => new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const fmtMoney = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 999 }} />
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0, width: 600,
        background: "#fff", boxShadow: "-4px 0 32px rgba(0,0,0,0.12)",
        zIndex: 1000, display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        <div style={{ padding: "20px 24px 0", borderBottom: "1px solid var(--color-border)", flexShrink: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
            <div>
              {loading ? <div style={{ fontSize: 20, color: "#ccc" }}>Loading…</div> : (
                <>
                  <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 22, fontWeight: 400, margin: "0 0 2px" }}>
                    {user?.name || "—"}
                  </h2>
                  <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>{user?.email}</div>
                  <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                    {user && (
                      <span style={{
                        padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                        background: (STATUS_COLORS[user.status] || "#6b7280") + "22",
                        color: STATUS_COLORS[user.status] || "#6b7280",
                        textTransform: "uppercase", letterSpacing: "0.06em",
                      }}>
                        {user.status}
                      </span>
                    )}
                    {user?.referrer && (
                      <span style={{ padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: "#c9a96e22", color: "#92764a", letterSpacing: "0.06em" }}>
                        {REFERRER_TYPE_LABELS[user.referrer.referrerType] || user.referrer.referrerType}
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#9ca3af", padding: 4 }}>✕</button>
          </div>

          <div style={{ display: "flex", gap: 0, overflowX: "auto", paddingBottom: 0 }}>
            {TABS.map(({ key, label }) => (
              <button key={key} onClick={() => setTab(key)} style={{
                padding: "8px 12px", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em",
                textTransform: "uppercase", cursor: "pointer", whiteSpace: "nowrap",
                background: "none", border: "none",
                borderBottom: tab === key ? "2px solid var(--color-primary)" : "2px solid transparent",
                color: tab === key ? "var(--color-primary)" : "var(--color-text-muted)",
              }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {msg && (
          <div style={{
            background: msg.error ? "#fef2f2" : "#f0fdf4",
            borderBottom: `1px solid ${msg.error ? "#fecaca" : "#bbf7d0"}`,
            padding: "8px 24px", fontSize: 13,
            color: msg.error ? "#dc2626" : "#16a34a", flexShrink: 0,
          }}>
            {msg.text}
          </div>
        )}

        <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
          {loading ? <p style={{ color: "#9ca3af" }}>Loading…</p> : !user ? <p style={{ color: "#dc2626" }}>User not found.</p> : (
            <>
              {tab === "overview" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <FieldLabel>Full Name</FieldLabel>
                      <input className="form-input" value={editName} onChange={(e) => setEditName(e.target.value)} />
                    </label>
                    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <FieldLabel>Phone</FieldLabel>
                      <input className="form-input" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} placeholder="+1 555 0000" />
                    </label>
                    <label style={{ display: "flex", flexDirection: "column", gap: 4, gridColumn: "1/-1" }}>
                      <FieldLabel>Email</FieldLabel>
                      <input className="form-input" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
                    </label>
                  </div>
                  <button className="btn btn-primary" style={{ alignSelf: "flex-start" }} onClick={saveProfile} disabled={saving}>
                    {saving ? "Saving…" : "Save Profile"}
                  </button>
                  <hr style={{ borderColor: "var(--color-border)" }} />
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                    <Stat label="Joined"     value={user.createdAt ? fmtDate(user.createdAt) : "—"} />
                    <Stat label="Last Login" value={user.lastLoginAt ? fmtDate(user.lastLoginAt) : "Never"} />
                    <Stat label="Status"     value={user.status} />
                    <Stat label="Roles"      value={user.roles?.map((r: any) => ROLE_LABELS[r.roleKey] ?? r.roleKey).join(", ") || "None"} />
                    <Stat label="Persona"    value={user.referrer ? (REFERRER_TYPE_LABELS[user.referrer.referrerType] || user.referrer.referrerType) : "None"} />
                    <Stat label="Plan"       value={user.referrer?.compensationPlan ? COMP_MODEL_LABELS[user.referrer.compensationPlan.modelType] || user.referrer.compensationPlan.modelType : "—"} />
                    {user.suspendedAt && <Stat label="Suspended"  value={fmtDate(user.suspendedAt)} />}
                    {user.suspensionReason && <Stat label="Reason" value={user.suspensionReason} />}
                    {user.lockedAt && <Stat label="Locked"      value={fmtDate(user.lockedAt)} />}
                  </div>
                </div>
              )}

              {tab === "roles" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                  <div>
                    <SectionTitle>Access Roles</SectionTitle>
                    <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 12 }}>
                      These control which areas of the platform this user can access.
                    </p>
                    {user.roles?.length === 0 && <p style={{ color: "#9ca3af", fontSize: 14 }}>No roles assigned.</p>}
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {user.roles?.map((r: any) => {
                        const tint = ROLE_TINTS[r.roleKey] ?? { bg: "#e5e7eb", fg: "#374151" };
                        const label = ROLE_LABELS[r.roleKey] ?? r.roleKey;
                        return (
                          <div key={r.roleKey} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "#f8f5f3", borderRadius: 8, border: "1px solid var(--color-border)" }}>
                            <span title={r.roleKey} style={{ fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: tint.bg, color: tint.fg, letterSpacing: "0.02em" }}>{label}</span>
                            <button onClick={() => removeRole(r.roleKey)} disabled={saving} style={{ background: "none", border: "1px solid #fca5a5", color: "#dc2626", borderRadius: 6, padding: "4px 10px", fontSize: 11, cursor: "pointer", fontWeight: 700 }}>
                              Remove
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <hr style={{ borderColor: "var(--color-border)" }} />
                  <div>
                    <SectionTitle>Assign Role</SectionTitle>
                    <div style={{ display: "flex", gap: 8 }}>
                      <select className="form-input" value={addRole} onChange={(e) => setAddRole(e.target.value)} style={{ flex: 1 }}>
                        <option value="">Select role…</option>
                        {ALL_ROLES.filter((rk) => !user.roles?.find((r: any) => r.roleKey === rk)).map((rk) => (
                          <option key={rk} value={rk}>{ROLE_LABELS[rk] ?? rk}</option>
                        ))}
                      </select>
                      <button className="btn btn-primary" onClick={assignRole} disabled={!addRole || saving}>Assign</button>
                    </div>
                    <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 8 }}>
                      Assigning INFLUENCER, REFERRER, PARTNER, STAFF_OKU etc. changes what portal and features this user can access.
                      Use the Personas tab to also assign a commercial earning profile.
                    </p>
                    <p style={{ fontSize: 12, marginTop: 6, padding: "8px 12px", background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.25)", borderRadius: 6, color: "#b45309" }}>
                      ⚠ Role changes take effect after the user&apos;s next sign-in.
                    </p>
                  </div>
                </div>
              )}

              {tab === "personas" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                  <div>
                    <SectionTitle>Commercial Persona</SectionTitle>
                    <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 16 }}>
                      A commercial persona defines how this user participates in revenue generation — as a Streetside Host, Concierge, Taxi Driver, etc.
                      This is separate from their access role and determines which compensation plan applies.
                    </p>

                    {user.referrer ? (
                      <div style={{ background: "#f8f5f3", border: "1px solid var(--color-border)", borderRadius: 12, padding: 20 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: 4 }}>Commercial Persona</div>
                            <div style={{ fontFamily: "var(--font-heading)", fontSize: 20, fontWeight: 400 }}>{user.referrer.fullName}</div>
                            <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <span className="badge badge-info">{REFERRER_TYPE_LABELS[user.referrer.referrerType] || user.referrer.referrerType}</span>
                              <span style={{ padding: "2px 10px", fontSize: 11, background: user.referrer.isActive ? "#f0fdf4" : "#f9fafb", color: user.referrer.isActive ? "#16a34a" : "#6b7280", borderRadius: 20, fontWeight: 700 }}>
                                {user.referrer.isActive ? "ACTIVE" : "INACTIVE"}
                              </span>
                            </div>
                            <div style={{ marginTop: 8, fontSize: 13, color: "var(--color-text-muted)" }}>
                              Code: <code style={{ background: "#ede8e1", padding: "1px 6px", borderRadius: 4 }}>{user.referrer.referralCode}</code>
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 8 }}>
                            <a
                              href={`/admin/compensation?referrerId=${user.referrer.id}`}
                              target="_blank"
                              rel="noreferrer"
                              style={{ fontSize: 11, color: "#1a1614", background: "none", border: "1px solid var(--color-border)", borderRadius: 6, padding: "4px 10px", textDecoration: "none", fontWeight: 700, whiteSpace: "nowrap" }}
                              title={`Open referrer ${user.referrer.referralCode} in the Compensation admin`}
                            >
                              Open Referrer ↗
                            </a>
                            <button onClick={unlinkPersona} disabled={saving} style={{ fontSize: 11, color: "#dc2626", background: "none", border: "1px solid #fca5a5", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontWeight: 700 }}>
                              Unlink
                            </button>
                          </div>
                        </div>

                        <div style={{ marginTop: 16, padding: "12px 16px", background: "#fff", borderRadius: 8, border: "1px solid var(--color-border)" }}>
                          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: 8 }}>Compensation Plan</div>
                          {user.referrer.compensationPlan ? (
                            <div style={{ marginBottom: 12 }}>
                              <div style={{ fontWeight: 600 }}>{user.referrer.compensationPlan.name}</div>
                              <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 4 }}>
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
                            <div style={{ fontSize: 13, color: "#9ca3af", marginBottom: 12 }}>No plan assigned</div>
                          )}
                          <CompensationPlanPicker
                            userId={userId}
                            currentPlanId={user.referrer.compensationPlan?.id ?? null}
                            currentPlanName={user.referrer.compensationPlan?.name ?? null}
                            plans={compensation?.plans ?? undefined}
                            readOnly={!canEditUsers}
                            onSaved={() => { fetchUser(); fetchCompensation(); fetchAudit(); }}
                          />
                          {!canEditUsers && (
                            <div style={{ fontSize: 11, color: "#9ca3af", marginTop: -8, fontStyle: "italic" }}>
                              Read-only — your role cannot change compensation plans.
                            </div>
                          )}
                        </div>

                        {compLoading ? <p style={{ fontSize: 13, color: "#9ca3af", marginTop: 12 }}>Loading performance data…</p> : compensation?.commissionTotals && (
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
                      <div style={{ padding: "24px", background: "#f8f5f3", borderRadius: 12, border: "1px dashed var(--color-border)" }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>No Commercial Persona Linked</div>
                        <div style={{ fontSize: 13, color: "var(--color-text-muted)", marginBottom: 16, lineHeight: 1.6 }}>
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
                            {availableReferrers.map((r: any) => (
                              <option key={r.id} value={r.id}>
                                {r.user?.name || r.user?.email || "Unnamed"} — {r.referrerType?.replace(/_/g, " ")} ({r.referralCode})
                              </option>
                            ))}
                          </select>
                          <button className="btn btn-primary" onClick={linkPersona} disabled={!linkReferrerId || saving} style={{ whiteSpace: "nowrap" }}>Link Profile</button>
                        </div>
                      </div>
                    )}
                  </div>

                  {compensation?.influencerProfile && (
                    <div>
                      <SectionTitle>Influencer Profile</SectionTitle>
                      <div style={{ background: "#f8f5f3", border: "1px solid var(--color-border)", borderRadius: 12, padding: 20 }}>
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
              )}

              {tab === "compensation" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                  <SectionTitle>Commission History</SectionTitle>
                  {compLoading ? <p style={{ color: "#9ca3af" }}>Loading…</p> : !compensation ? (
                    <p style={{ color: "#9ca3af", fontSize: 14 }}>No compensation data found.</p>
                  ) : (
                    <>
                      {compensation.referrer?.commissions?.length > 0 ? (
                        <>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 8 }}>
                            <Stat label="Pending" value={fmtMoney(compensation.commissionTotals?.pending ?? 0)} />
                            <Stat label="Approved" value={fmtMoney(compensation.commissionTotals?.approved ?? 0)} />
                            <Stat label="Paid Out" value={fmtMoney(compensation.commissionTotals?.paid ?? 0)} />
                          </div>
                          <div className="table-wrap">
                            <table>
                              <thead>
                                <tr>
                                  <th>Date</th>
                                  <th>Covers</th>
                                  <th>Amount</th>
                                  <th>Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                {compensation.referrer.commissions.map((c: any) => (
                                  <tr key={c.id}>
                                    <td style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{fmtDate(c.createdAt)}</td>
                                    <td>{c.covers ?? "—"}</td>
                                    <td style={{ fontWeight: 600 }}>{fmtMoney(c.amountCents)}</td>
                                    <td>
                                      <span className={`badge badge-${c.status === "PAID" ? "success" : c.status === "APPROVED" ? "info" : c.status === "REJECTED" ? "danger" : "neutral"}`} style={{ fontSize: 10 }}>
                                        {c.status}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </>
                      ) : (
                        <p style={{ fontSize: 14, color: "#9ca3af" }}>No referrer commissions recorded.</p>
                      )}

                      {compensation.influencerProfile?.ledger?.length > 0 && (
                        <>
                          <SectionTitle>Influencer Ledger</SectionTitle>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 8 }}>
                            <Stat label="Total Earned" value={fmtMoney(compensation.ledgerTotals?.earned ?? 0)} />
                            <Stat label="Paid Out" value={fmtMoney(compensation.ledgerTotals?.paid ?? 0)} />
                          </div>
                          <div className="table-wrap">
                            <table>
                              <thead>
                                <tr><th>Date</th><th>Type</th><th>Amount</th></tr>
                              </thead>
                              <tbody>
                                {compensation.influencerProfile.ledger.map((l: any) => (
                                  <tr key={l.id}>
                                    <td style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{fmtDate(l.createdAt)}</td>
                                    <td><span className="badge badge-neutral" style={{ fontSize: 10 }}>{l.type}</span></td>
                                    <td style={{ fontWeight: 600 }}>{fmtMoney(l.amountCents)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </>
                      )}

                      {!compensation.referrer && !compensation.influencerProfile && (
                        <div style={{ textAlign: "center", padding: "32px 0", color: "#9ca3af" }}>
                          No compensation records. Link a commercial persona in the Personas tab to get started.
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {tab === "security" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                  <div>
                    <SectionTitle>Change Account Status</SectionTitle>
                    <input className="form-input" placeholder="Reason (optional)" value={statusReason} onChange={(e) => setStatusReason(e.target.value)} style={{ marginBottom: 10 }} />
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                      {STATUS_OPTIONS.map(({ value, label }) => (
                        <button key={value} disabled={saving || user.status === value} onClick={() => changeStatus(value)} style={{
                          padding: "8px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer",
                          border: `1px solid ${STATUS_COLORS[value]}44`,
                          background: user.status === value ? STATUS_COLORS[value] + "22" : "#fff",
                          color: STATUS_COLORS[value], opacity: user.status === value ? 0.6 : 1,
                        }}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <hr style={{ borderColor: "var(--color-border)" }} />
                  <div>
                    <SectionTitle>Session & Credentials</SectionTitle>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      <div style={{ padding: "12px 14px", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12, color: "var(--color-text-muted)", lineHeight: 1.5 }}>
                        Sign-in credentials are managed by Google Workspace. OKÜ does not store or email account passwords.
                      </div>
                      <ActionRow title="Force Logout All Sessions" desc="Invalidates all active sessions immediately" btnLabel="Logout" btnColor="#dc2626" onClick={forceLogout} disabled={saving} />
                    </div>
                  </div>
                </div>
              )}

              {tab === "audit" && (
                <div>
                  <SectionTitle>Audit Trail ({audit.length} events)</SectionTitle>
                  {audit.length === 0 && <p style={{ color: "#9ca3af", fontSize: 14 }}>No admin actions recorded yet.</p>}
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {audit.map((log: any, i) => (
                      <div key={log.id} style={{ display: "flex", gap: 12, padding: "12px 0", borderBottom: i < audit.length - 1 ? "1px solid var(--color-border)" : "none" }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#c9a96e", marginTop: 5, flexShrink: 0 }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                            <span style={{ fontWeight: 700, fontSize: 13 }}>{log.summary}</span>
                            <span style={{ fontSize: 11, color: "var(--color-text-muted)", whiteSpace: "nowrap", marginLeft: 8 }}>{fmt(log.createdAt)}</span>
                          </div>
                          <span className="badge badge-neutral" style={{ fontSize: 10, marginTop: 4 }}>{log.action}</span>
                          {log.reason && <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 4 }}>Reason: {log.reason}</div>}
                          {log.performedBy && <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>by {log.performedBy.name || log.performedBy.email}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {tab === "notes" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div>
                    <FieldLabel>Internal Notes</FieldLabel>
                    <textarea className="form-input" rows={8} placeholder="Private notes visible only to admins…" value={notes} onChange={(e) => setNotes(e.target.value)} style={{ resize: "vertical", marginTop: 6 }} />
                  </div>
                  <div>
                    <FieldLabel>Tags (comma-separated)</FieldLabel>
                    <input className="form-input" placeholder="vip, flagged, compliance-review…" value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} style={{ marginTop: 6 }} />
                    {user.tags?.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                        {user.tags.map((tag: string) => (
                          <span key={tag} style={{ padding: "2px 10px", background: "#c9a96e22", color: "#92764a", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{tag}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <button className="btn btn-primary" style={{ alignSelf: "flex-start" }} onClick={saveNotes} disabled={saving}>
                    {saving ? "Saving…" : "Save Notes"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "#f8f5f3", borderRadius: 8, padding: "10px 14px", border: "1px solid var(--color-border)" }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text)", wordBreak: "break-word" }}>{value}</div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--color-text-muted)", margin: "0 0 12px" }}>{children}</h3>;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-muted)" }}>{children}</span>;
}

function ActionRow({ title, desc, btnLabel, btnColor, onClick, disabled }: { title: string; desc: string; btnLabel: string; btnColor: string; onClick: () => void; disabled: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "#f8f5f3", borderRadius: 8, border: "1px solid var(--color-border)" }}>
      <div>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{title}</div>
        <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{desc}</div>
      </div>
      <button className="btn" style={{ borderColor: btnColor, color: btnColor, flexShrink: 0, marginLeft: 12 }} onClick={onClick} disabled={disabled}>{btnLabel}</button>
    </div>
  );
}
