"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";

function fmt(cents: number) { return `$${(cents / 100).toFixed(2)}`; }

export default function CheckoutPage() {
  const { slug } = useParams() as { slug: string };
  const router = useRouter();

  const [series, setSeries]       = useState<any>(null);
  const [loading, setLoading]     = useState(true);
  const [quantities, setQty]      = useState<Record<string, number>>({});
  const [addonQty, setAddonQty]   = useState<Record<string, number>>({});
  const [selectedSession, setSession] = useState<string>("");
  const [quote, setQuote]         = useState<any>(null);
  const [quoting, setQuoting]     = useState(false);
  const [paying, setPaying]       = useState(false);
  const [done, setDone]           = useState(false);
  const [error, setError]         = useState("");

  useEffect(() => {
    fetch(`/api/v1/experiences?slug=${slug}`)
      .then((r) => r.json())
      .then((d) => {
        const s = d.series?.[0];
        setSeries(s);
        if (s?.sessions?.[0]) setSession(s.sessions[0].id);
      })
      .finally(() => setLoading(false));
  }, [slug]);

  async function getQuote() {
    if (!selectedSession) { setError("Please select a session"); return; }
    const items: any[] = [];
    for (const [id, qty] of Object.entries(quantities)) {
      if (qty > 0) items.push({ ticketTypeId: id, qty });
    }
    for (const [id, qty] of Object.entries(addonQty)) {
      if (qty > 0) items.push({ addonId: id, qty });
    }
    if (!items.length) { setError("Please select at least one ticket"); return; }
    setError("");
    setQuoting(true);
    try {
      const res = await fetch("/api/v1/checkout/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seriesSlug: slug, sessionId: selectedSession, items }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Quote failed"); setQuoting(false); return; }
      setQuote(data);
    } catch {
      setError("Unable to get a quote. Please try again.");
    }
    setQuoting(false);
  }

  async function completePurchase() {
    if (!quote) return;
    setPaying(true);
    setError("");
    try {
      // Demo payment — creates order directly
      const res = await fetch("/api/v1/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...quote, paymentMethod: "DEMO" }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Payment failed"); setPaying(false); return; }
      setDone(true);
    } catch {
      setError("Payment failed. Please try again.");
    }
    setPaying(false);
  }

  if (loading) return (
    <div className="page-container" style={{ padding: "80px 24px", textAlign: "center" }}>
      <div className="loading-spinner" style={{ margin: "0 auto" }} />
    </div>
  );

  if (!series) return (
    <div className="page-container" style={{ padding: "80px 24px", textAlign: "center" }}>
      <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 28, color: "#1a1614" }}>Experience not found</h2>
      <Link href="/experiences" style={{ color: "#c41e3a" }}>Browse Experiences</Link>
    </div>
  );

  if (done) return (
    <div className="page-container" style={{ padding: "80px 24px", maxWidth: 560, textAlign: "center" }}>
      <div style={{ fontSize: 48, marginBottom: 24 }}>✓</div>
      <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 36, color: "#1a1614", marginBottom: 12 }}>You're booked!</h2>
      <p style={{ fontSize: 16, color: "#6b7280", marginBottom: 32 }}>Your tickets for <strong>{series.title}</strong> have been confirmed. Check your ticket wallet for the QR code.</p>
      <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
        <Link href="/my/tickets" className="btn btn-primary">View My Tickets</Link>
        <Link href="/experiences" className="btn btn-ghost">More Experiences</Link>
      </div>
    </div>
  );

  const sessions    = series.sessions    ?? [];
  const ticketTypes = series.ticketTypes ?? [];
  const addons      = series.addons      ?? [];

  return (
    <div>
      <div style={{ background: "#fafaf9", borderBottom: "1px solid #e5e0d8", padding: "32px 0" }}>
        <div className="page-container">
          <Link href={`/experiences/${slug}`} style={{ fontSize: 13, color: "#9ca3af", textDecoration: "none" }}>← Back to {series.title}</Link>
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 400, color: "#1a1614", margin: "12px 0 0", letterSpacing: "-0.02em" }}>
            {quote ? "Review & Pay" : "Select Tickets"}
          </h1>
        </div>
      </div>

      <div className="page-container" style={{ padding: "40px 24px", display: "grid", gridTemplateColumns: "1fr 360px", gap: 48, alignItems: "start" }}>
        {!quote ? (
          <>
            {/* Step 1: Selection */}
            <div>
              {/* Session selector */}
              {sessions.length > 1 && (
                <section style={{ marginBottom: 32 }}>
                  <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 22, fontWeight: 400, color: "#1a1614", marginBottom: 16 }}>Choose a Session</h2>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {sessions.map((s: any) => (
                      <label key={s.id} style={{ display: "flex", gap: 14, alignItems: "center", padding: "14px 16px", border: `1px solid ${selectedSession === s.id ? "#c41e3a" : "#e5e0d8"}`, borderRadius: 10, cursor: "pointer", background: selectedSession === s.id ? "#fff9f9" : "white" }}>
                        <input type="radio" name="session" value={s.id} checked={selectedSession === s.id} onChange={() => setSession(s.id)} />
                        <div>
                          <div style={{ fontWeight: 600, color: "#1a1614" }}>{s.title ?? "Session"}</div>
                          <div style={{ fontSize: 13, color: "#6b7280" }}>{new Date(s.startsAt).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} · {new Date(s.startsAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </section>
              )}

              {/* Ticket types */}
              <section style={{ marginBottom: 32 }}>
                <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 22, fontWeight: 400, color: "#1a1614", marginBottom: 16 }}>Tickets</h2>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {ticketTypes.map((t: any) => {
                    const qty = quantities[t.id] ?? 0;
                    return (
                      <div key={t.id} style={{ background: "white", border: "1px solid #e5e0d8", borderRadius: 12, padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <div style={{ fontWeight: 600, color: "#1a1614" }}>{t.name}</div>
                          {t.description && <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>{t.description}</div>}
                          <div style={{ fontSize: 14, color: "#c41e3a", fontWeight: 700, marginTop: 4 }}>${(t.priceCents / 100).toFixed(0)}</div>
                          {t.requiresMembership && <div style={{ fontSize: 11, color: "#c41e3a", fontWeight: 600 }}>Members only</div>}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <button onClick={() => setQty((p) => ({ ...p, [t.id]: Math.max(0, (p[t.id] ?? 0) - 1) }))} style={{ width: 32, height: 32, border: "1px solid #e5e0d8", borderRadius: 8, background: "white", cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
                          <span style={{ minWidth: 20, textAlign: "center", fontWeight: 600 }}>{qty}</span>
                          <button onClick={() => setQty((p) => ({ ...p, [t.id]: Math.min(t.maxPerOrder ?? 10, (p[t.id] ?? 0) + 1) }))} style={{ width: 32, height: 32, border: "1px solid #e5e0d8", borderRadius: 8, background: "white", cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Add-ons */}
              {addons.length > 0 && (
                <section style={{ marginBottom: 32 }}>
                  <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 22, fontWeight: 400, color: "#1a1614", marginBottom: 16 }}>Add-Ons <span style={{ fontSize: 14, fontWeight: 400, color: "#9ca3af" }}>Optional</span></h2>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {addons.map((a: any) => {
                      const qty = addonQty[a.id] ?? 0;
                      return (
                        <div key={a.id} style={{ background: "white", border: "1px solid #e5e0d8", borderRadius: 12, padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div>
                            <div style={{ fontWeight: 600, color: "#1a1614" }}>{a.name}</div>
                            {a.description && <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>{a.description}</div>}
                            <div style={{ fontSize: 14, color: "#6b7280", marginTop: 4 }}>{a.priceCents === 0 ? "Free" : `$${(a.priceCents / 100).toFixed(0)}`}</div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <button onClick={() => setAddonQty((p) => ({ ...p, [a.id]: Math.max(0, (p[a.id] ?? 0) - 1) }))} style={{ width: 32, height: 32, border: "1px solid #e5e0d8", borderRadius: 8, background: "white", cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
                            <span style={{ minWidth: 20, textAlign: "center", fontWeight: 600 }}>{qty}</span>
                            <button onClick={() => setAddonQty((p) => ({ ...p, [a.id]: Math.min(5, (p[a.id] ?? 0) + 1) }))} style={{ width: 32, height: 32, border: "1px solid #e5e0d8", borderRadius: 8, background: "white", cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {error && <div style={{ color: "#dc2626", fontSize: 14, marginBottom: 16, padding: "12px 16px", background: "#fef2f2", borderRadius: 8, border: "1px solid #fecaca" }}>{error}</div>}
            </div>

            {/* Right: summary */}
            <div style={{ position: "sticky", top: 80 }}>
              <div style={{ background: "white", border: "1px solid #e5e0d8", borderRadius: 16, padding: "24px", boxShadow: "0 4px 24px rgba(0,0,0,0.06)" }}>
                <h3 style={{ fontFamily: "var(--font-heading)", fontSize: 20, fontWeight: 400, color: "#1a1614", marginBottom: 20 }}>Order Summary</h3>
                {ticketTypes.filter((t: any) => (quantities[t.id] ?? 0) > 0).map((t: any) => (
                  <div key={t.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 10 }}>
                    <span>{t.name} × {quantities[t.id]}</span>
                    <span>${((t.priceCents * quantities[t.id]) / 100).toFixed(2)}</span>
                  </div>
                ))}
                {addons.filter((a: any) => (addonQty[a.id] ?? 0) > 0).map((a: any) => (
                  <div key={a.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 10, color: "#6b7280" }}>
                    <span>{a.name} × {addonQty[a.id]}</span>
                    <span>${((a.priceCents * addonQty[a.id]) / 100).toFixed(2)}</span>
                  </div>
                ))}
                <div style={{ borderTop: "1px solid #e5e0d8", marginTop: 16, paddingTop: 16, display: "flex", justifyContent: "space-between", fontWeight: 600 }}>
                  <span>Estimated Total</span>
                  <span>${Object.entries(quantities).reduce((sum, [id, qty]) => {
                    const t = ticketTypes.find((tt: any) => tt.id === id);
                    return sum + (t ? t.priceCents * qty : 0);
                  }, Object.entries(addonQty).reduce((sum, [id, qty]) => {
                    const a = addons.find((aa: any) => aa.id === id);
                    return sum + (a ? a.priceCents * qty : 0);
                  }, 0)) / 100 || 0}+</span>
                </div>
                <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 8 }}>Final price shown after quote. Includes service fees & tax.</p>
                <button onClick={getQuote} disabled={quoting} className="btn btn-primary" style={{ width: "100%", marginTop: 20, padding: "14px" }}>
                  {quoting ? "Getting Quote…" : "Review Order →"}
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Step 2: Review & pay */}
            <div>
              <div style={{ background: "white", border: "1px solid #e5e0d8", borderRadius: 16, padding: "28px" }}>
                <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 24, fontWeight: 400, color: "#1a1614", marginBottom: 24 }}>Order Details</h2>

                {quote.lineItems.map((li: any, i: number) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid #f3f4f6" }}>
                    <div>
                      <div style={{ fontWeight: 600, color: "#1a1614" }}>{li.nameSnapshot}</div>
                      <div style={{ fontSize: 13, color: "#9ca3af" }}>{li.qty} × {fmt(li.unitPriceCents)}</div>
                    </div>
                    <div style={{ fontWeight: 600, color: "#1a1614" }}>{fmt(li.totalCents)}</div>
                  </div>
                ))}

                <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "#6b7280" }}><span>Subtotal</span><span>{fmt(quote.subtotalCents)}</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "#6b7280" }}><span>Service fee (5%)</span><span>{fmt(quote.feesCents)}</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "#6b7280" }}><span>Tax (8.4%)</span><span>{fmt(quote.taxCents)}</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16, fontWeight: 700, color: "#1a1614", borderTop: "1px solid #e5e0d8", paddingTop: 12, marginTop: 4 }}><span>Total</span><span>{fmt(quote.totalCents)}</span></div>
                  {quote.memberDiscount && <div style={{ fontSize: 12, color: "#16a34a", fontWeight: 600 }}>Member discount applied</div>}
                </div>

                {/* Demo payment form */}
                <div style={{ marginTop: 28, background: "#fafaf9", border: "1px solid #e5e0d8", borderRadius: 12, padding: "20px" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#9ca3af", marginBottom: 16 }}>Demo Payment</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                    <input readOnly value="4242 4242 4242 4242" style={{ padding: "10px 12px", border: "1px solid #e5e0d8", borderRadius: 8, fontSize: 14, background: "#f9fafb", color: "#6b7280", gridColumn: "1/-1" }} />
                    <input readOnly value="12/28" style={{ padding: "10px 12px", border: "1px solid #e5e0d8", borderRadius: 8, fontSize: 14, background: "#f9fafb", color: "#6b7280" }} />
                    <input readOnly value="123" style={{ padding: "10px 12px", border: "1px solid #e5e0d8", borderRadius: 8, fontSize: 14, background: "#f9fafb", color: "#6b7280" }} />
                  </div>
                  <p style={{ fontSize: 12, color: "#9ca3af", margin: 0 }}>This is a demo environment — no real payment is processed.</p>
                </div>

                {error && <div style={{ color: "#dc2626", fontSize: 14, marginTop: 16, padding: "12px 16px", background: "#fef2f2", borderRadius: 8, border: "1px solid #fecaca" }}>{error}</div>}
              </div>

              <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
                <button onClick={() => setQuote(null)} className="btn btn-ghost" style={{ flex: 1 }}>← Back</button>
                <button onClick={completePurchase} disabled={paying} className="btn btn-primary" style={{ flex: 2, padding: "14px" }}>
                  {paying ? "Processing…" : `Confirm & Pay ${fmt(quote.totalCents)}`}
                </button>
              </div>
            </div>

            <div style={{ position: "sticky", top: 80 }}>
              <div style={{ background: "white", border: "1px solid #e5e0d8", borderRadius: 16, padding: "24px" }}>
                <h3 style={{ fontFamily: "var(--font-heading)", fontSize: 20, fontWeight: 400, color: "#1a1614", marginBottom: 12 }}>{series.title}</h3>
                <div style={{ fontSize: 13, color: "#9ca3af" }}>{series.city ?? "New York"}</div>
                {series.venueAddress && <div style={{ fontSize: 13, color: "#9ca3af", marginTop: 4 }}>{series.venueAddress}</div>}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
