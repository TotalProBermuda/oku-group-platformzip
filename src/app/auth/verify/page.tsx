"use client";

import { FormEvent, useEffect, useState } from "react";
import { getSession, signIn, signOut } from "next-auth/react";
import Link from "next/link";
import { useTranslation } from "@/components/i18n/LocaleProvider";

export default function VerifyMagicLinkPage() {
  const t = useTranslation();
  const [token, setToken] = useState("");
  const [email, setEmail] = useState("");
  const [ready, setReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    setToken(fragment.get("token") ?? "");
    setEmail(fragment.get("email") ?? "");
    window.history.replaceState(null, "", window.location.pathname);
    setReady(true);
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!token) {
      setError(t("auth", "magicLinkInvalid"));
      return;
    }
    setSubmitting(true);
    setError("");

    // Clear any prior browser session before exchanging the one-time bearer
    // credential. NextAuth will then mint a fresh signed JWT session.
    await signOut({ redirect: false });
    const result = await signIn("passwordless", {
      token,
      email,
      callbackUrl: "/",
      redirect: false,
    });
    setSubmitting(false);
    if (!result?.ok || !result.url) {
      setError(t("auth", "magicLinkInvalid"));
      return;
    }
    const session = await getSession();
    const destination =
      (session?.user as { passwordlessDestination?: string } | undefined)?.passwordlessDestination ?? "/";
    window.location.assign(destination);
  }

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "#faf9f7" }}>
      <section style={{ width: "100%", maxWidth: 440, padding: 36, background: "#fff", border: "1px solid #e7e2dc", borderRadius: 14 }}>
        <div style={{ font: "700 26px Georgia,serif", marginBottom: 8 }}>OKÜ</div>
        <h1 style={{ fontSize: 28, margin: "0 0 10px" }}>{t("auth", "magicLinkVerifyTitle")}</h1>
        <p style={{ color: "#6b645f", lineHeight: 1.6 }}>{t("auth", "magicLinkVerifyDescription")}</p>
        {!ready ? (
          <p>{t("auth", "magicLinkChecking")}</p>
        ) : (
          <form onSubmit={submit}>
            <label htmlFor="magic-email" style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
              {t("auth", "email")}
            </label>
            <input
              id="magic-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px", border: "1px solid #d7d0c9", borderRadius: 8, fontSize: 16 }}
            />
            {error ? <p role="alert" style={{ color: "#b42318", fontSize: 14 }}>{error}</p> : null}
            <button
              type="submit"
              disabled={submitting || !token}
              style={{ width: "100%", marginTop: 18, padding: "13px 16px", border: 0, borderRadius: 8, background: "#c41e3a", color: "#fff", fontWeight: 700, cursor: "pointer" }}
            >
              {submitting ? t("auth", "magicLinkSigningIn") : t("auth", "magicLinkContinue")}
            </button>
          </form>
        )}
        <Link href="/login" style={{ display: "inline-block", marginTop: 22, color: "#6b645f", fontSize: 14 }}>
          {t("auth", "backToSignIn")}
        </Link>
      </section>
    </main>
  );
}