"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  intentId: string;
  guestCheckoutToken?: string;
  totalLabel: string;
  onSuccess: () => void;
  onError: (message: string) => void;
};

type FlexField = { load: (selector: string) => void; unload?: () => void };
type FlexMicroform = {
  createField: (name: "number" | "securityCode", options?: Record<string, unknown>) => FlexField;
  createToken: (options: { expirationMonth: string; expirationYear: string }, callback: (error: { message?: string } | null, token?: string) => void) => void;
};

declare global {
  interface Window {
    Flex?: new (captureContext: string) => { microform: (options?: Record<string, unknown>) => FlexMicroform };
  }
}

/**
 * Hosted-field card collection. Card PAN/CVV are rendered by Cybersource in
 * iframes; this component only receives the one-time transient token.
 */
export default function CybersourceMicroform({ intentId, guestCheckoutToken, totalLabel, onSuccess, onError }: Props) {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [expiry, setExpiry] = useState("");
  const microformRef = useRef<FlexMicroform | null>(null);
  const fieldsRef = useRef<FlexField[]>([]);

  useEffect(() => {
    let disposed = false;
    async function mount() {
      try {
        const response = await fetch("/api/v1/checkout/cybersource-context", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ intentId, guestCheckoutToken }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Secure card entry is unavailable.");
        const context = payload.data;
        const script = document.createElement("script");
        script.src = context.clientLibrary;
        script.async = true;
        script.crossOrigin = "anonymous";
        if (context.clientLibraryIntegrity) script.integrity = context.clientLibraryIntegrity;
        script.onload = () => {
          if (disposed || !window.Flex) return;
          const flex = new window.Flex(context.captureContext);
          const microform = flex.microform({
            styles: {
              input: { "font-size": "16px", color: "#1a1614" },
              ":focus": { color: "#1a1614" },
              "::placeholder": { color: "#9ca3af" },
            },
          });
          const number = microform.createField("number", { placeholder: "Card number" });
          const securityCode = microform.createField("securityCode", { placeholder: "CVV" });
          number.load("#cybersource-card-number");
          securityCode.load("#cybersource-security-code");
          microformRef.current = microform;
          fieldsRef.current = [number, securityCode];
          setReady(true);
        };
        script.onerror = () => onError("Secure card entry could not be loaded. Please try again.");
        document.head.appendChild(script);
      } catch (error) {
        onError(error instanceof Error ? error.message : "Secure card entry is unavailable.");
      }
    }
    mount();
    return () => {
      disposed = true;
      fieldsRef.current.forEach((field) => field.unload?.());
    };
  }, [guestCheckoutToken, intentId, onError]);

  function pay() {
    const [month, year] = expiry.split("/").map((value) => value.trim());
    if (!microformRef.current || !/^\d{2}$/.test(month || "") || !/^\d{2,4}$/.test(year || "")) {
      onError("Enter your card expiry as MM / YY.");
      return;
    }
    setBusy(true);
    onError("");
    microformRef.current.createToken({ expirationMonth: month!, expirationYear: year!.length === 2 ? `20${year}` : year! }, async (tokenError, transientToken) => {
      if (tokenError || !transientToken) {
        setBusy(false);
        onError(tokenError?.message || "Your card details could not be verified.");
        return;
      }
      try {
        const response = await fetch("/api/v1/checkout/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ intentId, guestCheckoutToken, cybersourceTransientToken: transientToken }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Payment could not be completed.");
        onSuccess();
      } catch (error) {
        onError(error instanceof Error ? error.message : "Payment could not be completed.");
      } finally {
        setBusy(false);
      }
    });
  }

  const fieldStyle = { minHeight: 42, padding: "10px 12px", border: "1px solid #e5e0d8", borderRadius: 8, background: "white" };
  return (
    <div style={{ marginTop: 28, background: "#fafaf9", border: "1px solid #e5e0d8", borderRadius: 12, padding: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#6b7280", marginBottom: 16 }}>Secure card payment</div>
      <div id="cybersource-card-number" style={{ ...fieldStyle, marginBottom: 12 }} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <input aria-label="Card expiry" value={expiry} onChange={(event) => setExpiry(event.target.value)} placeholder="MM / YY" inputMode="numeric" maxLength={7} style={fieldStyle} />
        <div id="cybersource-security-code" style={fieldStyle} />
      </div>
      <p style={{ fontSize: 12, color: "#6b7280", margin: "14px 0 0" }}>Card details are collected by Cybersource. OKÜ does not receive or store your card number or CVV.</p>
      <button type="button" onClick={pay} disabled={!ready || busy} className="btn btn-primary" style={{ width: "100%", marginTop: 18, padding: 14 }}>
        {busy ? "Processing…" : ready ? `Pay ${totalLabel}` : "Loading secure payment…"}
      </button>
    </div>
  );
}
