import { getResendClient, isResendConfigured } from "@/server/invitation/resend";
import { getTranslations } from "@/i18n/getTranslations";
import { DEFAULT_LOCALE, isValidLocale } from "@/i18n/config";
import type { Locale } from "@/types/i18n";
import type { BankReadinessStatusValue } from "./beneficiaryService";

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL ||
  process.env.APP_BASE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  "https://oku.group";

type Bucket = "OKU_APPROVAL" | "BANK_READINESS" | "HOLD_OR_REJECT";

type StatusKey = "READY_FOR_REVIEW" | "OKU_APPROVED" | "BANK_READY" | "ON_HOLD" | "REJECTED";

type StatusMeta = { bucket: Bucket; showReason: boolean };

const STATUS_META: Record<StatusKey, StatusMeta> = {
  READY_FOR_REVIEW: { bucket: "OKU_APPROVAL",   showReason: false },
  OKU_APPROVED:     { bucket: "OKU_APPROVAL",   showReason: false },
  BANK_READY:       { bucket: "BANK_READINESS", showReason: false },
  ON_HOLD:          { bucket: "HOLD_OR_REJECT", showReason: true  },
  REJECTED:         { bucket: "HOLD_OR_REJECT", showReason: true  },
};

function metaFor(to: BankReadinessStatusValue): { key: StatusKey; meta: StatusMeta } | null {
  if (to === "READY_FOR_REVIEW" || to === "OKU_APPROVED" || to === "BANK_READY" || to === "ON_HOLD" || to === "REJECTED") {
    return { key: to, meta: STATUS_META[to] };
  }
  return null;
}

/** Map InfluencerProfile.preferredLanguage (free-text) → supported Locale. */
export function resolvePreferredLocale(input: string | null | undefined): Locale {
  if (!input) return DEFAULT_LOCALE;
  const v = input.trim().toLowerCase();
  if (isValidLocale(v)) return v;
  if (v.startsWith("en")) return "en";
  if (v.startsWith("es") || v.startsWith("spanish") || v.startsWith("español") || v.startsWith("espanol")) return "es";
  if (v.startsWith("pt") || v.startsWith("portuguese") || v.startsWith("português") || v.startsWith("portugues")) return "pt";
  return DEFAULT_LOCALE;
}

/** Redact local-part of an email for log lines (j***@example.com). */
function redactEmailForLog(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  const head = local?.[0] ?? "";
  return `${head}***@${domain}`;
}

function emailHeader() {
  return `
    <div style="background:#1a1614;padding:24px 32px">
      <span style="color:#c41e3a;font-size:26px;font-weight:700;font-family:Georgia,serif;letter-spacing:-0.01em">OKÜ</span>
      <span style="color:#9ca3af;font-size:10px;letter-spacing:0.18em;text-transform:uppercase;margin-left:8px">HOSPITALITY GROUP</span>
    </div>`;
}

function emailFooter(footerNote: string) {
  return `
    <div style="background:#f9f7f4;padding:24px 32px;border-top:1px solid #e5e0d8;text-align:center">
      <p style="margin:0 0 8px;color:#9ca3af;font-size:12px">OKÜ Hospitality Group · Panama City, Panama</p>
      <p style="margin:0;color:#c5c0b8;font-size:11px">${escapeHtml(footerNote)}</p>
    </div>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function asString(v: unknown, fallback: string): string {
  return typeof v === "string" && v.length > 0 ? v : fallback;
}

function asDict(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

/**
 * Notify a beneficiary by email about a status transition. Quietly no-ops
 * when Resend is not configured, when there's no recipient email, or when
 * the target status is not one of the user-facing ones. Never throws — the
 * surrounding state-machine transition has already committed.
 *
 * Copy is loaded from the `emails.beneficiary` namespace for the recipient's
 * preferred locale (falling back to EN when missing or unsupported).
 */
export async function sendBeneficiaryStatusEmail(opts: {
  toEmail: string | null | undefined;
  toName: string | null | undefined;
  to: BankReadinessStatusValue;
  reason: string | null;
  /** Recipient's preferred locale; falls back to EN. */
  locale?: Locale | string | null;
  /**
   * When true, suppress informational emails. Action-required transitions
   * (HOLD_OR_REJECT bucket) ignore this flag and always send.
   */
  optOut?: boolean;
}): Promise<void> {
  if (!opts.toEmail) return;
  const status = metaFor(opts.to);
  if (!status) return;
  if (opts.optOut && status.meta.bucket !== "HOLD_OR_REJECT") {
    console.log(
      "[email] Beneficiary opted out — informational status email suppressed",
      redactEmailForLog(opts.toEmail),
      opts.to,
    );
    return;
  }
  if (!isResendConfigured()) {
    console.log(
      "[email] Resend not configured — beneficiary status email not sent to",
      redactEmailForLog(opts.toEmail),
      opts.to,
    );
    return;
  }

  const locale: Locale = isValidLocale(String(opts.locale ?? "")) ? (opts.locale as Locale) : DEFAULT_LOCALE;
  const t = await getTranslations(locale, ["emails"]);
  const fb = locale === DEFAULT_LOCALE ? null : await getTranslations(DEFAULT_LOCALE, ["emails"]);

  const ben       = asDict(asDict(t.emails).beneficiary);
  const benFb     = asDict(asDict(fb?.emails).beneficiary);
  const buckets   = asDict(ben.buckets);
  const bucketsFb = asDict(benFb.buckets);
  const statuses  = asDict(ben.status);
  const statusesFb = asDict(benFb.status);
  const sBlock    = asDict(statuses[status.key]);
  const sBlockFb  = asDict(statusesFb[status.key]);

  const subject  = asString(sBlock.subject,  asString(sBlockFb.subject,  String(status.key)));
  const headline = asString(sBlock.headline, asString(sBlockFb.headline, String(status.key)));
  const body     = asString(sBlock.body,     asString(sBlockFb.body,     ""));
  const bucketLabel = asString(buckets[status.meta.bucket], asString(bucketsFb[status.meta.bucket], status.meta.bucket));
  const reasonLabel = asString(ben.reasonLabel, asString(benFb.reasonLabel, "Reason"));
  const ctaLabel    = asString(ben.cta, asString(benFb.cta, "View your beneficiary profile"));
  const orOpenLabel = asString(ben.orOpen, asString(benFb.orOpen, "Or open:"));
  const footerNote  = asString(ben.footerNote, asString(benFb.footerNote, ""));
  const greetingTpl = asString(ben.greeting, asString(benFb.greeting, "Hi {name},"));
  const greetingFb  = asString(ben.greetingFallback, asString(benFb.greetingFallback, "Hi there,"));

  const trimmedName = opts.toName?.trim();
  const greeting = trimmedName
    ? greetingTpl.replace("{name}", trimmedName)
    : greetingFb;

  const profileUrl = `${BASE_URL}/my/beneficiary`;
  const reasonBlock =
    status.meta.showReason && opts.reason?.trim()
      ? `
      <div style="margin:24px 0;padding:16px 20px;background:#fdf6f4;border-left:3px solid #c41e3a;border-radius:4px">
        <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#c41e3a">${escapeHtml(reasonLabel)}</p>
        <p style="margin:0;color:#1a1614;font-size:14px;line-height:1.6">${escapeHtml(opts.reason.trim())}</p>
      </div>`
      : "";

  const html = `
    <div style="font-family:sans-serif;max-width:580px;margin:0 auto;background:white">
      ${emailHeader()}
      <div style="padding:40px 32px">
        <p style="margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#c41e3a">${escapeHtml(bucketLabel)}</p>
        <h1 style="margin:0 0 16px;font-family:Georgia,serif;font-size:26px;font-weight:400;color:#1a1614;letter-spacing:-0.01em">${escapeHtml(headline)}</h1>
        <p style="color:#4b4540;margin:0 0 24px;font-size:15px;line-height:1.7">${escapeHtml(greeting)}</p>
        <p style="color:#4b4540;margin:0 0 16px;font-size:15px;line-height:1.7">${escapeHtml(body)}</p>
        ${reasonBlock}
        <div style="text-align:center;margin:32px 0">
          <a href="${profileUrl}" style="display:inline-block;background:#c41e3a;color:white;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:14px;font-weight:600;letter-spacing:0.02em">${escapeHtml(ctaLabel)}</a>
        </div>
        <p style="color:#9ca3af;font-size:12px;margin:0;text-align:center">${escapeHtml(orOpenLabel)} <a href="${profileUrl}" style="color:#c41e3a">${profileUrl}</a></p>
      </div>
      ${emailFooter(footerNote)}
    </div>`;

  try {
    const { client, fromEmail } = await getResendClient();
    await client.emails.send({
      from: fromEmail,
      to: opts.toEmail,
      subject,
      headers: { "X-Entity-Ref-ID": `beneficiary-status-${opts.to}` },
      html,
      text: `${headline}\n\n${body}${
        status.meta.showReason && opts.reason?.trim() ? `\n\n${reasonLabel}: ${opts.reason.trim()}` : ""
      }\n\n${ctaLabel}: ${profileUrl}`,
    });
  } catch (err) {
    console.error(
      "[email] Failed to send beneficiary status email",
      { to: redactEmailForLog(opts.toEmail), status: opts.to, err: err instanceof Error ? err.message : String(err) },
    );
  }
}
