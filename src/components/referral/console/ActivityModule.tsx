"use client";

/**
 * Pure Referrer Console — activity module.
 *
 * Thin wrapper over the shared `MyReferralsFeed`. The feed self-fetches from
 * the single governed source (`/api/v1/me/referrals`) and owns the
 * Active/History split + rollups, so every referrer surface sees the SAME
 * live list. This module exists only to give the console a stable slot.
 */
import { MyReferralsFeed, type MyReferralsData } from "@/components/referral/MyReferralsFeed";

export interface ActivityModuleProps {
  /** Optional seed data to avoid a first-paint flash. */
  data?: MyReferralsData;
  /** Feed source; defaults to the governed shared endpoint. */
  endpoint?: string;
  /** Poll interval in ms (0 disables polling). */
  pollMs?: number;
  /** BCP-47 locale for date formatting. */
  locale?: string;
}

export function ActivityModule({ data, endpoint, pollMs, locale }: ActivityModuleProps) {
  return <MyReferralsFeed data={data} endpoint={endpoint} pollMs={pollMs} locale={locale} />;
}

export default ActivityModule;
