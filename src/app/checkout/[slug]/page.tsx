"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { BILLING_COUNTRIES } from "@/lib/billingCountries";
import { formatCardExpiry, parseCardExpiry } from "@/lib/cardExpiry";
import { createCheckoutContinuation, isConfirmedCheckout, isVerificationReturn } from "@/lib/checkoutContinuation";
import { PANAMA_TIME_ZONE } from "@/lib/panamaDateTime";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { useTranslation } from "@/i18n/useTranslation";
import { translations as localeTranslations } from "@/i18n/translationsData";
import EventArtwork from "@/components/ui/EventArtwork";
import { sessionArtworkCandidates } from "@/lib/eventArtwork";
import { sessionProductEnabled } from "@/server/commerce/sessionProducts";

function fmt(cents: number) { return `$${(cents / 100).toFixed(2)}`; }

function safePaymentFailureMessage(environment: unknown, code: unknown, translate: (key: string) => string) {
  if (code === "MISSING_FIELD" || code === "INVALID_DATA" || code === "INVALID_REQUEST") return translate("checkoutErrorPaymentConfig");
  if (code === "GATEWAY_NOT_READY") return translate("checkoutErrorGateway");
  if (code === "CHECKOUT_EXPIRED") return translate("checkoutErrorExpired");
  if (code === "CARDHOLDER_VERIFICATION_FAILED") {
    return translate("checkoutErrorVerification");
  }
  if (code === "INVALID_CHECKOUT_DETAILS") {
    return translate("checkoutErrorDetails");
  }
  // A sandbox never reaches a card issuer. Make that explicit rather than
  // suggesting the guest's real card is defective. We deliberately do not
  // surface raw processor, AVS, fraud, or issuer messages here.
  if (environment === "test") {
    return translate("checkoutErrorSandbox");
  }
  if (code === "BAD_INSTRUMENT") {
    return translate("checkoutErrorInstrument");
  }
  return translate("checkoutErrorDeclined");
}

export default function CheckoutPage() {
  const locale = useLocale();
  const { t } = useTranslation();
  const translate = t;
  const checkoutCommon = localeTranslations[locale]?.common ?? localeTranslations.en.common;
  const { slug } = useParams() as { slug: string };
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();

  const [series, setSeries]       = useState<any>(null);
  const [loading, setLoading]     = useState(true);
  const [quantities, setQty]      = useState<Record<string, number>>({});
  const [addonQty, setAddonQty]   = useState<Record<string, number>>({});
  const [selectedSession, setSession] = useState<string>("");
  const [sessionDeepLinked, setSessionDeepLinked] = useState(false);
  const [quote, setQuote]         = useState<any>(null);
  const [quoting, setQuoting]     = useState(false);
  const [paying, setPaying]       = useState(false);
  const [done, setDone]           = useState(false);
  const [error, setError]         = useState("");
  const [checkoutItems, setCheckoutItems] = useState<any[]>([]);
  const [intentId, setIntentId] = useState<string | null>(null);
  const [secureReady, setSecureReady] = useState(false);
  const [paymentDeclined, setPaymentDeclined] = useState(false);
  const [paymentUnderReview, setPaymentUnderReview] = useState(false);
  const [flexConfig, setFlexConfig] = useState<{ captureContext: string; clientLibrary: string; clientLibraryIntegrity?: string } | null>(null);
  const [expiryInput, setExpiryInput] = useState("");
  // Billing details are deliberately held only in browser memory. They are
  // sent to the payment provider for authorization and are not persisted in
  // the OKÜ order record.
  const [billing, setBilling] = useState({
    address1: "",
    locality: "",
    administrativeArea: "",
    postalCode: "",
    country: "PA",
  });
  const microformRef = useRef<any>(null);
  const [guest, setGuest] = useState({ name: "", email: "", phone: "", marketingEmailConsent: false });
  const [confirmationEmail, setConfirmationEmail] = useState("");
  useEffect(() => {
    if (session?.user?.email) {
      setGuest(current => ({ ...current, email: session.user!.email!, name: current.name || session.user!.name || "" }));
    }
  }, [session?.user?.email, session?.user?.name]);
  const [guestCheckoutToken, setGuestCheckoutToken] = useState<string | undefined>();
  const [transientToken, setTransientToken] = useState<string | null>(null);
  const [payerChallenge, setPayerChallenge] = useState<{ authenticationTransactionId: string; stepUpUrl: string; token: string; cardType?: string } | null>(null);
  const [payerChallengeComplete, setPayerChallengeComplete] = useState(false);
  const [challengeDelayed, setChallengeDelayed] = useState(false);
  const challengeFrame = useRef<HTMLIFrameElement>(null);
  const continuation = useRef(createCheckoutContinuation());

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (isVerificationReturn(event, window.location.origin, challengeFrame.current?.contentWindow)) setPayerChallengeComplete(true);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    if (!payerChallenge) return;
    setPayerChallengeComplete(false);
    setChallengeDelayed(false);
    const form = document.getElementById("oku-3ds-challenge-form") as HTMLFormElement | null;
    form?.submit();
    const timer = window.setTimeout(() => setChallengeDelayed(true), 45000);
    return () => window.clearTimeout(timer);
  }, [payerChallenge]);

  useEffect(() => {
    if (payerChallengeComplete && payerChallenge && !paying && !done && !paymentDeclined && !paymentUnderReview &&
        continuation.current.claimReturn(payerChallenge.authenticationTransactionId)) {
      void completePurchase();
    }
  }, [payerChallengeComplete, payerChallenge, paying, done, paymentDeclined, paymentUnderReview]);

  useEffect(() => {
    fetch(`/api/v1/experiences?slug=${encodeURIComponent(slug)}&locale=${locale}`)
      .then((r) => r.json())
      .then((d) => {
        const s = d.series?.[0];
        setSeries(s);
        const requestedSessionId = new URLSearchParams(window.location.search).get("sessionId");
        const requestedSession = s?.sessions?.find((candidate: any) => candidate.id === requestedSessionId);
        if (requestedSession) {
          setSession(requestedSession.id);
          setSessionDeepLinked(true);
          const firstPublicTicket = s?.ticketTypes?.find((ticket: any) => sessionProductEnabled(requestedSession, s, ticket.id) && !ticket.requiresMembership && !ticket.earlyAccessOnly);
          if (firstPublicTicket) setQty((current) => current[firstPublicTicket.id] ? current : { ...current, [firstPublicTicket.id]: 1 });
        } else {
          setSessionDeepLinked(false);
          if (s?.sessions?.[0]) setSession(s.sessions[0].id);
        }
      })
      .finally(() => setLoading(false));
  }, [slug, locale]);

  useEffect(() => {
    if (!flexConfig) return;
    let cancelled = false;
    (async () => {
      try {
        await new Promise<void>((resolve, reject) => {
          const existing = document.querySelector(`script[src="${flexConfig.clientLibrary}"]`) as HTMLScriptElement | null;
          if (existing && (window as any).Flex) return resolve();
          const script = document.createElement("script");
          script.src = flexConfig.clientLibrary;
          script.crossOrigin = "anonymous";
          if (flexConfig.clientLibraryIntegrity) script.integrity = flexConfig.clientLibraryIntegrity;
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("Cybersource secure card library could not load."));
          document.head.appendChild(script);
        });
        if (cancelled) return;
        const flex = new (window as any).Flex(flexConfig.captureContext);
        const microform = flex.microform({ styles: { input: { "font-size": "16px", color: "#1a1614" } } });
        microform.createField("number", { placeholder: checkoutCommon.checkoutCardNumber }).load("#cybersource-card-number");
        microform.createField("securityCode", { placeholder: checkoutCommon.checkoutSecurityCode }).load("#cybersource-security-code");
        microformRef.current = microform;
        setSecureReady(true);
      } catch {
        if (!cancelled) setError(checkoutCommon.checkoutErrorSecureLoad);
      }
    })();
    return () => { cancelled = true; };
  }, [flexConfig, locale, checkoutCommon]);

  async function getQuote() {
    if (!selectedSession) { setError(t("common", "checkoutErrorSelectSession")); return; }
    const items: any[] = [];
    for (const [id, qty] of Object.entries(quantities)) {
      if (qty > 0) items.push({ ticketTypeId: id, qty });
    }
    for (const [id, qty] of Object.entries(addonQty)) {
      if (qty > 0) items.push({ addonId: id, qty });
    }
    if (!items.length) { setError(t("common", "checkoutErrorSelectTicket")); return; }
    setError("");
    setQuoting(true);
    try {
      const res = await fetch("/api/v1/checkout/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seriesSlug: slug, sessionId: selectedSession, items }),
      });
      const data = await res.json();
      if (!res.ok) { setError(t("common", "checkoutErrorQuote")); setQuoting(false); return; }
      setQuote(data);
      setCheckoutItems(items);
    } catch {
      setError(t("common", "checkoutErrorQuote"));
    }
    setQuoting(false);
  }

  async function initializeSecurePayment() {
    if (sessionStatus === "loading") return;
    if (!quote || !checkoutItems.length) return;
    if (!guest.name.trim() || !guest.email.trim()) { setError(t("common", "checkoutErrorGuest")); return; }
    if (!billing.address1.trim() || !billing.locality.trim() || !billing.administrativeArea.trim() || !billing.postalCode.trim() || !billing.country.trim()) {
      setError(t("common", "checkoutErrorBilling")); return;
    }
    setPaying(true);
    setError("");
    try {
      const intentResponse = await fetch("/api/v1/checkout/intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: quote.sessionId, expectedTotalCents: quote.totalCents, items: checkoutItems, guest: { ...guest, phone: guest.phone.trim() || undefined, locale } }),
      });
      const intentData = await intentResponse.json();
      if (!intentResponse.ok) throw new Error("PAYMENT_SETUP_FAILED");
      const nextIntentId = intentData.data.intentId as string;
      setConfirmationEmail(intentData.data.confirmationEmail ?? guest.email.trim());
      const contextResponse = await fetch("/api/v1/checkout/cybersource/capture-context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intentId: nextIntentId, guestCheckoutToken: intentData.data.guestCheckoutToken }),
      });
      const contextData = await contextResponse.json();
      if (!contextResponse.ok) throw new Error("PAYMENT_SETUP_FAILED");
      setFlexConfig(contextData.data);
      setIntentId(nextIntentId);
      setGuestCheckoutToken(intentData.data.guestCheckoutToken);
    } catch {
      setError(t("common", "checkoutErrorPaymentSetup"));
    }
    setPaying(false);
  }

  /**
   * A declined payment leaves its server-side order immutable so the same
   * gateway request can never be charged twice.  Start again from the quote
   * instead of giving the impression that pressing "pay" a second time is a
   * valid retry against that old order.
   */
  function startFreshPaymentAttempt() {
    if (paying || paymentUnderReview || (payerChallenge && !paymentDeclined)) return;
    microformRef.current = null;
    setFlexConfig(null);
    setSecureReady(false);
    setIntentId(null);
    setGuestCheckoutToken(undefined);
    setTransientToken(null);
    setPayerChallenge(null);
    setPayerChallengeComplete(false);
    setExpiryInput("");
    setPaymentDeclined(false);
    setPaymentUnderReview(false);
    setError("");
    setQuote(null);
    continuation.current = createCheckoutContinuation();
  }

  async function completePurchase() {
    if (done || paymentDeclined || paymentUnderReview) return;
    const expiry = parseCardExpiry(expiryInput);
    if (!intentId || !microformRef.current || !expiry) {
      setError(t("common", "checkoutErrorExpiry")); return;
    }
    const { expirationMonth: expiryMonth, expirationYear: expiryYear } = expiry;
    if (!continuation.current.begin()) return;
    let submitted = false;
    setPaying(true); setError("");
    try {
      const nextTransientToken = transientToken ?? await new Promise<string>((resolve, reject) => {
        microformRef.current.createToken({ expirationMonth: expiryMonth, expirationYear: expiryYear }, (err: any, token: string) => err ? reject(err) : resolve(token));
      });
      setTransientToken(nextTransientToken);
      let payerAuthentication: any;
      if (payerChallenge) {
        if (!payerChallengeComplete) {
          setError(t("common", "checkoutErrorBankStep"));
          setPaying(false);
          return;
        }
        payerAuthentication = { authenticationTransactionId: payerChallenge.authenticationTransactionId, cardType: payerChallenge.cardType };
      } else {
        const setupResponse = await fetch("/api/v1/checkout/cybersource/payer-auth/setup", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ intentId, guestCheckoutToken, transientToken: nextTransientToken }),
        });
        const setup = await setupResponse.json();
        if (!setupResponse.ok) throw new Error("Unable to initialize secure cardholder verification.");
        await collectDeviceData(setup.data.deviceDataCollectionUrl, setup.data.accessToken);
        payerAuthentication = {
          referenceId: setup.data.referenceId,
          browser: browserData(),
          expirationMonth: expiryMonth,
          expirationYear: expiryYear,
        };
      }
      submitted = true;
      const res = await fetch("/api/v1/checkout/confirm", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intentId,
          guestCheckoutToken,
          cybersourceTransientToken: nextTransientToken,
          payerAuthentication,
          billing: {
            address1: billing.address1.trim(),
            locality: billing.locality.trim(),
            administrativeArea: billing.administrativeArea.trim(),
            postalCode: billing.postalCode.trim(),
            country: billing.country.trim().toUpperCase(),
          },
        }),
      });
      const data = await res.json();
      if (res.status === 202 && data?.data?.payerAuthenticationChallenge) {
        setPayerChallenge(data.data.payerAuthenticationChallenge);
        setError("");
        setPaying(false);
        return;
      }
      if (!res.ok) {
        if (res.status >= 500 || data?.data?.code === "PAYMENT_OUTCOME_UNKNOWN") {
          setPaymentUnderReview(true);
          setError(t("common", "checkoutErrorPaymentUnknown"));
          setPaying(false);
          return;
        }
        setPaymentDeclined(true);
        setError(safePaymentFailureMessage(data?.data?.environment, data?.data?.code, (key) => t("common", key)));
        setPaying(false);
        return;
      }
      if (!isConfirmedCheckout(res.status, data)) throw new Error("Unconfirmed checkout response");
      setDone(true);
    } catch {
      // Keep the public message intentionally generic: provider responses can
      // reveal issuer and fraud-decision detail.  The server stores a safe,
      // auditable response code for authorised finance/support staff.
      setPaymentUnderReview(submitted);
      setPaymentDeclined(!submitted);
      setError(submitted
        ? t("common", "checkoutErrorPaymentUnknown")
        : t("common", "checkoutErrorPaymentSetup"));
    } finally {
      continuation.current.finish();
      setPaying(false);
    }
  }

  function browserData() {
    return {
      accept: document.querySelector("meta[http-equiv='Accept']")?.getAttribute("content") || "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      language: navigator.language || "en-US",
      colorDepth: String(window.screen.colorDepth || 24),
      javaEnabled: "N" as const,
      javascriptEnabled: "Y" as const,
      screenHeight: String(window.screen.height),
      screenWidth: String(window.screen.width),
      timeDifference: String(new Date().getTimezoneOffset()),
      userAgent: navigator.userAgent,
    };
  }

  function collectDeviceData(url: string, jwt: string): Promise<void> {
    return new Promise((resolve) => {
      const iframe = document.createElement("iframe");
      iframe.name = "oku-cardinal-collection";
      iframe.style.display = "none";
      iframe.sandbox.add("allow-forms", "allow-scripts", "allow-same-origin", "allow-popups");
      const form = document.createElement("form");
      form.method = "POST"; form.target = iframe.name; form.action = url;
      const input = document.createElement("input");
      input.type = "hidden"; input.name = "JWT"; input.value = jwt; form.appendChild(input);
      const finish = () => { window.removeEventListener("message", listener); setTimeout(() => { form.remove(); iframe.remove(); }, 0); resolve(); };
      const listener = (event: MessageEvent) => { if (event.origin.includes("cardinalcommerce.com")) finish(); };
      window.addEventListener("message", listener);
      document.body.append(iframe, form); form.submit();
      // CyberSource permits a 10-second timeout if the profile callback is delayed.
      window.setTimeout(finish, 10_000);
    });
  }

  if (loading) return (
    <div className="page-container" style={{ padding: "80px 24px", textAlign: "center" }}>
      <div className="loading-spinner" style={{ margin: "0 auto" }} />
    </div>
  );

  if (!series) return (
    <div className="page-container" style={{ padding: "80px 24px", textAlign: "center" }}>
      <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 28, color: "#1a1614" }}>{t("common", "experienceNotFound")}</h2>
      <Link href="/experiences" style={{ color: "#c41e3a" }}>{t("common", "browseExperiences")}</Link>
    </div>
  );

  if (done) return (
    <div className="page-container" style={{ padding: "80px 24px", maxWidth: 560, textAlign: "center" }}>
      <div style={{ fontSize: 48, marginBottom: 24 }}>✓</div>
      <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 36, color: "#1a1614", marginBottom: 12 }}>{t("common", "checkoutBookedTitle")}</h2>
      <p style={{ fontSize: 16, color: "#6b7280", marginBottom: 12 }}>{t("common", "checkoutBookedLead")} <strong>{series.title}</strong> {t("common", "checkoutBookedTail")} {confirmationEmail}.</p>
      <p style={{ fontSize: 14, color: "#6b7280", lineHeight: 1.55, margin: "0 0 32px" }}>
        Your booking is linked to this email. Use a one-time secure email link whenever you want to view your tickets—no password or Google account is required.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center" }}>
        <Link href="/my/tickets" className="btn btn-primary">{t("common", "checkoutAccessTickets")}</Link>
        <Link href="/experiences" className="btn btn-ghost">{t("common", "checkoutMoreExperiences")}</Link>
      </div>
      <p style={{ marginTop: 24 }}><Link href="/save-to-phone">{t("common", "checkoutSavePhone")}</Link> {t("common", "checkoutSavePhoneTail")}</p>
    </div>
  );

  const sessions    = series.sessions    ?? [];
  const activeSession = sessions.find((event: any) => event.id === selectedSession);
  const ticketPriceForSession = (ticket: any) => activeSession?.ticketPrices?.find((price: any) => price.ticketTypeId === ticket.id)?.priceCents ?? ticket.priceCents;
  const ticketTypes = series.ticketTypes ?? [];
  const availableTicketTypes = activeSession
    ? ticketTypes.filter((ticket: any) => sessionProductEnabled(activeSession, series, ticket.id))
    : ticketTypes;
  const addons      = series.addons      ?? [];
  const checkoutArtwork = activeSession ? sessionArtworkCandidates(activeSession, locale, series) : [];

  return (
    <div>
      <div style={{ background: "#fafaf9", borderBottom: "1px solid #e5e0d8", padding: "32px 0" }}>
        <div className="page-container">
          <Link href={`/experiences/${slug}`} style={{ fontSize: 13, color: "#9ca3af", textDecoration: "none" }}>{t("common", "checkoutBackToSeries")} {series.title}</Link>
          {activeSession && <p style={{ color: "#6b7280", fontSize: 14, margin: "10px 0 0" }}>{series.title}{activeSession.title ? ` · ${activeSession.title}` : ""}{activeSession.subtitle ? ` · ${activeSession.subtitle}` : ""} · {new Date(activeSession.startsAt).toLocaleString(locale === "es" ? "es-PA" : locale === "pt" ? "pt-BR" : "en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: PANAMA_TIME_ZONE })} (Panama)</p>}
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 400, color: "#1a1614", margin: "12px 0 0", letterSpacing: "-0.02em" }}>
            {quote ? t("common", "checkoutReviewPay") : t("common", "selectTicketsLabel")}
          </h1>
        </div>
      </div>

      <div className="page-container checkout-layout" style={{ padding: "40px 24px", display: "grid", gridTemplateColumns: "minmax(0, 1fr) 360px", gap: 48, alignItems: "start" }}>
        {!quote ? (
          <>
            {/* Step 1: Selection */}
            <div>
              {/* Session selector */}
              {sessions.length > 1 && !sessionDeepLinked && (
                <section style={{ marginBottom: 32 }}>
                  <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 22, fontWeight: 400, color: "#1a1614", marginBottom: 16 }}>{t("common", "checkoutChooseSession")}</h2>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {sessions.map((s: any) => (
                      <label key={s.id} style={{ display: "flex", gap: 14, alignItems: "center", padding: "14px 16px", border: `1px solid ${selectedSession === s.id ? "#c41e3a" : "#e5e0d8"}`, borderRadius: 10, cursor: "pointer", background: selectedSession === s.id ? "#fff9f9" : "white" }}>
                        <input type="radio" name="session" value={s.id} checked={selectedSession === s.id} onChange={() => {
                          setSession(s.id);
                          const allowed = new Set(ticketTypes.filter((ticket: any) => sessionProductEnabled(s, series, ticket.id)).map((ticket: any) => ticket.id));
                          setQty(current => Object.fromEntries(Object.entries(current).filter(([id]) => allowed.has(id))));
                        }} />
                        <div>
                          <div style={{ fontWeight: 600, color: "#1a1614" }}>{series.title}{s.title ? ` · ${s.title}` : ""}</div>
                          <div style={{ fontSize: 13, color: "#6b7280" }}>{new Date(s.startsAt).toLocaleDateString(locale === "es" ? "es-PA" : locale === "pt" ? "pt-BR" : "en-US", { weekday: "long", month: "long", day: "numeric", timeZone: PANAMA_TIME_ZONE })} · {new Date(s.startsAt).toLocaleTimeString(locale === "es" ? "es-PA" : locale === "pt" ? "pt-BR" : "en-US", { hour: "numeric", minute: "2-digit", timeZone: PANAMA_TIME_ZONE })} (Panama)</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </section>
              )}

              {/* Ticket types */}
              <section style={{ marginBottom: 32 }}>
                <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 22, fontWeight: 400, color: "#1a1614", marginBottom: 16 }}>{t("common", "checkoutTickets")}</h2>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {availableTicketTypes.map((t: any) => {
                    const qty = quantities[t.id] ?? 0;
                    return (
                      <div key={t.id} style={{ background: "white", border: "1px solid #e5e0d8", borderRadius: 12, padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <div style={{ fontWeight: 600, color: "#1a1614" }}>{t.name}</div>
                          {t.description && <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>{t.description}</div>}
                          <div style={{ fontSize: 14, color: "#c41e3a", fontWeight: 700, marginTop: 4 }}>${(ticketPriceForSession(t) / 100).toFixed(2)}</div>
                          {t.requiresMembership && <div style={{ fontSize: 11, color: "#c41e3a", fontWeight: 600 }}>{translate("common", "membersOnly")}</div>}
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
                  <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 22, fontWeight: 400, color: "#1a1614", marginBottom: 16 }}>{t("common", "addOns")} <span style={{ fontSize: 14, fontWeight: 400, color: "#9ca3af" }}>{t("common", "checkoutOptional")}</span></h2>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {addons.map((a: any) => {
                      const qty = addonQty[a.id] ?? 0;
                      return (
                        <div key={a.id} style={{ background: "white", border: "1px solid #e5e0d8", borderRadius: 12, padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div>
                            <div style={{ fontWeight: 600, color: "#1a1614" }}>{a.name}</div>
                            {a.description && <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>{a.description}</div>}
                            <div style={{ fontSize: 14, color: "#6b7280", marginTop: 4 }}>{a.priceCents === 0 ? t("common", "checkoutFree") : `$${(a.priceCents / 100).toFixed(0)}`}</div>
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
                {checkoutArtwork.length > 0 ? <div style={{ aspectRatio: "4 / 5", maxHeight: 280, margin: "0 auto 18px", overflow: "hidden", borderRadius: 10, background: "#f4eee8" }}><EventArtwork candidates={checkoutArtwork} alt={`${series.title}${activeSession?.title ? ` — ${activeSession.title}` : ""}`} style={{ width: "100%", height: "100%", objectFit: "contain" }} /></div> : null}
                <div style={{ fontFamily: "var(--font-heading)", fontSize: 18, color: "#1a1614", marginBottom: 4 }}>{series.title}</div>
                {activeSession && <div style={{ fontSize: 13, color: "#7c7168", marginBottom: 16 }}>{activeSession.title}{activeSession.subtitle ? ` · ${activeSession.subtitle}` : ""}</div>}
                <h3 style={{ fontFamily: "var(--font-heading)", fontSize: 20, fontWeight: 400, color: "#1a1614", marginBottom: 20 }}>{t("common", "checkoutOrderSummary")}</h3>
                {ticketTypes.filter((t: any) => (quantities[t.id] ?? 0) > 0).map((t: any) => (
                  <div key={t.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 10 }}>
                    <span>{t.name} × {quantities[t.id]}</span>
                    <span>${((ticketPriceForSession(t) * quantities[t.id]) / 100).toFixed(2)}</span>
                  </div>
                ))}
                {addons.filter((a: any) => (addonQty[a.id] ?? 0) > 0).map((a: any) => (
                  <div key={a.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 10, color: "#6b7280" }}>
                    <span>{a.name} × {addonQty[a.id]}</span>
                    <span>${((a.priceCents * addonQty[a.id]) / 100).toFixed(2)}</span>
                  </div>
                ))}
                <div style={{ borderTop: "1px solid #e5e0d8", marginTop: 16, paddingTop: 16, display: "flex", justifyContent: "space-between", fontWeight: 600 }}>
                  <span>{t("common", "checkoutEstimatedTotal")}</span>
                  <span>${Object.entries(quantities).reduce((sum, [id, qty]) => {
                    const t = ticketTypes.find((tt: any) => tt.id === id);
                    return sum + (t ? ticketPriceForSession(t) * qty : 0);
                  }, Object.entries(addonQty).reduce((sum, [id, qty]) => {
                    const a = addons.find((aa: any) => aa.id === id);
                    return sum + (a ? a.priceCents * qty : 0);
                  }, 0)) / 100 || 0}+</span>
                </div>
                <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 8 }}>{t("common", "checkoutQuoteNote")}</p>
                <button onClick={getQuote} disabled={quoting} className="btn btn-primary" style={{ width: "100%", marginTop: 20, padding: "14px" }}>
                  {quoting ? t("common", "checkoutGettingQuote") : t("common", "checkoutReviewOrder")}
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Step 2: Review & pay */}
            <div>
              <div style={{ background: "white", border: "1px solid #e5e0d8", borderRadius: 16, padding: "28px" }}>
                <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 24, fontWeight: 400, color: "#1a1614", marginBottom: 24 }}>{t("common", "checkoutOrderDetails")}</h2>

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
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "#6b7280" }}><span>{t("common", "subtotalLabel")}</span><span>{fmt(quote.subtotalCents)}</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "#6b7280" }}><span>{t("common", "checkoutServiceFee")}</span><span>{fmt(quote.feesCents)}</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "#6b7280" }}><span>{t("common", "checkoutTax")}</span><span>{fmt(quote.taxCents)}</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16, fontWeight: 700, color: "#1a1614", borderTop: "1px solid #e5e0d8", paddingTop: 12, marginTop: 4 }}><span>{t("common", "totalLabel").replace(/:$/, "")}</span><span>{fmt(quote.totalCents)}</span></div>
                  {quote.memberDiscount && <div style={{ fontSize: 12, color: "#16a34a", fontWeight: 600 }}>{t("common", "checkoutMemberDiscount")}</div>}
                </div>

                <div style={{ marginTop: 28, background: "#fafaf9", border: "1px solid #e5e0d8", borderRadius: 12, padding: "20px" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#6b625c", marginBottom: 12 }}>{t("common", "checkoutSecureCardPayment")}</div>
                  {!intentId ? (
                    <>
                      <div style={{ display: "grid", gap: 10, marginBottom: 16 }}>
                        <input aria-label={translate("common", "fullNameLabel")} autoComplete="name" value={guest.name} onChange={(event) => setGuest((current) => ({ ...current, name: event.target.value }))} placeholder={translate("common", "fullNameLabel")} style={{ padding: "10px 12px", border: "1px solid #d8d2ca", borderRadius: 8, fontSize: 16 }} />
                        <input aria-label={translate("common", "emailLabel")} type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} readOnly={Boolean(session?.user?.email)} value={guest.email} onChange={(event) => setGuest((current) => ({ ...current, email: event.target.value }))} placeholder={translate("common", "checkoutEmailConfirmation")} style={{ padding: "10px 12px", border: "1px solid #d8d2ca", borderRadius: 8, fontSize: 16 }} />
                        <input aria-label={translate("common", "checkoutPhoneOptional")} type="tel" autoComplete="tel" value={guest.phone} onChange={(event) => setGuest((current) => ({ ...current, phone: event.target.value }))} placeholder={translate("common", "checkoutPhoneOptional")} style={{ padding: "10px 12px", border: "1px solid #d8d2ca", borderRadius: 8, fontSize: 16 }} />
                        <div style={{ marginTop: 8 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "#4b5563", marginBottom: 8 }}>{translate("common", "checkoutBillingAddress")}</div>
                          <div className="checkout-billing" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                            <input aria-label={translate("common", "checkoutStreetAddress")} value={billing.address1} onChange={(event) => setBilling((current) => ({ ...current, address1: event.target.value }))} placeholder={translate("common", "checkoutStreetAddress")} style={{ gridColumn: "1 / -1", padding: "10px 12px", border: "1px solid #d8d2ca", borderRadius: 8, fontSize: 14 }} />
                            <input aria-label={translate("common", "checkoutCity")} value={billing.locality} onChange={(event) => setBilling((current) => ({ ...current, locality: event.target.value }))} placeholder={translate("common", "checkoutCity")} style={{ padding: "10px 12px", border: "1px solid #d8d2ca", borderRadius: 8, fontSize: 14 }} />
                            <input aria-label={translate("common", "checkoutStateProvince")} value={billing.administrativeArea} onChange={(event) => setBilling((current) => ({ ...current, administrativeArea: event.target.value }))} placeholder={translate("common", "checkoutStateProvince")} style={{ padding: "10px 12px", border: "1px solid #d8d2ca", borderRadius: 8, fontSize: 14 }} />
                            <input aria-label={translate("common", "checkoutPostalCode")} value={billing.postalCode} onChange={(event) => setBilling((current) => ({ ...current, postalCode: event.target.value }))} placeholder={translate("common", "checkoutPostalCode")} style={{ padding: "10px 12px", border: "1px solid #d8d2ca", borderRadius: 8, fontSize: 14 }} />
                            <select aria-label={translate("common", "checkoutBillingAddress")} value={billing.country} onChange={(event) => setBilling((current) => ({ ...current, country: event.target.value }))} style={{ padding: "10px 12px", border: "1px solid #d8d2ca", borderRadius: 8, fontSize: 14, background: "white" }}>
                              {BILLING_COUNTRIES.map((country) => (
                                <option key={country.code} value={country.code}>
                                  {country.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <label style={{ display: "flex", gap: 8, fontSize: 12, color: "#4b5563" }}><input type="checkbox" checked={guest.marketingEmailConsent} onChange={(event) => setGuest((current) => ({ ...current, marketingEmailConsent: event.target.checked }))} />{translate("common", "checkoutMarketingConsent")}</label>
                      </div>
                      <p style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.5, margin: "0 0 16px" }}>{translate("common", "checkoutPrivacyNote")}</p>
                      {session?.user?.email && <p style={{ fontSize: 14 }}>{translate("common", "checkoutSignedInNotice")} <strong>{session.user.email}</strong>. {translate("common", "checkoutSignedInTail")}</p>}
                      <button onClick={initializeSecurePayment} disabled={paying || sessionStatus === "loading"} className="btn btn-primary" style={{ width: "100%" }}>
                        {paying ? translate("common", "checkoutPreparingCard") : translate("common", "checkoutContinueCard")}
                      </button>
                    </>
                  ) : (
                    <div className="cybersource-payment-fields" style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
                      {!secureReady && <div style={{ gridColumn: "1 / -1", fontSize: 13, color: "#6b7280" }}>{translate("common", "checkoutLoadingCard")}</div>}
                      <div id="cybersource-card-number" className="cybersource-field" style={{ gridColumn: "1 / -1" }} />
                      <input
                        aria-label={translate("common", "checkoutExpiry")}
                        inputMode="numeric"
                        autoComplete="cc-exp"
                        dir="ltr"
                        maxLength={7}
                        placeholder={translate("common", "checkoutExpiry")}
                        value={expiryInput}
                        onChange={(e) => setExpiryInput(formatCardExpiry(e.target.value))}
                        style={{ padding: "10px 12px", border: "1px solid #d8d2ca", borderRadius: 8, fontSize: 14 }}
                      />
                      <div id="cybersource-security-code" className="cybersource-field" style={{ gridColumn: "1 / -1" }} />
                    </div>
                  )}
                  {payerChallenge && (
                    <div style={{ marginTop: 16, padding: 16, background: "#fff", border: "1px solid #d8d2ca", borderRadius: 8 }}>
                      <strong>{translate("common", "checkoutVerifyBank")}</strong>
                      <p style={{ fontSize: 13, color: "#6b7280", margin: "8px 0 12px" }}>{translate("common", "checkoutVerifyBankHint")}</p>
                      <iframe ref={challengeFrame} name="oku-3ds-challenge" title={translate("common", "checkoutVerifyBank")} aria-hidden={payerChallengeComplete} tabIndex={payerChallengeComplete ? -1 : undefined} style={{ display: payerChallengeComplete ? "none" : "block", width: "100%", minHeight: 420, border: 0 }} />
                      <form id="oku-3ds-challenge-form" method="POST" target="oku-3ds-challenge" action={payerChallenge.stepUpUrl}>
                        <input type="hidden" name="JWT" value={payerChallenge.token} />
                      </form>
                      <p role="status" style={{ fontSize: 14, marginTop: 12 }}>
                        {paymentUnderReview ? translate("common", "checkoutReviewPaymentStatus") : paymentDeclined ? translate("common", "checkoutDeclinedStatus") : payerChallengeComplete ? translate("common", "checkoutReturnedStatus") : challengeDelayed ? translate("common", "checkoutDelayedStatus") : translate("common", "checkoutWaitingBankStatus")}
                      </p>
                    </div>
                  )}
                </div>

                {error && <div style={{ color: "#dc2626", fontSize: 14, marginTop: 16, padding: "12px 16px", background: "#fef2f2", borderRadius: 8, border: "1px solid #fecaca" }}>{error}</div>}
                {paymentUnderReview && <Link href="/my/orders" className="btn btn-ghost">{translate("common", "checkoutCheckOrders")}</Link>}
                {paymentDeclined && (
                  <button type="button" onClick={startFreshPaymentAttempt} className="btn btn-ghost" style={{ marginTop: 14, width: "100%" }}>
                    {translate("common", "checkoutFreshAttempt")}
                  </button>
                )}
              </div>

              <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
                <button onClick={startFreshPaymentAttempt} disabled={paying || paymentUnderReview || Boolean(payerChallenge)} className="btn btn-ghost" style={{ flex: 1 }}>{translate("common", "checkoutBack")}</button>
                <button onClick={completePurchase} disabled={paying || !secureReady || paymentDeclined || paymentUnderReview || Boolean(payerChallenge && !payerChallengeComplete)} className="btn btn-primary" style={{ flex: 2, padding: "14px" }}>
                  {paying ? translate("common", "checkoutProcessing") : payerChallenge && !payerChallengeComplete ? translate("common", "checkoutWaitingBank") : `${translate("common", "checkoutConfirmPay")} ${fmt(quote.totalCents)}`}
                </button>
              </div>
            </div>

            <div style={{ position: "sticky", top: 80 }}>
              <div style={{ background: "white", border: "1px solid #e5e0d8", borderRadius: 16, padding: "24px" }}>
                {checkoutArtwork.length > 0 ? <div style={{ aspectRatio: "4 / 5", maxHeight: 280, margin: "0 auto 18px", overflow: "hidden", borderRadius: 10, background: "#f4eee8" }}><EventArtwork candidates={checkoutArtwork} alt={`${series.title}${activeSession?.title ? ` — ${activeSession.title}` : ""}`} style={{ width: "100%", height: "100%", objectFit: "contain" }} /></div> : null}
                <h3 style={{ fontFamily: "var(--font-heading)", fontSize: 20, fontWeight: 400, color: "#1a1614", marginBottom: 12 }}>{series.title}</h3>
                {activeSession?.title ? <p style={{ fontSize: 14, color: "#6b625c", margin: "-6px 0 10px" }}>{activeSession.title}{activeSession.subtitle ? ` · ${activeSession.subtitle}` : ""}</p> : null}
                {activeSession && <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 10 }}>{new Date(activeSession.startsAt).toLocaleString(locale === "es" ? "es-PA" : locale === "pt" ? "pt-BR" : "en-US", { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: PANAMA_TIME_ZONE })} · Panama</div>}
                {series.city && <div style={{ fontSize: 13, color: "#9ca3af" }}>{series.city}</div>}
                {series.venueAddress && <div style={{ fontSize: 13, color: "#9ca3af", marginTop: 4 }}>{series.venueAddress}</div>}
              </div>
            </div>
          </>
        )}
      </div>
      <style jsx>{`
        .cybersource-field {
          display: flex;
          align-items: center;
          height: 48px;
          min-height: 48px;
          overflow: hidden;
          padding: 0 12px;
          background: #fff;
          border: 1px solid #d8d2ca;
          border-radius: 8px;
        }
        .cybersource-field :global(iframe) {
          display: block;
          width: 100% !important;
          height: 28px !important;
          min-height: 28px !important;
          border: 0;
        }
        @media (max-width: 820px) {
          .checkout-layout { grid-template-columns: 1fr !important; gap: 24px !important; }
        }
      `}</style>
    </div>
  );
}
