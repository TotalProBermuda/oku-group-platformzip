"use client";

/**
 * Pure Referrer Console — earnings module.
 *
 * Read-only ACCRUAL summary only. There is NO canonical "paid" state until
 * the Phase-2 payout-ledger bridge ships (see `ReferralCommissionState` in
 * `MyReferralsFeed`) — this module must never render a paid/approved figure.
 * It self-fetches the same governed feed endpoint used by `ActivityModule`
 * for its rollups, and shows the beneficiary/bank-readiness trust card
 * (itself read-only) so a referrer can see accrual + payout-trust in one
 * place without any ledger concept leaking in.
 */
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "@/components/i18n/LocaleProvider";
import { PayoutTrustSummary } from "@/components/trust/PayoutTrustSummary";
import type { MyReferralsData } from "@/components/referral/MyReferralsFeed";

const EMPTY_ROLLUPS: MyReferralsData["rollups"] = {
  activeCount: 0,
  historyCount: 0,
  commissionPendingCents: 0,
  paidLedgerAvailable: false,
};

const fmt = (cents: number) =>
  "$" + (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

export interface EarningsModuleProps {
  /** Optional seed rollups to avoid a first-paint flash. */
  data?: MyReferralsData;
  /** Feed source; defaults to the governed shared endpoint. */
  endpoint?: string;
  /** Where "manage bank info" should link. Defaults to /my/beneficiary. */
  manageBeneficiaryHref?: string;
}

export function EarningsModule({
  data: initialData,
  endpoint = "/api/v1/me/referrals",
  manageBeneficiaryHref,
}: EarningsModuleProps) {
  const t = useTranslation();
  const [rollups, setRollups] = useState(initialData?.rollups ?? EMPTY_ROLLUPS);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    async function load() {
      try {
        const res = await fetch(endpoint, { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as MyReferralsData;
        if (alive.current && json?.rollups) setRollups(json.rollups);
      } catch {
        /* keep last-good rollups on transient failure */
      }
    }
    load();
    return () => {
      alive.current = false;
    };
  }, [endpoint]);

  return (
    <section style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 16, fontWeight: 800, margin: "0 0 12px", letterSpacing: "0.02em" }}>
        {t("referrals", "console.earnings.title")}
      </h2>

      <div
        style={{
          background: "var(--layer-1, #fff)",
          border: "1px solid var(--color-border, #e5e7eb)",
          borderRadius: 12,
          padding: "18px 20px",
          marginBottom: 16,
        }}
      >
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 12, color: "var(--color-text-muted, #6b7280)" }}>
              {t("referrals", "console.earnings.accruedLabel")}
            </div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{fmt(rollups.commissionPendingCents)}</div>
            <div style={{ fontSize: 11, color: "var(--color-text-muted, #6b7280)" }}>
              {t("referrals", "console.earnings.accruedHint")}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "var(--color-text-muted, #6b7280)" }}>
              {t("referrals", "console.earnings.activeLabel")}
            </div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{rollups.activeCount}</div>
          </div>
        </div>
        <p style={{ fontSize: 12, color: "var(--color-text-muted, #6b7280)", marginTop: 14, marginBottom: 0, lineHeight: 1.5 }}>
          {t("referrals", "console.earnings.notPaidNote")}
        </p>
      </div>

      <PayoutTrustSummary manageHref={manageBeneficiaryHref} />
    </section>
  );
}

export default EarningsModule;
