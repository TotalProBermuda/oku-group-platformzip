"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslation } from "@/components/i18n/LocaleProvider";
import { HoneypotField } from "@/components/HoneypotField";

export default function BrandPartnerApplyPage() {
  const t = useTranslation();
  const searchParams = useSearchParams();
  const router = useRouter();
  const preSlotId    = searchParams.get("slot") ?? "";
  const preSlotTitle = searchParams.get("slotTitle") ?? "";

  const [form, setForm] = useState({
    brandName: "", contactName: "", contactEmail: "", contactPhone: "",
    websiteUrl: "", brandStatement: "", campaignGoals: "", budgetCents: "",
    slotId: preSlotId,
  });
  const [company, setCompany] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone]     = useState(false);
  const [error, setError]   = useState("");

  function fld(key: keyof typeof form, label: string, type = "text", placeholder = "") {
    return (
      <div className="form-group">
        <label className="form-label">{label}</label>
        <input
          className="form-input"
          type={type}
          placeholder={placeholder}
          value={form[key] as string}
          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        />
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.brandName.trim() || !form.contactName.trim() || !form.contactEmail.trim()) {
      setError("Brand name, contact name, and email are required.");
      return;
    }
    setSubmitting(true); setError("");
    type SubmitBody = {
      brandName: string;
      contactName: string;
      contactEmail: string;
      contactPhone: string;
      websiteUrl: string;
      brandStatement: string;
      campaignGoals: string;
      _company: string;
      budgetCents?: number;
      slotId?: string;
    };
    const body: SubmitBody = {
      brandName: form.brandName,
      contactName: form.contactName,
      contactEmail: form.contactEmail,
      contactPhone: form.contactPhone,
      websiteUrl: form.websiteUrl,
      brandStatement: form.brandStatement,
      campaignGoals: form.campaignGoals,
      _company: company,
    };
    if (form.budgetCents) body.budgetCents = Math.round(parseFloat(form.budgetCents) * 100);
    if (form.slotId) body.slotId = form.slotId;

    const res = await fetch("/api/v1/sponsorship/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setSubmitting(false);
    if (data.ok) setDone(true);
    else setError(data.error ?? "Submission failed — please try again.");
  }

  if (done) return (
    <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 24px", textAlign: "center" }}>
      <div style={{ maxWidth: 480 }}>
        <div style={{ fontSize: 48, marginBottom: 20 }}>✓</div>
        <h1 style={{ fontFamily: "var(--font-heading)", fontSize: 32, fontWeight: 400, color: "#1a1614", marginBottom: 16 }}>
          Application Received
        </h1>
        <p style={{ color: "#6b7280", fontSize: 16, lineHeight: 1.7, marginBottom: 32 }}>
          Thank you. Our partnerships team will review your inquiry and be in touch within 3–5 business days.
        </p>
        <Link href="/brand-partners" style={{ color: "#c41e3a", textDecoration: "none", fontWeight: 600 }}>
          ← Back to opportunities
        </Link>
      </div>
    </div>
  );

  return (
    <div style={{ background: "#f8f5f3", minHeight: "100vh", padding: "80px 24px" }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <Link href="/brand-partners" style={{ fontSize: 14, color: "#9ca3af", textDecoration: "none", display: "block", marginBottom: 28 }}>← Brand Partnerships</Link>

        <h1 style={{ fontFamily: "var(--font-heading)", fontSize: 36, fontWeight: 400, color: "#1a1614", marginBottom: 8 }}>
          Brand Inquiry
        </h1>
        <p style={{ color: "#6b7280", fontSize: 15, lineHeight: 1.7, marginBottom: 40, marginTop: 0 }}>
          {preSlotTitle ? `You're inquiring about: ${preSlotTitle}` : "Tell us about your brand and what you're looking for. We'll design the right opportunity together."}
        </p>

        {error && <div className="alert alert-danger" style={{ marginBottom: 20 }}>{error}</div>}

        <form onSubmit={submit} className="card" style={{ padding: 32 }}>
          <HoneypotField value={company} onChange={setCompany} />
          <div style={{ fontWeight: 700, fontSize: 14, color: "#1a1614", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 20 }}>Brand</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
            {fld("brandName",  "Brand / Company Name *", "text", "OKÜ Fine Foods")}
            {fld("websiteUrl", "Website",                "url",  "https://yourbrand.com")}
          </div>

          <div style={{ fontWeight: 700, fontSize: 14, color: "#1a1614", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 20, marginTop: 24 }}>Contact</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
            {fld("contactName",  "Your Name *",   "text",  "Jane Smith")}
            {fld("contactEmail", "Work Email *",  "email", "jane@brand.com")}
            {fld("contactPhone", "Phone",         "tel",   "+1 305 555 0100")}
          </div>

          <div style={{ fontWeight: 700, fontSize: 14, color: "#1a1614", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 20, marginTop: 24 }}>Your Vision</div>

          <div className="form-group">
            <label className="form-label">Brand Statement — Why are you a fit for OKÜ?</label>
            <textarea
              className="form-input" rows={5}
              placeholder="Describe your brand, its audience, and why OKÜ's community aligns with your values…"
              value={form.brandStatement}
              onChange={(e) => setForm((f) => ({ ...f, brandStatement: e.target.value }))}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Campaign Goals</label>
            <textarea
              className="form-input" rows={3}
              placeholder="What do you want to achieve? Brand awareness, direct leads, product sampling, cultural association…"
              value={form.campaignGoals}
              onChange={(e) => setForm((f) => ({ ...f, campaignGoals: e.target.value }))}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Budget Indication (USD)</label>
            <input
              className="form-input" type="number" min="0" step="100"
              placeholder="e.g. 5000"
              value={form.budgetCents}
              onChange={(e) => setForm((f) => ({ ...f, budgetCents: e.target.value }))}
            />
            <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 4 }}>Optional — helps us scope the right package</div>
          </div>

          <button type="submit" className="btn btn-primary" disabled={submitting} style={{ width: "100%", padding: "14px", fontSize: 16, marginTop: 8 }}>
            {submitting ? "Submitting…" : "Submit Brand Inquiry →"}
          </button>

          <p style={{ fontSize: 12, color: "#9ca3af", textAlign: "center", marginTop: 16, marginBottom: 0 }}>
            We review all inquiries carefully and respond within 3–5 business days. No spam, ever.
          </p>
        </form>
      </div>
    </div>
  );
}
