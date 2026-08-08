import { cookies } from "next/headers";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isValidLocale } from "@/i18n/config";
import { getTranslations } from "@/i18n/getTranslations";
import AdminPageShell from "@/components/admin/AdminPageShell";
import LedgerOutboxClient from "./LedgerOutboxClient";
import type { Locale } from "@/types/i18n";
import type { LedgerOutboxTranslations } from "./LedgerOutboxClient";

export const dynamic = "force-dynamic";

export default async function LedgerOutboxPage() {
  const jar = await cookies();
  const cookieLocale = jar.get("oku_locale")?.value;
  const locale: Locale = isValidLocale(cookieLocale ?? "") ? (cookieLocale as Locale) : "en";

  const tr  = await getTranslations(locale, ["admin"]);
  const ops = ((tr.admin as Record<string, unknown>)?.ops ?? {}) as Record<string, unknown>;

  const s = (key: string, fallback: string) => (ops[key] as string | undefined) ?? fallback;

  const t: LedgerOutboxTranslations = {
    eyebrow:                 s("ledgerOutboxEyebrow",          "Superadmin · Operations"),
    title:                   s("ledgerOutboxTitle",            "Ledger Event Outbox"),
    subtitle:                s("ledgerOutboxSubtitle",         "Durable proof-trail outbox. FAILED_REVIEW rows need manual intervention."),
    healthEmitted24h:        s("ledgerOutboxHealthEmitted24h", "Emitted (last 24 h)"),
    healthOldestPending:     s("ledgerOutboxHealthOldestPending", "Oldest pending"),
    healthOldestPendingUnit: s("ledgerOutboxHealthOldestPendingUnit", "min"),
    healthNone:              s("ledgerOutboxHealthNone",       "—"),
    tabFailed:               s("ledgerOutboxTabFailed",        "Failed (needs review)"),
    tabPending:              s("ledgerOutboxTabPending",       "Pending"),
    tabProcessing:           s("ledgerOutboxTabProcessing",    "Processing"),
    tabEmitted:              s("ledgerOutboxTabEmitted",       "Emitted"),
    retryAll:                s("ledgerOutboxRetryAll",         "Retry all"),
    retrying:                s("ledgerOutboxRetrying",         "Resetting…"),
    retry:                   s("ledgerOutboxRetry",            "Retry"),
    loading:                 s("ledgerOutboxLoading",          "Loading…"),
    colEventType:            s("ledgerOutboxColEventType",     "Event Type"),
    colBizObject:            s("ledgerOutboxColBizObject",     "Business Object"),
    colSource:               s("ledgerOutboxColSource",        "Source"),
    colStatus:               s("ledgerOutboxColStatus",        "Status"),
    colAttempts:             s("ledgerOutboxColAttempts",      "Attempts"),
    colLastError:            s("ledgerOutboxColLastError",     "Last Error"),
    colCreated:              s("ledgerOutboxColCreated",       "Created"),
    emptyFailed:             s("ledgerOutboxEmptyFailed",     "Proof trail healthy — no events require manual review."),
    emptyPending:            s("ledgerOutboxEmptyPending",    "No queued proof events."),
    emptyProcessing:         s("ledgerOutboxEmptyProcessing", "No events currently being drained."),
    emptyEmitted:            s("ledgerOutboxEmptyEmitted",    "No emitted outbox events in this filter."),
    copyKey:                 s("ledgerOutboxCopyKey",         "Copy key"),
    copyPayload:             s("ledgerOutboxCopyPayload",     "Copy payload"),
    copied:                  s("ledgerOutboxCopied",          "Copied!"),
    openObject:              s("ledgerOutboxOpenObject",      "Open reservation"),
    tabConversion:           s("tabConversion",                "Conversion"),
    tabScorecards:           s("tabScorecards",                "Scorecards"),
    tabLedgerOutbox:         s("tabLedgerOutbox",              "Ledger Outbox"),
  };

  // Determine whether the current user may trigger retries.
  // Only SUPERADMIN and ADMIN_FINANCE may mutate (retry / flush).
  const session = await getServerSession(authOptions);
  const roles: string[] = (session?.user as Record<string, unknown> | undefined)?.roles as string[] ?? [];
  const canRetry = roles.some((r) => ["SUPERADMIN", "ADMIN_FINANCE"].includes(r));

  return (
    <AdminPageShell>
      <LedgerOutboxClient t={t} canRetry={canRetry} />
    </AdminPageShell>
  );
}
