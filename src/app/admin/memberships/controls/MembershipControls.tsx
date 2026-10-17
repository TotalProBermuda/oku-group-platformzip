"use client";
import Link from "next/link";
import { useState } from "react";
import { initialMembershipControls, membershipDraftIssues, previewMemberCommission, type MembershipControlDraft, type MemberCommissionEvidence } from "@/lib/membershipControls";
import styles from "./controls.module.css";

export default function MembershipControls() {
  const [draft, setDraft] = useState({ ...initialMembershipControls });
  const [identity, setIdentity] = useState<MemberCommissionEvidence["identity"]>("EMAIL_ONLY");
  const [split, setSplit] = useState(false);
  const [paid, setPaid] = useState(false);
  const [notice, setNotice] = useState("");
  const update = <K extends keyof MembershipControlDraft>(key: K, value: MembershipControlDraft[K]) => setDraft(d => ({ ...d, [key]: value }));
  const issues = membershipDraftIssues(draft);
  const preview = previewMemberCommission(draft.scope, {
    identity, historyVerified: identity === "VERIFIED_ACCOUNT", transactionAt: 100,
    activeFrom: 0, activeUntil: 200, paid,
    allocation: split ? "SPLIT_UNRESOLVED" : "MEMBER_CHECK",
  });
  function download() {
    const blob = new Blob([JSON.stringify({ ...draft, reviewIssues: issues, activationBlocked: true }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "membership-controls-DRAFT.json"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice("Draft exported only. No server settings, POS buttons or commissions changed.");
  }
  return <main className={styles.page}>
    <Link href="/admin/memberships">← Memberships</Link>
    <h1>Membership controls — draft workspace</h1>
    <p role="note">Not live. Changes stay in this page until exported and are lost on navigation. No customer information is needed here. This editor cannot save production settings or create INVU buttons.</p>
    <section><h2>Referrer commission exclusion</h2>
      <label>Membership scope<select value={draft.scope} onChange={e => update("scope", e.target.value as MembershipControlDraft["scope"])}>
        <option value="UNDECIDED">Awaiting owner decision</option><option value="ALL_ACTIVE">All active membership tiers</option><option value="PAID_ACTIVE">Active paid memberships only</option>
      </select></label>
      <p>Exclusion applies even without a discount. Retain referral attribution for audit. Do not reverse historical earnings or change host compensation.</p>
    </section>
    <section><h2>Benefit and discount mapping</h2>
      <label>Delivery system<select value={draft.surface} onChange={e => update("surface", e.target.value as MembershipControlDraft["surface"])}><option value="INVU_POS">INVU POS</option><option value="WEB_CHECKOUT">Web checkout</option></select></label>
      {draft.surface === "INVU_POS" && <div className={styles.grid}>
        {([['venue', 'Venue ID'], ['branch', 'INVU branch ID'], ['posDiscountId', 'Actual INVU discount-button ID'], ['receiptEvidence', 'Redacted imported receipt reference']] as const).map(([key, label]) => <label key={key}>{label}<input maxLength={160} value={draft[key]} onChange={e => update(key, e.target.value)} /></label>)}
      </div>}
      <p>Mapping a POS discount does not create a web discount. A receipt total alone does not identify a member. POS configuration and an imported test receipt must be independently verified.</p>
      <label>Refund treatment<select value={draft.benefitTreatment} onChange={e => setDraft(d => ({ ...d, benefitTreatment: e.target.value as MembershipControlDraft["benefitTreatment"], deductionCents: 0, disclosedBeforePurchase: false }))}>
        <option value="INCLUDED_ACCESS">Included access</option><option value="SEPARATE_PURCHASE">Separate purchase</option><option value="DEDUCTIBLE_EXTRA">Deductible extra</option>
      </select></label>
      {draft.benefitTreatment === "DEDUCTIBLE_EXTRA" && <>
        <label>Pre-disclosed value (USD cents)<input type="number" min="0" max="2147483647" step="1" value={Number.isNaN(draft.deductionCents) ? "" : draft.deductionCents} onChange={e => update("deductionCents", e.target.valueAsNumber)} /></label>
        <label className={styles.check}><input type="checkbox" checked={draft.disclosedBeforePurchase} onChange={e => update("disclosedBeforePurchase", e.target.checked)} />Value disclosed before purchase</label>
      </>}
      <p>Ordinary discounts are never retrospectively clawed back. Only actually redeemed extras can be evaluated for deduction; a reservation is not redemption.</p>
    </section>
    <section><h2>Illustrative decision preview</h2><p>Synthetic active-member scenario, not a live account lookup or an eligibility approval.</p>
      <label>Identity evidence<select value={identity} onChange={e => setIdentity(e.target.value as typeof identity)}><option value="EMAIL_ONLY">Email only</option><option value="UNKNOWN">Unknown identity</option><option value="VERIFIED_ACCOUNT">Verified account + history</option></select></label>
      <label className={styles.check}><input type="checkbox" checked={paid} onChange={e => setPaid(e.target.checked)} />Verified paid membership (test scenario)</label>
      <label className={styles.check}><input type="checkbox" checked={split} onChange={e => setSplit(e.target.checked)} />Unresolved split check</label>
      <div role="status"><strong>{preview.decision.replaceAll("_", " ")}</strong><p>{preview.reason}</p></div>
    </section>
    <section><h2>Review gates</h2><ul>{issues.map(issue => <li key={issue}>{issue}</li>)}<li>Audited server storage, transaction-time snapshots, approval and migration remain required.</li><li>No activation until all commission entry points and POS evidence are verified.</li></ul>
      <button type="button" onClick={download}>Export draft for review — not activation</button><p role="status">{notice}</p>
    </section>
  </main>;
}
