"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useTranslation } from "@/components/i18n/LocaleProvider";

const STATUS_COLORS: Record<string, string> = {
  PENDING: "#f59e0b", UNDER_REVIEW: "#3b82f6", APPROVED: "#16a34a",
  REJECTED: "#dc2626", WITHDRAWN: "#9ca3af",
};

const CAT_ICONS: Record<string, string> = {
  TITLE: "👑", BEVERAGE: "🍷", SPIRITS: "🥃", CULINARY: "🍽️",
  LUXURY: "💎", WELLNESS: "🌿", REAL_ESTATE: "🏛️", MEDIA: "📸",
  EXPERIENCE: "✨", OTHER: "📦",
};

export default function AdminSponsorshipApplicationsPage() {
  const t = useTranslation();
  const [apps, setApps]       = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState("PENDING");
  const [selected, setSelected] = useState<any | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [reviewForm, setReviewForm] = useState({ status: "", reviewNotes: "", agreedPriceCents: "" });
  const [error, setError]     = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch(`/api/v1/admin/sponsorship/applications?status=${filter}`);
    const d = await r.json();
    if (d.ok) setApps(d.applications);
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  async function loadDetail(id: string) {
    const r = await fetch(`/api/v1/admin/sponsorship/applications/${id}`);
    const d = await r.json();
    if (d.ok) {
      setSelected(d.application);
      setReviewForm({ status: d.application.status, reviewNotes: d.application.reviewNotes ?? "", agreedPriceCents: "" });
    }
  }

  async function submitReview() {
    if (!selected) return;
    setReviewing(true); setError(""); setSuccess("");
    const body: any = {
      status:      reviewForm.status,
      reviewNotes: reviewForm.reviewNotes,
    };
    if (reviewForm.status === "APPROVED" && reviewForm.agreedPriceCents) {
      body.agreedPriceCents = Number(reviewForm.agreedPriceCents);
    }
    const r = await fetch(`/api/v1/admin/sponsorship/applications/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await r.json();
    setReviewing(false);
    if (d.ok) {
      setSuccess("Application updated" + (reviewForm.status === "APPROVED" && reviewForm.agreedPriceCents ? " · Deal created automatically" : ""));
      setSelected(null);
      load();
    } else {
      setError(d.error ?? "Failed to update");
    }
  }

  const fmtDate = (s: string) => new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    <div style={{ display: "flex", height: "calc(100vh - 60px)" }}>
      {/* Left: list */}
      <div style={{ width: 380, borderRight: "1px solid #e5e0d8", background: "#fafaf9", display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <div style={{ padding: "24px 20px 16px", borderBottom: "1px solid #e5e0d8" }}>
          <Link href="/admin/sponsorship" style={{ fontSize: 13, color: "#9ca3af", textDecoration: "none" }}>← Sponsorship</Link>
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: 22, fontWeight: 400, color: "#1a1614", margin: "8px 0 0" }}>Applications</h1>
          <select className="form-select" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ marginTop: 12, fontSize: 13 }}>
            <option value="">All</option>
            <option value="PENDING">Pending</option>
            <option value="UNDER_REVIEW">Under Review</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
            <option value="WITHDRAWN">Withdrawn</option>
          </select>
        </div>

        <div style={{ flex: 1, overflowY: "auto" }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: "center" }}><div className="loading-spinner" style={{ margin: "0 auto" }} /></div>
          ) : apps.length === 0 ? (
            <div style={{ padding: "40px 20px", textAlign: "center", color: "#9ca3af", fontSize: 14 }}>No applications in this status</div>
          ) : apps.map((app) => (
            <button
              key={app.id}
              onClick={() => loadDetail(app.id)}
              style={{
                display: "flex", alignItems: "flex-start", gap: 12, width: "100%",
                padding: "14px 20px", background: selected?.id === app.id ? "white" : "transparent",
                border: "none", borderBottom: "1px solid #e5e0d8", cursor: "pointer", textAlign: "left",
              }}
            >
              <div style={{ width: 36, height: 36, borderRadius: 8, background: "#f0e8e8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>
                {app.entity?.logoUrl ? <img src={app.entity.logoUrl} alt="" style={{ width: 36, height: 36, borderRadius: 8, objectFit: "cover" }} /> : "🏢"}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: "#1a1614", marginBottom: 2 }}>{app.brandName}</div>
                <div style={{ fontSize: 11, color: "#9ca3af", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {app.slot ? `${CAT_ICONS[app.slot.category] ?? "📦"} ${app.slot.title}` : "General inquiry"}
                </div>
                <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{fmtDate(app.createdAt)}</div>
              </div>
              <span style={{ padding: "2px 8px", borderRadius: 999, background: STATUS_COLORS[app.status] + "22", color: STATUS_COLORS[app.status], fontSize: 10, fontWeight: 600, flexShrink: 0 }}>
                {app.status.replace("_", " ")}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Right: detail */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {!selected ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#9ca3af" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
              <div>Select an application to review</div>
            </div>
          </div>
        ) : (
          <div style={{ padding: "32px 40px", maxWidth: 700 }}>
            {error   && <div className="alert alert-danger"  style={{ marginBottom: 16 }}>{error}</div>}
            {success && <div className="alert alert-success" style={{ marginBottom: 16 }}>{success}</div>}

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
              <div>
                <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 24, color: "#1a1614", margin: 0 }}>{selected.brandName}</h2>
                <div style={{ fontSize: 14, color: "#9ca3af", marginTop: 4 }}>
                  {selected.contactName} · {selected.contactEmail}
                  {selected.contactPhone && ` · ${selected.contactPhone}`}
                </div>
              </div>
              <span style={{ padding: "4px 14px", borderRadius: 999, background: STATUS_COLORS[selected.status] + "22", color: STATUS_COLORS[selected.status], fontSize: 13, fontWeight: 700 }}>
                {selected.status.replace("_", " ")}
              </span>
            </div>

            {selected.websiteUrl && (
              <div style={{ marginBottom: 20 }}>
                <a href={selected.websiteUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#c41e3a", fontSize: 14 }}>{selected.websiteUrl} ↗</a>
              </div>
            )}

            {/* Slot detail */}
            {selected.slot && (
              <div className="card" style={{ padding: "16px 20px", marginBottom: 20, background: "#f8f5f3" }}>
                <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Applying for</div>
                <div style={{ fontWeight: 700, fontSize: 16, color: "#1a1614" }}>
                  {CAT_ICONS[selected.slot.category] ?? "📦"} {selected.slot.title}
                </div>
                {selected.slot.series && (
                  <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>Series: {selected.slot.series.title}</div>
                )}
                {selected.slot.askPriceCents && (
                  <div style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>Ask price: ${(selected.slot.askPriceCents / 100).toLocaleString()}</div>
                )}
              </div>
            )}

            {/* Brand statement */}
            {selected.brandStatement && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#1a1614", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Brand Statement</div>
                <p style={{ color: "#4b4540", fontSize: 14, lineHeight: 1.7, margin: 0 }}>{selected.brandStatement}</p>
              </div>
            )}

            {/* Campaign goals */}
            {selected.campaignGoals && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#1a1614", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Campaign Goals</div>
                <p style={{ color: "#4b4540", fontSize: 14, lineHeight: 1.7, margin: 0 }}>{selected.campaignGoals}</p>
              </div>
            )}

            {selected.budgetCents && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#1a1614", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Budget Indication</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#1a1614" }}>${(selected.budgetCents / 100).toLocaleString()}</div>
              </div>
            )}

            <div style={{ borderTop: "1px solid #e5e0d8", paddingTop: 24, marginTop: 24 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#1a1614", marginBottom: 16 }}>Review Decision</div>

              <div className="form-group">
                <label className="form-label">Status</label>
                <select className="form-select" value={reviewForm.status} onChange={(e) => setReviewForm((f) => ({ ...f, status: e.target.value }))}>
                  <option value="PENDING">Pending</option>
                  <option value="UNDER_REVIEW">Under Review</option>
                  <option value="APPROVED">Approved → Create Deal</option>
                  <option value="REJECTED">Rejected</option>
                  <option value="WITHDRAWN">Withdrawn</option>
                </select>
              </div>

              {reviewForm.status === "APPROVED" && (
                <div className="form-group">
                  <label className="form-label">Agreed Price (cents) — required to auto-create deal</label>
                  <input className="form-input" type="number" placeholder="e.g. 250000 = $2,500" value={reviewForm.agreedPriceCents} onChange={(e) => setReviewForm((f) => ({ ...f, agreedPriceCents: e.target.value })) } />
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Internal Review Notes</label>
                <textarea className="form-input" rows={4} value={reviewForm.reviewNotes} onChange={(e) => setReviewForm((f) => ({ ...f, reviewNotes: e.target.value }))} placeholder="Notes visible only to admin team…" />
              </div>

              <button className="btn btn-primary" disabled={reviewing} onClick={submitReview}>
                {reviewing ? "Saving…" : "Save Review"}
              </button>
            </div>

            {/* Existing deal */}
            {selected.deal && (
              <div className="card" style={{ marginTop: 24, padding: "16px 20px", background: "#f0f8f4" }}>
                <div style={{ fontSize: 12, color: "#16a34a", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Active Deal</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: "#1a1614" }}>${(selected.deal.agreedPriceCents / 100).toLocaleString()} agreed</div>
                <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>Payment: {selected.deal.paymentStatus.replace("_", " ")}</div>
                <Link href="/admin/sponsorship/deals" style={{ display: "inline-block", marginTop: 12, fontSize: 13, color: "#c41e3a", textDecoration: "none" }}>
                  View deal pipeline →
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
