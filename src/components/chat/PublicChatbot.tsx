"use client";

import { useState, useEffect, useRef } from "react";
import { useLocale } from "@/components/i18n/LocaleProvider";

// ─── Strings ────────────────────────────────────────────────────────────────

const STRINGS = {
  en: {
    openBtn: "Chat with us",
    q1_bilingual: "Hello! · ¡Hola!\nWhat language do you prefer?\n¿Qué idioma prefiere?",
    q2: "How can we help you today?",
    opt_reserve: "Make a reservation",
    opt_speak: "Speak to a host",
    opt_info: "General info",
    reserveMsg: "I'll take you to our reservation page right now.",
    reserveBtn: "Open Reservation Form →",
    chatPrompt: "Sure! What's your name and how can we reach you?",
    chatName: "Your name",
    chatPhone: "WhatsApp / phone (optional)",
    chatStart: "Start chat",
    chatPlaceholder: "Type your message…",
    chatSend: "Send",
    chatWait: "A host will reply shortly.",
    infoMsg: "Our restaurants are open Wednesday–Sunday. Use the reservation form or chat with a host for specific queries.",
    switchLang: "Switch language",
    poweredBy: "OKÜ Hospitality Group",
  },
  es: {
    openBtn: "Chatear",
    q1_bilingual: "Hello! · ¡Hola!\nWhat language do you prefer?\n¿Qué idioma prefiere?",
    q2: "¿En qué le podemos ayudar?",
    opt_reserve: "Hacer una reserva",
    opt_speak: "Hablar con un anfitrión",
    opt_info: "Información general",
    reserveMsg: "Le llevamos al formulario de reservas ahora mismo.",
    reserveBtn: "Abrir formulario →",
    chatPrompt: "¡Claro! ¿Cuál es su nombre y cómo le contactamos?",
    chatName: "Su nombre",
    chatPhone: "WhatsApp / teléfono (opcional)",
    chatStart: "Iniciar chat",
    chatPlaceholder: "Escriba su mensaje…",
    chatSend: "Enviar",
    chatWait: "Un anfitrión le responderá pronto.",
    switchLang: "Cambiar idioma",
    infoMsg: "Nuestros restaurantes están abiertos de miércoles a domingo.",
    poweredBy: "OKÜ Hospitality Group",
  },
  pt: {
    openBtn: "Fale conosco",
    q1_bilingual: "Hello! · ¡Hola!\nWhat language do you prefer?\n¿Qué idioma prefiere?",
    q2: "Como podemos ajudá-lo hoje?",
    opt_reserve: "Fazer uma reserva",
    opt_speak: "Falar com um anfitrião",
    opt_info: "Informações gerais",
    reserveMsg: "Vou levá-lo ao nosso formulário de reserva agora.",
    reserveBtn: "Abrir formulário →",
    chatPrompt: "Claro! Qual é o seu nome e como podemos contactá-lo?",
    chatName: "Seu nome",
    chatPhone: "WhatsApp / telefone (opcional)",
    chatStart: "Iniciar chat",
    chatPlaceholder: "Digite sua mensagem…",
    chatSend: "Enviar",
    chatWait: "Um anfitrião responderá em breve.",
    switchLang: "Mudar idioma",
    infoMsg: "Nossos restaurantes estão abertos de quarta a domingo.",
    poweredBy: "OKÜ Hospitality Group",
  },
};

const LANG_OPTIONS = [
  { key: "en" as const, label: "English", flag: "🇬🇧" },
  { key: "es" as const, label: "Español", flag: "🇪🇸" },
  { key: "pt" as const, label: "Português", flag: "🇧🇷" },
];

type Lang = "en" | "es" | "pt";
type Step = "closed" | "language" | "intent" | "booking" | "chat" | "done";
type Message = { role: "bot" | "user" | "bilingual"; text: string };

// ─── Component ───────────────────────────────────────────────────────────────

export default function PublicChatbot() {
  const siteLocale = useLocale();
  const [step, setStep] = useState<Step>("closed");
  const [lang, setLang] = useState<Lang>(() => {
    if (siteLocale === "es") return "es";
    if (siteLocale === "pt") return "pt";
    return "en";
  });
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [inputText, setInputText] = useState("");
  const [sessionToken, setSessionToken] = useState("");
  const [starting, setStarting] = useState(false);
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  // Keep lang in sync when site locale changes
  useEffect(() => {
    if (step === "closed") {
      if (siteLocale === "es") setLang("es");
      else if (siteLocale === "pt") setLang("pt");
      else setLang("en");
    }
  }, [siteLocale, step]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  const s = STRINGS[lang];

  function addBot(text: string) {
    setMsgs((m) => [...m, { role: "bot", text }]);
  }

  function open() {
    // If site locale is known, skip the language step — go straight to intent
    const detectedLang: Lang =
      siteLocale === "es" ? "es" : siteLocale === "pt" ? "pt" : "en";
    setLang(detectedLang);
    const ds = STRINGS[detectedLang];
    setMsgs([{ role: "bot", text: ds.q2 }]);
    setStep("intent");
  }

  function goToLanguageStep() {
    // Show bilingual language picker
    setMsgs([{ role: "bilingual", text: STRINGS.en.q1_bilingual }]);
    setStep("language");
  }

  function selectLang(l: Lang) {
    const ls = STRINGS[l];
    const userLabel = LANG_OPTIONS.find((o) => o.key === l)!;
    setLang(l);
    setMsgs((m) => [
      ...m,
      { role: "user", text: `${userLabel.flag} ${userLabel.label}` },
      { role: "bot", text: ls.q2 },
    ]);
    setStep("intent");
  }

  function selectIntent(intent: "reserve" | "speak" | "info") {
    const userText =
      intent === "reserve" ? s.opt_reserve :
      intent === "speak"   ? s.opt_speak   : s.opt_info;
    setMsgs((m) => [...m, { role: "user", text: userText }]);

    if (intent === "reserve") {
      setMsgs((m) => [...m, { role: "bot", text: s.reserveMsg }]);
      setStep("booking");
    } else if (intent === "info") {
      setMsgs((m) => [...m, { role: "bot", text: s.infoMsg }]);
      setStep("done");
    } else {
      setMsgs((m) => [...m, { role: "bot", text: s.chatPrompt }]);
      setStep("chat");
    }
  }

  async function startChat() {
    if (!guestName.trim()) return;
    setStarting(true);
    try {
      const r = await fetch("/api/v1/host/chat/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guestName, guestPhone, language: lang }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      setSessionToken(d.data.guestToken);
      setMsgs((m) => [...m, { role: "bot", text: s.chatWait }]);
      setStep("done");
    } catch {
      addBot("Something went wrong. Please try again.");
    }
    setStarting(false);
  }

  async function sendMsg() {
    if (!inputText.trim() || !sessionToken) return;
    const text = inputText;
    setInputText("");
    setMsgs((m) => [...m, { role: "user", text }]);
    setSending(true);
    try {
      await fetch(`/api/v1/chat/${sessionToken}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });
    } catch {}
    setSending(false);
  }

  // ── Closed state ────────────────────────────────────────────────────────
  if (step === "closed") {
    return (
      <button
        onClick={open}
        style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 900,
          display: "flex", alignItems: "center", gap: 8,
          background: "linear-gradient(135deg, #c8a96e 0%, #a8894e 100%)",
          border: "none", borderRadius: 28, padding: "12px 20px",
          color: "#1a1614", fontWeight: 700, fontSize: 13, cursor: "pointer",
          boxShadow: "0 4px 24px rgba(200,169,110,0.35)",
          fontFamily: "var(--font-sans)", letterSpacing: "0.02em",
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
        </svg>
        {s.openBtn}
      </button>
    );
  }

  // ── Open widget ─────────────────────────────────────────────────────────
  return (
    <div style={{
      position: "fixed", bottom: 24, right: 24, zIndex: 900,
      width: "min(370px, calc(100vw - 32px))",
      background: "#111113",
      border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: 20,
      boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
      display: "flex", flexDirection: "column",
      overflow: "hidden", fontFamily: "var(--font-sans)",
    }}>

      {/* Header */}
      <div style={{
        padding: "13px 16px",
        background: "rgba(200,169,110,0.08)",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div>
          <div style={{ fontWeight: 700, color: "#c8a96e", fontSize: 14 }}>OKÜ Hospitality</div>
          <div style={{ fontSize: 11, color: "#6b7280", marginTop: 1 }}>Restaurant & Experiences</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {/* Language switcher pill */}
          <button
            onClick={goToLanguageStep}
            title={s.switchLang}
            style={{
              background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 20, padding: "3px 10px", fontSize: 10, fontWeight: 700,
              color: "#9ca3af", cursor: "pointer", letterSpacing: "0.06em", textTransform: "uppercase",
              fontFamily: "var(--font-sans)",
            }}
          >
            {lang.toUpperCase()}
          </button>
          {/* Close */}
          <button
            onClick={() => { setStep("closed"); setMsgs([]); setSessionToken(""); }}
            style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSize: 18, padding: "2px 4px" }}
          >
            ×
          </button>
        </div>
      </div>

      {/* Messages */}
      <div style={{
        flex: 1, overflowY: "auto", padding: "14px 13px",
        display: "flex", flexDirection: "column", gap: 10,
        maxHeight: 300, minHeight: 160,
      }}>
        {msgs.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
            {m.role === "bilingual" ? (
              /* Bilingual message — displayed centered with two-language styling */
              <div style={{
                width: "100%",
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.09)",
                borderRadius: 14,
                padding: "12px 14px",
                textAlign: "center",
              }}>
                <div style={{ fontSize: 13, color: "#d1d5db", lineHeight: 1.6, whiteSpace: "pre-line" }}>
                  {m.text.split("\n").map((line, j) => (
                    <div key={j} style={{
                      color: j % 2 === 0 ? "#c8a96e" : "#d1d5db",
                      fontSize: j === 0 ? 15 : 13,
                      fontWeight: j === 0 ? 700 : 400,
                    }}>
                      {line}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{
                maxWidth: "84%",
                background: m.role === "user"
                  ? "rgba(200,169,110,0.15)"
                  : "rgba(255,255,255,0.06)",
                border: m.role === "user"
                  ? "1px solid rgba(200,169,110,0.3)"
                  : "1px solid rgba(255,255,255,0.09)",
                borderRadius: m.role === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                padding: "9px 13px",
                fontSize: 13, color: m.role === "user" ? "#c8a96e" : "#d1d5db",
                lineHeight: 1.45,
              }}>
                {m.text}
              </div>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {/* Action area */}
      <div style={{ padding: "11px 13px 15px", borderTop: "1px solid rgba(255,255,255,0.07)" }}>

        {/* Language picker */}
        {step === "language" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {LANG_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => selectLang(opt.key)}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "11px 14px", borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: opt.key === lang ? "rgba(200,169,110,0.1)" : "rgba(255,255,255,0.04)",
                  color: opt.key === lang ? "#c8a96e" : "#d1d5db",
                  fontSize: 13, cursor: "pointer", textAlign: "left",
                  fontWeight: opt.key === lang ? 700 : 500,
                  fontFamily: "var(--font-sans)",
                }}
              >
                <span style={{ fontSize: 18 }}>{opt.flag}</span>
                <span>{opt.label}</span>
                {opt.key === lang && (
                  <span style={{ marginLeft: "auto", fontSize: 10, color: "#c8a96e", fontWeight: 800 }}>✓</span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Intent selection */}
        {step === "intent" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {(["reserve", "speak", "info"] as const).map((intent) => (
              <button
                key={intent}
                onClick={() => selectIntent(intent)}
                style={{
                  padding: "10px 14px", borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "rgba(255,255,255,0.04)", color: "#d1d5db",
                  fontSize: 13, cursor: "pointer", textAlign: "left",
                  fontWeight: 600, fontFamily: "var(--font-sans)",
                }}
              >
                {intent === "reserve" ? s.opt_reserve : intent === "speak" ? s.opt_speak : s.opt_info}
              </button>
            ))}
          </div>
        )}

        {/* Booking redirect */}
        {step === "booking" && (
          <a
            href="/reservations"
            style={{
              display: "block", padding: "11px 0", borderRadius: 11,
              background: "linear-gradient(135deg, #c8a96e 0%, #a8894e 100%)",
              color: "#1a1614", textAlign: "center",
              fontWeight: 800, fontSize: 13, textDecoration: "none",
              letterSpacing: "0.03em",
            }}
          >
            {s.reserveBtn}
          </a>
        )}

        {/* Chat — name/phone collection */}
        {step === "chat" && !sessionToken && (
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            <input
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && guestName.trim() && !guestPhone && startChat()}
              placeholder={s.chatName}
              style={inputStyle}
            />
            <input
              value={guestPhone}
              onChange={(e) => setGuestPhone(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && startChat()}
              placeholder={s.chatPhone}
              style={inputStyle}
            />
            <button
              onClick={startChat}
              disabled={starting || !guestName.trim()}
              style={{
                padding: "10px 0", borderRadius: 10, border: "none",
                background: guestName.trim()
                  ? "linear-gradient(135deg, #c8a96e 0%, #a8894e 100%)"
                  : "rgba(255,255,255,0.06)",
                color: guestName.trim() ? "#1a1614" : "#4b5563",
                fontWeight: 800, fontSize: 13,
                cursor: guestName.trim() ? "pointer" : "not-allowed",
                fontFamily: "var(--font-sans)",
              }}
            >
              {starting ? "…" : s.chatStart}
            </button>
          </div>
        )}

        {/* Chat — live messaging after session started */}
        {step === "chat" && sessionToken && (
          <div style={{ display: "flex", gap: 7 }}>
            <input
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMsg()}
              placeholder={s.chatPlaceholder}
              style={{ ...inputStyle, flex: 1 }}
            />
            <button
              onClick={sendMsg}
              disabled={sending || !inputText.trim()}
              style={{
                padding: "10px 14px", borderRadius: 10, border: "none",
                background: inputText.trim() ? "rgba(200,169,110,0.2)" : "rgba(255,255,255,0.04)",
                color: inputText.trim() ? "#c8a96e" : "#4b5563",
                fontWeight: 700, fontSize: 12, cursor: "pointer",
                fontFamily: "var(--font-sans)",
              }}
            >
              {s.chatSend}
            </button>
          </div>
        )}

        {/* Done state */}
        {step === "done" && (
          <button
            onClick={() => { setStep("intent"); }}
            style={{
              width: "100%", padding: "10px 0", borderRadius: 10,
              background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)",
              color: "#9ca3af", fontSize: 12, cursor: "pointer",
              fontFamily: "var(--font-sans)",
            }}
          >
            ← {lang === "es" ? "Volver" : lang === "pt" ? "Voltar" : "Back"}
          </button>
        )}

        <div style={{ textAlign: "center", marginTop: 10, fontSize: 10, color: "#1f2937" }}>
          {s.poweredBy}
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 10, padding: "10px 13px",
  color: "white", fontSize: 13, outline: "none",
  boxSizing: "border-box", fontFamily: "var(--font-sans)",
};
