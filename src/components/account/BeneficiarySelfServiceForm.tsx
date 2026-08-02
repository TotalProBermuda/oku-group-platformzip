"use client";

import { useState } from "react";
import type {
  BeneficiaryProfileView,
  BankAccountTypeValue,
} from "@/server/beneficiaries/beneficiaryService";
import BeneficiaryDocumentsUploader, {
  type DocumentView,
} from "./BeneficiaryDocumentsUploader";
import {
  ComplianceHoldBanner,
  MaskedSensitiveField,
  PayoutEligibilityStatus,
} from "@/components/trust";

export default function BeneficiarySelfServiceForm({
  initial,
  initialDocuments,
}: {
  initial: BeneficiaryProfileView | null;
  initialDocuments: DocumentView[];
}) {
  const [profile, setProfile] = useState<BeneficiaryProfileView | null>(initial);
  const [form, setForm] = useState({
    bankName: initial?.bank.bankName ?? "",
    accountHolderName: initial?.bank.accountHolderName ?? "",
    accountType: (initial?.bank.accountType ?? "") as BankAccountTypeValue | "",
    currency: initial?.bank.currency ?? "USD",
    swiftBic: initial?.bank.swiftBic ?? "",
    statusEmailOptOut: initial?.preferences.statusEmailOptOut ?? false,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm(s => ({ ...s, [k]: v }));
    setOk(false);
  }

  async function patch(body: Record<string, unknown>): Promise<void> {
    const res = await fetch(`/api/v1/me/beneficiary`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || "Failed");
    setProfile(json.data);
  }

  async function saveBankInfo() {
    setBusy(true); setErr(null); setOk(false);
    try {
      await patch({
        bankName: form.bankName || null,
        accountHolderName: form.accountHolderName || null,
        accountType: form.accountType || null,
        currency: form.currency || null,
        swiftBic: form.swiftBic || null,
        statusEmailOptOut: form.statusEmailOptOut,
      });
      setOk(true);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveAccountNumber(next: string): Promise<void> {
    await patch({ banescoAccountNumber: next });
  }

  const status = profile?.status.bankReadinessStatus ?? "MISSING_INFO";
  const last4 = profile?.bank.accountLast4 ?? null;
  const onHold = status === "ON_HOLD";

  return (
    <div style={{ background: "#fff", border: "1px solid #e8e2dd", borderRadius: 12, padding: 24 }}>
      {onHold && profile?.status.complianceHoldReason && (
        <div style={{ marginBottom: 16 }}>
          <ComplianceHoldBanner reason={profile.status.complianceHoldReason} />
        </div>
      )}

      <div style={{ marginBottom: 18 }}>
        <PayoutEligibilityStatus
          result={{
            ready: profile?.status.payoutEligible ?? false,
            status,
            blockingReasons: profile?.status.blockingReasons ?? [],
          }}
          layout="stacked"
        />
      </div>

      <div style={{ background: "#f8f4ef", border: "1px solid #e8e2dd", borderRadius: 8, padding: 12, marginBottom: 20, fontSize: 13, color: "#5a4f47", lineHeight: 1.55 }}>
        Your payout information is protected, your bank details are masked, and
        finance review is required before payment.
      </div>

      <Field label={`Banesco account number${last4 ? ` (currently •••• ${last4})` : ""}`}>
        <MaskedSensitiveField
          fieldName="Banesco account number"
          last4={last4}
          onSubmit={saveAccountNumber}
          placeholder="Not yet set"
        />
      </Field>

      <Field label="Bank name">
        <input value={form.bankName} onChange={e => set("bankName", e.target.value)} style={inp} />
      </Field>
      <Field label="Account holder">
        <input value={form.accountHolderName} onChange={e => set("accountHolderName", e.target.value)} style={inp} />
      </Field>
      <Field label="Account type">
        <select value={form.accountType} onChange={e => set("accountType", e.target.value as BankAccountTypeValue | "")} style={inp}>
          <option value="">—</option>
          <option value="CHECKING">Checking</option>
          <option value="SAVINGS">Savings</option>
        </select>
      </Field>
      <Field label="Currency">
        <input value={form.currency} onChange={e => set("currency", e.target.value)} style={inp} />
      </Field>
      <Field label="SWIFT/BIC (optional)">
        <input value={form.swiftBic} onChange={e => set("swiftBic", e.target.value)} style={inp} />
      </Field>

      <div style={{ marginTop: 18, padding: "12px 14px", background: "#faf7f2", border: "1px solid #ece5dc", borderRadius: 8 }}>
        <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={!form.statusEmailOptOut}
            onChange={e => set("statusEmailOptOut", !e.target.checked)}
            style={{ marginTop: 3 }}
          />
          <span style={{ fontSize: 13, color: "#3a332e", lineHeight: 1.5 }}>
            <b>Email me about status changes</b>
            <div style={{ fontSize: 12, color: "#7d7269", marginTop: 2 }}>
              We&apos;ll let you know when OKÜ approves your profile or when Banesco confirms your
              account. You&apos;ll always be emailed if your profile is placed on hold or rejected,
              even with this turned off.
            </div>
          </span>
        </label>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 20, gap: 16 }}>
        <div style={{ fontSize: 12, color: "#7d7269", lineHeight: 1.45 }}>
          Your account number saves on its own, separately from these bank details.
          {" "}
          <span style={{ color: ok ? "#0e6b3b" : "#a01a1a", fontWeight: 600 }}>
            {ok && "Saved."} {err}
          </span>
        </div>
        <button onClick={saveBankInfo} disabled={busy} style={{ padding: "10px 20px", border: 0, borderRadius: 6, background: "#1f1d1b", color: "#fff", fontWeight: 600, whiteSpace: "nowrap" }}>
          {busy ? "Saving…" : "Save bank info"}
        </button>
      </div>

      <div style={{ marginTop: 28, paddingTop: 20, borderTop: "1px solid #ece5dc" }}>
        <h2 style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: "0.07em", color: "#5a4f47", marginBottom: 10 }}>
          Supporting documents
        </h2>
        <BeneficiaryDocumentsUploader
          listEndpoint="/api/v1/me/beneficiary/documents"
          itemEndpoint={(id) => `/api/v1/me/beneficiary/documents/${id}`}
          initial={initialDocuments}
        />
      </div>
    </div>
  );
}

const inp: React.CSSProperties = {
  width: "100%", padding: "10px 12px", border: "1px solid #d6cdc4", borderRadius: 6, fontSize: 14,
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 12, color: "#5a4f47", marginBottom: 4, fontWeight: 500 }}>{label}</div>
      {children}
    </div>
  );
}
