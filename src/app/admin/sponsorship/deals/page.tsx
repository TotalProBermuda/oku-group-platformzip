"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useTranslation } from "@/components/i18n/LocaleProvider";

const PAYMENT_STATUS_COLOR: Record<string, string> = {
  UNPAID: "#f59e0b", PARTIALLY_PAID: "#3b82f6", PAID: "#16a34a",
};

const PLACEMENT_ICONS: Record<string, string> = {
  EMAIL_HEADER: "📧", CHECK_IN_SCREEN: "📱", EVENT_PAGE: "🌐",
  TICKET_PDF: "🎟️", INVITATION: "✉️", DIGITAL_MENU: "📋",
  SOCIAL_STORY: "📸", SIGNAGE: "🪧", WELCOME_CARD: "🃏", BRAND_MOMENT: "✨",
};

const PLACEMENT_TYPES = ["EMAIL_HEADER","CHECK_IN_SCREEN","EVENT_PAGE","TICKET_PDF","INVITATION","DIGITAL_MENU","SOCIAL_STORY","SIGNAGE","WELCOME_CARD","BRAND_MOMENT"];

const CAT_ICONS: Record<string, string> = {
  TITLE: "👑", BEVERAGE: "🍷", SPIRITS: "🥃", CULINARY: "🍽️",
  LUXURY: "💎", WELLNESS: "🌿", REAL_ESTATE: "🏛️", MEDIA: "📸",
  EXPERIENCE: "✨", OTHER: "📦",
};

export default function AdminSponsorshipDealsPage() {
  const t = useTranslation();
  const [deals, setDeals]           = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);
  const [selected, setSelected]     = useState<any | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [filter, setFilter]         = useState("");
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState("");
  const [success, setSuccess]       = useState("");
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [showAddPlacement, setShowAddPlacement] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ amountCents: "", method: "bank_transfer", reference: "", notes: "" });
  const [placementForm, setPlacementForm] = useState({ placementType: "EVENT_PAGE", label: "", assetUrl: "", altText: "", linkUrl: "", notes: "" });

  const load = useCallback(async () => {
    setLoading(true);
    const qs = filter ? `?paymentStatus=${filter}` : "";
    const r = await fetch(`/api/v1/admin/sponsorship/deals${qs}`);
    const d = await r.json();
    if (d.ok) setDeals(d.deals);
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  async function loadDetail(id: string) {
    setLoadingDetail(true);
    const r = await fetch(`/api/v1/admin/sponsorship/deals/${id}`);
    const d = await r.json();
    if (d.ok) setSelected(d.deal);
    setLoadingDetail(false);
    setShowAddPayment(false); setShowAddPlacement(false); setError(""); setSuccess("");
  }

  async function addPayment() {
    if (!selected || !paymentForm.amountCents) return;
    setSaving(true); setError("");
    const r = await fetch(`/api/v1/admin/sponsorship/deals/${selected.id}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amountCents: Number(paymentForm.amountCents), method: paymentForm.method || null, reference: paymentForm.reference || null, notes: paymentForm.notes || null }),
    });
    const d = await r.json();
    setSaving(false);
    if (d.ok) {
      setSuccess("Payment recorded · Deal updated");
      setShowAddPayment(false); setPaymentForm({ amountCents: "", method: "bank_transfer", reference: "", notes: "" });
      loadDetail(selected.id); load();
    } else {
      setError(d.error ?? "Failed");
    }
  }

  async function addPlacement() {
    if (!selected) return;
    setSaving(true); setError("");
    const r = await fetch(`/api/v1/admin/sponsorship/deals/${selected.id}/placements`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...placementForm }),
    });
    const d = await r.json();
    setSaving(false);
    if (d.ok) {
      setSuccess("Placement activated");
      setShowAddPlacement(false); setPlacementForm({ placementType: "EVENT_PAGE", label: "", assetUrl: "", altText: "", linkUrl: "", notes: "" });
      loadDetail(selected.id);
    } else {
      setError(d.error ?? "Failed");
    }
  }

  async function togglePlacement(pid: string, isActive: boolean) {
    if (!selected) return;
    await fetch(`/api/v1/admin/sponsorship/deals/${selected.id}/placements/${pid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive }),
    });
    loadDetail(selected.id);
  }

  const fmtMoney = (c: number) => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 0 })}`;
  const fmtDate  = (s: string) => new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    <div style={{ display: "flex", height: "calc(100vh - 60px)" }}>
      {/* Left: deal list */}
      <div style={{ width: 380, borderRight: "1px solid #e5e0d8", background: "#fafaf9", display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <div style={{ padding: "24px 20px 16px", borderBottom: "1px solid #e5e0d8" }}>
          <Link href="/admin/sponsorship" style={{ fontSize: 13, color: "#9ca3af", textDecoration: "none" }}>← Sponsorship</Link>
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: 22, fontWeight: 400, color: "#1a1614", margin: "8px 0 0" }}>Deal Pipeline</h1>
          <select className="form-select" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ marginTop: 12, fontSize: 13 }}>
            <option value="">All deals</option>
            <option value="UNPAID">Unpaid</option>
            <option value="PARTIALLY_PAID">Partially Paid</option>
            <option value="PAID">Fully Paid</option>
          </select>
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: "center" }}><div className="loading-spinner" style={{ margin: "0 auto" }} /></div>
          ) : deals.length === 0 ? (
            <div style={{ padding: "40px 20px", textAlign: "center", color: "#9ca3af", fontSize: 14 }}>No deals yet</div>
          ) : deals.map((deal) => (
            <button
              key={deal.id}
              onClick={() => loadDetail(deal.id)}
              style={{
                display: "flex", alignItems: "flex-start", gap: 12, width: "100%",
                padding: "14px 20px", background: selected?.id === deal.id ? "white" : "transparent",
                border: "none", borderBottom: "1px solid #e5e0d8", cursor: "pointer", textAlign: "left",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: "#1a1614", marginBottom: 2 }}>
                  {deal.entity?.displayName ?? deal.application?.brandName ?? "Unknown"}
                </div>
                <div style={{ fontSize: 11, color: "#9ca3af", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {deal.slot ? `${CAT_ICONS[deal.slot.category] ?? "📦"} ${deal.slot.title}` : "Direct deal"}
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 4, alignItems: "center" }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#1a1614" }}>{fmtMoney(deal.agreedPriceCents)}</span>
                  <span style={{ padding: "1px 8px", borderRadius: 999, background: PAYMENT_STATUS_COLOR[deal.paymentStatus] + "22", color: PAYMENT_STATUS_COLOR[deal.paymentStatus], fontSize: 10, fontWeight: 700 }}>
                    {deal.paymentStatus.replace("_", " ")}
                  </span>
                </div>
              </div>
              <div style={{ fontSize: 11, color: "#9ca3af", flexShrink: 0 }}>{deal._count.placements}p</div>
            </button>
          ))}
        </div>
      </div>

      {/* Right: deal detail */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {loadingDetail ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
            <div className="loading-spinner" />
          </div>
        ) : !selected ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#9ca3af" }}>
            <div style={{ textAlign: "center" }}><div style={{ fontSize: 40, marginBottom: 12 }}>💼</div><div>Select a deal to manage</div></div>
          </div>
        ) : (
          <div style={{ padding: "32px 40px", maxWidth: 740 }}>
            {error   && <div className="alert alert-danger"  style={{ marginBottom: 16 }}>{error}</div>}
            {success && <div className="alert alert-success" style={{ marginBottom: 16 }}>{success}</div>}

            {/* Deal header */}
            <div style={{ marginBottom: 28 }}>
              <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 24, color: "#1a1614", margin: 0 }}>
                {selected.entity?.displayName ?? selected.application?.brandName}
              </h2>
              {selected.slot && (
                <div style={{ fontSize: 14, color: "#6b7280", marginTop: 4 }}>
                  {CAT_ICONS[selected.slot.category] ?? "📦"} {selected.slot.title}
                  {selected.slot.series && ` · ${selected.slot.series.title}`}
                </div>
              )}
              <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
                <span style={{ fontSize: 24, fontWeight: 800, color: "#1a1614" }}>{fmtMoney(selected.agreedPriceCents)}</span>
                <span style={{ padding: "4px 14px", borderRadius: 999, background: PAYMENT_STATUS_COLOR[selected.paymentStatus] + "22", color: PAYMENT_STATUS_COLOR[selected.paymentStatus], fontSize: 13, fontWeight: 700 }}>
                  {selected.paymentStatus.replace("_", " ")}
                </span>
                {selected.paidTotalCents > 0 && selected.paymentStatus !== "PAID" && (
                  <span style={{ fontSize: 13, color: "#9ca3af" }}>
                    {fmtMoney(selected.paidTotalCents)} collected · {fmtMoney(selected.agreedPriceCents - selected.paidTotalCents)} outstanding
                  </span>
                )}
              </div>
            </div>

            {/* Payments section */}
            <div style={{ marginBottom: 32 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#1a1614" }}>Payments</div>
                <button className="btn btn-ghost btn-sm" onClick={() => { setShowAddPayment(!showAddPayment); setShowAddPlacement(false); }}>
                  {showAddPayment ? "Cancel" : "+ Record Payment"}
                </button>
              </div>

              {showAddPayment && (
                <div className="card" style={{ padding: 16, marginBottom: 14, borderStyle: "dashed" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Amount (cents)</label>
                      <input className="form-input" type="number" placeholder="e.g. 250000" value={paymentForm.amountCents} onChange={(e) => setPaymentForm((f) => ({ ...f, amountCents: e.target.value }))} />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Method</label>
                      <select className="form-select" value={paymentForm.method} onChange={(e) => setPaymentForm((f) => ({ ...f, method: e.target.value }))}>
                        <option value="bank_transfer">Bank Transfer</option>
                        <option value="authorize_net">Authorize.Net</option>
                        <option value="check">Check</option>
                        <option value="crypto">Crypto</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                  </div>
                  <div className="form-group" style={{ margin: "0 0 8px" }}>
                    <label className="form-label">Reference</label>
                    <input className="form-input" placeholder="Invoice or transfer ref" value={paymentForm.reference} onChange={(e) => setPaymentForm((f) => ({ ...f, reference: e.target.value }))} />
                  </div>
                  <button className="btn btn-primary btn-sm" disabled={saving} onClick={addPayment}>{saving ? "Saving…" : "Record Payment"}</button>
                </div>
              )}

              {selected.payments?.length === 0 ? (
                <div style={{ color: "#9ca3af", fontSize: 13, padding: "12px 0" }}>No payments recorded yet</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {selected.payments.map((p: any) => (
                    <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "#f8f5f3", borderRadius: 8 }}>
                      <div>
                        <span style={{ fontWeight: 700, color: "#1a1614" }}>{fmtMoney(p.amountCents)}</span>
                        <span style={{ marginLeft: 10, fontSize: 12, color: "#9ca3af" }}>{p.method?.replace("_", " ")} {p.reference ? `· ${p.reference}` : ""}</span>
                      </div>
                      <div style={{ fontSize: 12, color: "#9ca3af" }}>{fmtDate(p.paidAt)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Placements section */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#1a1614" }}>Activations & Placements</div>
                <button className="btn btn-ghost btn-sm" onClick={() => { setShowAddPlacement(!showAddPlacement); setShowAddPayment(false); }}>
                  {showAddPlacement ? "Cancel" : "+ Add Placement"}
                </button>
              </div>

              {showAddPlacement && (
                <div className="card" style={{ padding: 16, marginBottom: 14, borderStyle: "dashed" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Placement Type</label>
                      <select className="form-select" value={placementForm.placementType} onChange={(e) => setPlacementForm((f) => ({ ...f, placementType: e.target.value }))}>
                        {PLACEMENT_TYPES.map((pt) => <option key={pt} value={pt}>{PLACEMENT_ICONS[pt] ?? "📌"} {pt.replace(/_/g, " ")}</option>)}
                      </select>
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Label</label>
                      <input className="form-input" placeholder="e.g. Homepage banner" value={placementForm.label} onChange={(e) => setPlacementForm((f) => ({ ...f, label: e.target.value }))} />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Asset URL</label>
                      <input className="form-input" placeholder="https://…" value={placementForm.assetUrl} onChange={(e) => setPlacementForm((f) => ({ ...f, assetUrl: e.target.value }))} />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Link URL</label>
                      <input className="form-input" placeholder="https://…" value={placementForm.linkUrl} onChange={(e) => setPlacementForm((f) => ({ ...f, linkUrl: e.target.value }))} />
                    </div>
                  </div>
                  <button className="btn btn-primary btn-sm" disabled={saving} onClick={addPlacement}>{saving ? "Saving…" : "Add Placement"}</button>
                </div>
              )}

              {selected.placements?.length === 0 ? (
                <div style={{ color: "#9ca3af", fontSize: 13, padding: "12px 0" }}>No placements activated yet</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {selected.placements.map((p: any) => (
                    <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: "#f8f5f3", borderRadius: 8 }}>
                      <span style={{ fontSize: 20 }}>{PLACEMENT_ICONS[p.placementType] ?? "📌"}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, color: "#1a1614" }}>{p.label ?? p.placementType.replace(/_/g, " ")}</div>
                        {p.assetUrl && <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>Asset: {p.assetUrl}</div>}
                        <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{p.impressions} impressions · {p.clicks} clicks</div>
                      </div>
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ fontSize: 11, color: p.isActive ? "#dc2626" : "#16a34a" }}
                        onClick={() => togglePlacement(p.id, !p.isActive)}
                      >
                        {p.isActive ? "Deactivate" : "Activate"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
