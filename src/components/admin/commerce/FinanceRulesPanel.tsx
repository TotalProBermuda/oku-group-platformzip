import Link from "next/link";

export default function FinanceRulesPanel() {
  return <section style={{ margin: "24px 0", padding: 16, border: "1px solid #ddd", borderRadius: 12 }}>
    <h2>Ticket service fees and tax</h2>
    <p>Manage percentage and flat service fees, tax treatment, effective dates and rate history in Checkout Finance. Existing orders retain their original charges.</p>
    <Link href="/admin/checkout-finance" style={{ display: "inline-flex", alignItems: "center", minHeight: 44 }}>Open Checkout Finance →</Link>
  </section>;
}
