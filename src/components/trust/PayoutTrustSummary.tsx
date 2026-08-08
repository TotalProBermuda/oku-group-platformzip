"use client";

import { useEffect, useState } from "react";
import type { BeneficiaryProfileView } from "@/server/beneficiaries/beneficiaryService";
import { useTranslation } from "@/i18n/useTranslation";
import { TrustCard } from "./TrustCard";
import type { BeneficiaryStatusValue } from "./BeneficiaryStatusPill";

interface Props {
  /** Where the "Update bank info" link should point. Defaults to /my/beneficiary. */
  manageHref?: string;
}

/**
 * Calm, one-glance payout trust summary for persona dashboards.
 *
 * Pulls the signed-in user's own beneficiary view and renders a single
 * TrustCard. Renders nothing when:
 *  - the user has no beneficiary profile yet, or
 *  - the request fails / the user isn't authorised.
 *
 * Copy lives in the `privacy` i18n namespace (`trustCard.*`) so the card
 * renders in the user's chosen locale (EN/ES/PT). See `replit.md` →
 * "i18n parity rule" for the standing project rule.
 */
export function PayoutTrustSummary({ manageHref = "/my/beneficiary" }: Props) {
  const { t } = useTranslation();
  const [profile, setProfile] = useState<BeneficiaryProfileView | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/v1/me/beneficiary")
      .then((r) => (r.ok ? r.json() : { ok: false }))
      .then((j) => {
        if (cancelled) return;
        if (j?.ok && j.data) setProfile(j.data as BeneficiaryProfileView);
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loaded || !profile) return null;

  const status = profile.status.bankReadinessStatus as BeneficiaryStatusValue;
  const last4 = profile.bank.accountLast4;
  const ready = profile.status.payoutEligible;

  const primary = ready
    ? t("privacy", "trustCard.primary.ready")
    : t("privacy", "trustCard.primary.notReady");

  const secondary = last4
    ? t("privacy", "trustCard.secondary.withLast4").replace("{digits}", last4)
    : t("privacy", "trustCard.secondary.noBank");

  return (
    <TrustCard
      status={status}
      title={t("privacy", "trustCard.titleProtection")}
      primaryMessage={primary}
      secondaryMessage={secondary}
      ctaLabel={ready ? t("privacy", "trustCard.cta.manage") : t("privacy", "trustCard.cta.complete")}
      ctaHref={manageHref}
    />
  );
}

export default PayoutTrustSummary;
