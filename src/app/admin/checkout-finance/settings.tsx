"use client";
import { useEffect, useState } from "react";
import { calculateCheckoutCharges } from "@/server/commerce/financeCalculation";
import styles from "./settings.module.css";

type Rule = { id: string; effectiveFrom: string; serviceFeeBps: number; serviceFeeFlatCents: number; taxBps: number; taxServiceFee: boolean };
const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

export default function FinanceSettings() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [percent, setPercent] = useState("0");
  const [flat, setFlat] = useState("0");
  const [tax, setTax] = useState("0");
  const [taxFee, setTaxFee] = useState(false);
  const [effective, setEffective] = useState("");
  const [sample, setSample] = useState("100");
  const [message, setMessage] = useState("Loading rules…");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ack, setAck] = useState(false);
  async function load(initialize = false) {
    const response = await fetch("/api/v1/admin/commerce/finance-rules", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Unable to load finance rules");
    setRules(data.rules);
    if (initialize) {
      const active = data.rules.find((r: Rule) => new Date(r.effectiveFrom).getTime() <= Date.now());
      if (active) { setPercent(String(active.serviceFeeBps / 100)); setFlat(String((active.serviceFeeFlatCents ?? 0) / 100)); setTax(String(active.taxBps / 100)); setTaxFee(active.taxServiceFee); }
      setMessage(""); setReady(true);
    }
  }
  useEffect(() => { void load(true).catch(e => setMessage(e.message)); }, []);
  const rate = { serviceFeeBps: Math.round(Number(percent) * 100), serviceFeeFlatCents: Math.round(Number(flat) * 100), taxBps: Math.round(Number(tax) * 100), taxServiceFee: taxFee };
  let preview: ReturnType<typeof calculateCheckoutCharges> | null = null;
  try { preview = calculateCheckoutCharges(Math.round(Number(sample) * 100), rate); } catch { /* Show invalid preview without crashing the form. */ }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !ack || !preview) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/v1/admin/commerce/finance-rules", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...rate, effectiveFrom: new Date(effective).toISOString() }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to save rule");
      await load(); setAck(false);
      setMessage("Rule scheduled. New checkout orders use it from the effective time; existing orders keep their original charges.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Unable to save rule"); }
    finally { setBusy(false); }
  }
  return <main className={styles.page}>
    <h1>Ticket fees & tax</h1>
    <p>Service fees are merchant charges, separate from tax and the gateway’s own processing charges. The full checkout total is submitted to the merchant gateway. This screen does not remit tax to government.</p>
    <p>Applies to event-ticket checkout only, not restaurant deposits. Amounts below are USD. Confirm tax rates and whether fees are taxable with your accountant before scheduling changes.</p>
    <p role="status" aria-live="polite">{message}</p>
    <form onSubmit={save} className={styles.panel}>
      <h2>Schedule a new rule</h2>
      <p>Use a percentage, a flat fee per order, or both. Set either to zero to disable it. No service fee is charged on a zero-subtotal order.</p>
      <div className={styles.grid}>
        <label>Service fee (%)<input required type="number" min="0" max="100" step="0.01" value={percent} onChange={e => setPercent(e.target.value)} /></label>
        <label>Flat service fee per order (USD)<input required type="number" min="0" max="10000" step="0.01" value={flat} onChange={e => setFlat(e.target.value)} /></label>
        <label>Tax (%)<input required type="number" min="0" max="100" step="0.01" value={tax} onChange={e => setTax(e.target.value)} /></label>
        <label>Effective from (your device’s local time)<input required type="datetime-local" value={effective} onChange={e => setEffective(e.target.value)} /></label>
      </div>
      <label className={styles.check}><input type="checkbox" checked={taxFee} onChange={e => setTaxFee(e.target.checked)} />Apply tax to the service fee as well as the subtotal</label>
      <section className={styles.preview}><h3>Cart preview</h3>
        <label>Example subtotal (USD)<input required type="number" min="0" max="1000000" step="0.01" value={sample} onChange={e => setSample(e.target.value)} /></label>
        {preview ? <dl><div><dt>Subtotal</dt><dd>{money(Math.round(Number(sample) * 100))}</dd></div><div><dt>Service fee</dt><dd>{money(preview.feesCents)}</dd></div><div><dt>Tax</dt><dd>{money(preview.taxCents)}</dd></div><div><dt>Total</dt><dd>{money(preview.totalCents)}</dd></div></dl> : <p>Enter valid amounts to preview.</p>}
      </section>
      <label className={styles.check}><input required type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} />I have reviewed the fee, tax treatment and effective time.</label>
      <button className="btn btn-primary" disabled={!ready || busy || !preview || !ack}>{busy ? "Saving…" : "Schedule rule"}</button>
    </form>
    <section className={styles.panel}><h2>Rule history & scheduled changes</h2><p>Rules are append-only and audited. Scheduling a new rule does not rewrite earlier purchases.</p>
      {rules.map(r => <article className={styles.rule} key={r.id}><strong>{new Date(r.effectiveFrom) > new Date() ? "Scheduled" : rules.find(x => new Date(x.effectiveFrom) <= new Date())?.id === r.id ? "Current" : "Previous"}</strong><p>{new Date(r.effectiveFrom).toLocaleString()} (device local time)</p><p>Service fee: {r.serviceFeeBps / 100}% + {money(r.serviceFeeFlatCents ?? 0)} per order</p><p>Tax: {r.taxBps / 100}% · {r.taxServiceFee ? "Includes service fee" : "Subtotal only"}</p></article>)}
    </section>
  </main>;
}
