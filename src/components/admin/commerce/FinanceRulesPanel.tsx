"use client";
import { useEffect, useState } from "react";

type Rule = { id: string; effectiveFrom: string; serviceFeeBps: number; taxBps: number; taxServiceFee: boolean };
export default function FinanceRulesPanel() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [fee, setFee] = useState("");
  const [tax, setTax] = useState("");
  const [date, setDate] = useState("");
  const [taxFee, setTaxFee] = useState(false);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  async function load() {
    const response = await fetch("/api/v1/admin/commerce/finance-rules", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Unable to load finance rules");
    setRules(data.rules);
  }
  useEffect(() => { load().catch(error => setNotice(error.message)); }, []);
  return <details style={{ margin: "24px 0", padding: 16, border: "1px solid #ddd", borderRadius: 12 }}>
    <summary>Ticket service fees and tax</summary>
    <p>Schedule new rates for future checkouts. Existing orders retain their original charges. Confirm the applicable tax and taxable fee treatment with finance.</p>
    {rules.map(rule => <p key={rule.id}>From {new Date(rule.effectiveFrom).toLocaleString()}: fee {rule.serviceFeeBps / 100}%; tax {rule.taxBps / 100}% on {rule.taxServiceFee ? "subtotal and service fee" : "subtotal only"}.</p>)}
    <form onSubmit={async event => {
      event.preventDefault(); setBusy(true); setNotice("");
      try {
        const response = await fetch("/api/v1/admin/commerce/finance-rules", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ effectiveFrom: new Date(date).toISOString(), serviceFeeBps: Math.round(Number(fee) * 100), taxBps: Math.round(Number(tax) * 100), taxServiceFee: taxFee }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to schedule rates");
        await load(); setNotice("Rates scheduled.");
      } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to save rates"); }
      finally { setBusy(false); }
    }} style={{ display: "grid", gap: 16, maxWidth: 560 }}>
      <label>Service fee (%) <input required type="number" min="0" max="100" step="0.01" value={fee} onChange={e => setFee(e.target.value)} /></label>
      <label>Tax (%) <input required type="number" min="0" max="100" step="0.01" value={tax} onChange={e => setTax(e.target.value)} /></label>
      <label>Effective date (your local time) <input required type="datetime-local" value={date} onChange={e => setDate(e.target.value)} style={{ maxWidth: "100%" }} /></label>
      <label><input type="checkbox" checked={taxFee} onChange={e => setTaxFee(e.target.checked)} /> Include service fee in the taxable amount</label>
      <button disabled={busy} type="submit">{busy ? "Saving…" : "Schedule rates"}</button>
    </form>
    <p role="status">{notice}</p>
  </details>;
}
