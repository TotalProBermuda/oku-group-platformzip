"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import MediaUpload from "@/components/ui/MediaUpload";

interface ComposerProps {
  seriesId: string;
  onSent?: (result: { created: number; sent: number }) => void;
}

type Template = "CLASSIC" | "EDITORIAL" | "DARK_LUXURY";
type PreviewDevice = "desktop" | "mobile";

const TEMPLATES: { id: Template; label: string; sub: string; accent: string; bg: string }[] = [
  { id: "CLASSIC", label: "Classic Editorial", sub: "Warm ivory · OKÜ signature", accent: "#c41e3a", bg: "#f5f0ea" },
  { id: "EDITORIAL", label: "Full-Bleed Hero", sub: "Bold & visual-first", accent: "#c41e3a", bg: "#ffffff" },
  { id: "DARK_LUXURY", label: "Dark Luxury", sub: "Gold accents · Founder tier", accent: "#b8973a", bg: "#111010" },
];

const AUDIENCE_OPTIONS = [
  { value: "ALL_USERS", label: "All Users", description: "Every active user on the platform" },
  { value: "PATRON_ONLY", label: "Patron Members", description: "Active Patron members only" },
  { value: "FOUNDER_ONLY", label: "Founder Members", description: "Active Founder members only" },
  { value: "PATRON_AND_FOUNDER", label: "Patron + Founder", description: "All active members" },
];

const IMAGE_HINT = "Recommended: 1200×630px, JPEG or PNG, max 5 MB. Use a direct image URL (CDN, Cloudinary, etc.)";
const VIDEO_HINT = "Paste a YouTube video URL. A thumbnail preview will appear in the email with a play button linking to the video.";

const AUDIENCE_LABELS: Record<string, string> = {
  ALL_USERS: "",
  PATRON_ONLY: "Patron Members",
  FOUNDER_ONLY: "Founder Members Only",
  PATRON_AND_FOUNDER: "Members Only",
};

function Divider({ label }: { label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "24px 0 16px" }}>
      <div style={{ flex: 1, height: 1, background: "#e8e3db" }} />
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", color: "#9ca3af", textTransform: "uppercase" }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: "#e8e3db" }} />
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <p style={{ margin: "0 0 8px", fontWeight: 600, fontSize: 12, color: "#4b4540", textTransform: "uppercase", letterSpacing: "0.08em" }}>{children}</p>;
}

function Hint({ children }: { children: string }) {
  return <p style={{ margin: "6px 0 0", fontSize: 11, color: "#9ca3af", lineHeight: 1.5 }}>{children}</p>;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <Label>{label}</Label>
      {children}
      {hint && <Hint>{hint}</Hint>}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box",
  border: "1px solid #e8e3db", borderRadius: 8, padding: "10px 12px",
  fontSize: 13, color: "#1a1614", background: "#fff", outline: "none",
  fontFamily: "sans-serif",
};

export default function InvitationComposer({ seriesId, onSent }: ComposerProps) {
  const [template, setTemplate] = useState<Template>("CLASSIC");
  const [audience, setAudience] = useState("PATRON_AND_FOUNDER");
  const [customSubject, setCustomSubject] = useState("");
  const [customMessage, setCustomMessage] = useState("");
  const [flyerImageUrl, setFlyerImageUrl] = useState("");
  const [heroImageUrl, setHeroImageUrl] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [resendNonResponders, setResendNonResponders] = useState(false);

  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>("desktop");
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ created: number; sent: number; error?: string } | null>(null);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buildPayload = useCallback(() => ({
    template,
    customSubject: customSubject.trim() || undefined,
    customMessage: customMessage.trim() || undefined,
    flyerImageUrl: flyerImageUrl.trim() || undefined,
    heroImageUrl: heroImageUrl.trim() || undefined,
    youtubeUrl: youtubeUrl.trim() || undefined,
    audienceLabel: AUDIENCE_LABELS[audience] || undefined,
  }), [template, customSubject, customMessage, flyerImageUrl, heroImageUrl, youtubeUrl, audience]);

  const fetchPreview = useCallback(async () => {
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const res = await fetch(`/api/v1/events/${seriesId}/invitations/preview-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
      });
      if (res.ok) {
        setPreviewHtml(await res.text());
      } else {
        let detail = `${res.status} ${res.statusText}`;
        try {
          const body = await res.text();
          if (body) detail = body.slice(0, 240);
        } catch {}
        setPreviewError(`Couldn't load the email preview (${detail}). Adjust your inputs and try again, or refresh the page.`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "network error";
      setPreviewError(`Couldn't load the email preview: ${msg}. Check your connection and try again.`);
    } finally {
      setPreviewLoading(false);
    }
  }, [seriesId, buildPayload]);

  useEffect(() => {
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    previewTimerRef.current = setTimeout(fetchPreview, 600);
    return () => { if (previewTimerRef.current) clearTimeout(previewTimerRef.current); };
  }, [fetchPreview]);

  useEffect(() => {
    setPreviewCount(null);
    const t = setTimeout(() => {
      fetch(`/api/v1/events/${seriesId}/invitations/preview?mode=${audience}`)
        .then((r) => r.json())
        .then((d) => setPreviewCount(d.count ?? 0))
        .catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [audience, seriesId]);

  async function handleSend() {
    setSending(true);
    setSendResult(null);
    const res = await fetch(`/api/v1/events/${seriesId}/invitations/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        audienceMode: audience,
        resendToNonResponders: resendNonResponders,
        emailConfig: buildPayload(),
      }),
    });
    const data = await res.json();
    setSendResult(data);
    setSending(false);
    if (!data.error && onSent) onSent(data);
  }

  const iframeWidth = previewDevice === "desktop" ? "100%" : 375;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "380px 1fr", gap: 0, minHeight: 680 }}>
      {/* ── LEFT PANEL: Composer controls ── */}
      <div style={{ borderRight: "1px solid #e8e3db", overflowY: "auto", padding: "24px 20px" }}>

        {/* Template picker */}
        <Divider label="Email Template" />
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {TEMPLATES.map((t) => (
            <div
              key={t.id}
              onClick={() => setTemplate(t.id)}
              style={{
                border: `2px solid ${template === t.id ? t.accent : "#e8e3db"}`,
                borderRadius: 10, padding: "12px 14px",
                cursor: "pointer",
                background: template === t.id ? (t.id === "DARK_LUXURY" ? "#111010" : t.id === "EDITORIAL" ? "#f9f7f4" : "#fef9f5") : "#fff",
                display: "flex", alignItems: "center", gap: 12, transition: "all 0.15s",
              }}
            >
              {/* Color swatch */}
              <div style={{ width: 36, height: 36, borderRadius: 8, background: t.bg, border: "1px solid " + (t.id === "DARK_LUXURY" ? "#2e2a28" : "#e8e3db"), flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ color: t.accent, fontWeight: 700, fontSize: 11, fontFamily: "Georgia, serif" }}>OKÜ</span>
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: template === t.id ? (t.id === "DARK_LUXURY" ? "#f5f0ea" : "#1a1614") : "#1a1614" }}>{t.label}</div>
                <div style={{ fontSize: 11, color: template === t.id ? (t.id === "DARK_LUXURY" ? "#9ca3af" : "#7c7168") : "#9ca3af", marginTop: 1 }}>{t.sub}</div>
              </div>
              {template === t.id && (
                <div style={{ marginLeft: "auto", width: 18, height: 18, borderRadius: "50%", background: t.accent, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ color: t.id === "DARK_LUXURY" ? "#111" : "#fff", fontSize: 10, fontWeight: 700 }}>✓</span>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Media */}
        <Divider label="Media" />
        <Field label="Event Flyer Image" hint={IMAGE_HINT}>
          <MediaUpload
            value={flyerImageUrl}
            onChange={setFlyerImageUrl}
            aspectRatio="portrait"
            mediaType="image"
            maxSizeMB={10}
            compact
          />
        </Field>
        <Field label="Hero Image (alt/fallback)" hint="Used in Full-Bleed template or as fallback.">
          <MediaUpload
            value={heroImageUrl}
            onChange={setHeroImageUrl}
            aspectRatio="wide"
            mediaType="image"
            maxSizeMB={10}
            compact
          />
        </Field>
        <Field label="YouTube Promo URL" hint={VIDEO_HINT}>
          <input
            style={inputStyle} type="url" placeholder="https://youtube.com/watch?v=..."
            value={youtubeUrl} onChange={(e) => setYoutubeUrl(e.target.value)}
          />
        </Field>

        {/* Content */}
        <Divider label="Content" />
        <Field label="Email Subject Line" hint="Leave blank to use the default subject.">
          <input
            style={inputStyle} type="text" placeholder="You're invited to an exclusive evening…"
            value={customSubject} onChange={(e) => setCustomSubject(e.target.value)}
            maxLength={120}
          />
          <p style={{ margin: "4px 0 0", fontSize: 11, color: "#c4bfb8", textAlign: "right" }}>{customSubject.length}/120</p>
        </Field>
        <Field label="Custom Message" hint="Replaces the default event description in the email body.">
          <textarea
            style={{ ...inputStyle, minHeight: 90, resize: "vertical" }}
            placeholder="Join us for an intimate evening with close friends of OKÜ…"
            value={customMessage}
            onChange={(e) => setCustomMessage(e.target.value)}
            maxLength={800}
          />
          <p style={{ margin: "4px 0 0", fontSize: 11, color: "#c4bfb8", textAlign: "right" }}>{customMessage.length}/800</p>
        </Field>

        {/* Audience */}
        <Divider label="Audience" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
          {AUDIENCE_OPTIONS.map((opt) => (
            <div
              key={opt.value}
              onClick={() => setAudience(opt.value)}
              style={{
                border: `2px solid ${audience === opt.value ? "#c41e3a" : "#e8e3db"}`,
                borderRadius: 8, padding: "10px 12px", cursor: "pointer",
                background: audience === opt.value ? "#fef2f2" : "#fff",
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 12, color: "#1a1614", marginBottom: 2 }}>{opt.label}</div>
              <div style={{ fontSize: 11, color: "#9ca3af" }}>{opt.description}</div>
            </div>
          ))}
        </div>

        <div style={{ background: "#f9f7f4", border: "1px solid #e8e3db", borderRadius: 8, padding: "10px 14px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#e8e3db", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>👥</div>
          <span style={{ color: "#4b4540", fontSize: 13 }}>
            {previewCount === null ? "Calculating…" : `${previewCount} recipient${previewCount !== 1 ? "s" : ""}`}
          </span>
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={resendNonResponders}
            onChange={(e) => setResendNonResponders(e.target.checked)}
            style={{ width: 15, height: 15, accentColor: "#c41e3a" }}
          />
          <span style={{ fontSize: 12, color: "#4b4540", lineHeight: 1.4 }}>Skip recipients who already RSVP'd or declined</span>
        </label>

        {/* Send result */}
        {sendResult && (
          <div style={{
            background: sendResult.error ? "#fef2f2" : "#f0fdf4",
            border: "1px solid " + (sendResult.error ? "#fecaca" : "#bbf7d0"),
            borderRadius: 8, padding: "12px 14px", marginBottom: 16,
          }}>
            {sendResult.error ? (
              <p style={{ margin: 0, color: "#dc2626", fontSize: 13 }}>
                {sendResult.error === "RESEND_NOT_CONFIGURED"
                  ? `${sendResult.created} records created. Resend delivery not yet configured.`
                  : `Error: ${sendResult.error}`}
              </p>
            ) : (
              <p style={{ margin: 0, color: "#16a34a", fontSize: 13 }}>
                ✓ {sendResult.created} invitation{sendResult.created !== 1 ? "s" : ""} created · {sendResult.sent} email{sendResult.sent !== 1 ? "s" : ""} sent
              </p>
            )}
          </div>
        )}

        <button
          onClick={handleSend}
          disabled={sending || previewCount === 0}
          style={{
            width: "100%",
            background: sending || previewCount === 0 ? "#e8e3db" : "#c41e3a",
            color: sending || previewCount === 0 ? "#9ca3af" : "#fff",
            border: "none", borderRadius: 8, padding: "13px 0",
            fontSize: 13, fontWeight: 700, cursor: sending || previewCount === 0 ? "not-allowed" : "pointer",
            letterSpacing: "0.06em", textTransform: "uppercase",
          }}
        >
          {sending ? "Sending…" : `Send Invitations${previewCount !== null ? ` (${previewCount})` : ""}`}
        </button>
      </div>

      {/* ── RIGHT PANEL: Live preview ── */}
      <div style={{ display: "flex", flexDirection: "column", background: "#f3f4f6" }}>
        {/* Preview toolbar */}
        <div style={{ padding: "12px 20px", borderBottom: "1px solid #e8e3db", background: "#fff", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#7c7168", textTransform: "uppercase", letterSpacing: "0.1em" }}>Live Preview</span>
          <div style={{ display: "flex", gap: 6 }}>
            {(["desktop", "mobile"] as PreviewDevice[]).map((d) => (
              <button
                key={d}
                onClick={() => setPreviewDevice(d)}
                style={{
                  padding: "5px 12px", fontSize: 12, fontWeight: 600, borderRadius: 6,
                  border: "1px solid " + (previewDevice === d ? "#1a1614" : "#e8e3db"),
                  background: previewDevice === d ? "#1a1614" : "#fff",
                  color: previewDevice === d ? "#fff" : "#7c7168",
                  cursor: "pointer", textTransform: "capitalize",
                }}
              >
                {d === "desktop" ? "🖥 Desktop" : "📱 Mobile"}
              </button>
            ))}
          </div>
          {previewLoading && (
            <span style={{ fontSize: 11, color: "#9ca3af" }}>Refreshing…</span>
          )}
        </div>

        {previewError && (
          <div
            role="alert"
            style={{
              margin: "0 20px 12px",
              padding: "10px 14px",
              borderRadius: 8,
              background: "#fef2f2",
              border: "1px solid #fecaca",
              color: "#991b1b",
              fontSize: 12,
              display: "flex",
              gap: 10,
              alignItems: "flex-start",
            }}
          >
            <span style={{ fontSize: 14, lineHeight: 1 }}>⚠️</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, marginBottom: 2 }}>Preview unavailable</div>
              <div style={{ lineHeight: 1.45 }}>{previewError}</div>
              <button
                type="button"
                onClick={fetchPreview}
                style={{
                  marginTop: 6,
                  background: "transparent",
                  border: "1px solid #fecaca",
                  color: "#991b1b",
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "3px 10px",
                  borderRadius: 6,
                  cursor: "pointer",
                }}
              >
                Retry preview
              </button>
            </div>
          </div>
        )}

        {/* Preview iframe wrapper */}
        <div style={{ flex: 1, overflow: "auto", display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "28px 20px" }}>
          <div style={{
            width: previewDevice === "desktop" ? "100%" : 375,
            maxWidth: previewDevice === "desktop" ? 620 : 375,
            background: "#fff",
            borderRadius: 10,
            boxShadow: "0 4px 24px rgba(0,0,0,0.10)",
            overflow: "hidden",
            transition: "max-width 0.25s ease",
          }}>
            {/* Email "header bar" decoration */}
            <div style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb", padding: "8px 14px", display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#ef4444" }} />
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#f59e0b" }} />
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#22c55e" }} />
              <span style={{ marginLeft: 8, fontSize: 11, color: "#9ca3af", flex: 1, textAlign: "center" }}>
                {customSubject.trim() || `You're invited — (event title)`}
              </span>
            </div>

            {previewHtml ? (
              <iframe
                srcDoc={previewHtml}
                style={{ width: "100%", border: "none", display: "block", minHeight: 600 }}
                height={previewDevice === "mobile" ? 900 : 1100}
                title="Email Preview"
                sandbox="allow-same-origin"
                onLoad={(e) => {
                  try {
                    const iframe = e.currentTarget;
                    const contentHeight = iframe.contentDocument?.documentElement?.scrollHeight;
                    if (contentHeight && contentHeight > 0) {
                      iframe.style.height = `${Math.max(600, contentHeight)}px`;
                    }
                  } catch {}
                }}
              />
            ) : (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 400, color: "#9ca3af", fontSize: 14 }}>
                Loading preview…
              </div>
            )}
          </div>
        </div>

        {/* Footer note */}
        <div style={{ padding: "10px 20px", borderTop: "1px solid #e8e3db", background: "#fff" }}>
          <p style={{ margin: 0, fontSize: 11, color: "#9ca3af", textAlign: "center" }}>
            Preview uses demo data. Actual recipients will see their name and personal RSVP link.
          </p>
        </div>
      </div>
    </div>
  );
}
