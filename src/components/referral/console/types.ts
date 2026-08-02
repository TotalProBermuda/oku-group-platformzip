/**
 * Pure Referrer Console — shared types (Task #144, slice A).
 *
 * DORMANT MODULE: these types back a reusable console shell that is NOT yet
 * wired into any production route. They exist so later slices (referrer,
 * streetside, influencer, partner) can adopt ONE governed console shape.
 *
 * Design rule: a "pure referrer" is a strict read-only observer. Nothing in
 * this console mutates reservations, binds INVU, or shows a canonical "paid"
 * figure — money is Phase-1 accrual only. Surfaces differ ONLY by label,
 * theme, and which optional tabs are shown, never by referral truth.
 */
import type { ReferralSurfacePolicy } from "@/lib/referrals/statusPolicy";

/** Tabs a console may render, in the order they appear. */
export type ConsoleTabKey = "qr" | "offers" | "activity" | "earnings" | "profile" | "menu";

/**
 * Archetype the console is themed/labelled for. This is a presentation concept
 * derived from the viewer's `ReferralActor.actorTypeCode` (+ login role as a
 * fallback) — it is NOT a new RoleKey and never gates data.
 */
export type ConsoleArchetype =
  | "STREETSIDE"
  | "REFERRER"
  | "TAXI"
  | "CONCIERGE"
  | "TOUR_GUIDE"
  | "PROMOTER"
  | "INFLUENCER"
  | "PARTNER"
  | "GENERIC";

/** Accent colours for the console header/tab bar. On-brand gold by default. */
export interface ConsoleTheme {
  accent: string;
  accentSoft: string;
}

/**
 * Capability flags. All flags are presentation-only conveniences — none of
 * them unlock a mutation. A pure referrer console stays read-only regardless.
 */
export interface ConsoleCapabilities {
  /** Show a "Share on WhatsApp" CTA under the QR (messaging-first referrers). */
  showWhatsAppShare: boolean;
  /** Show the guest-facing venue menu tab (streetside door hosts). */
  showMenuTab: boolean;
  /** Show the QR "show this to your guest" instruction card. */
  showQRInstruction: boolean;
}

/**
 * Fully-resolved, immutable console configuration. Produced by
 * `resolveConsoleConfig` in `roleConfig.ts` and consumed by the shell.
 */
export interface ConsoleConfig {
  archetype: ConsoleArchetype;
  /** Tabs to render, in display order. */
  tabs: readonly ConsoleTabKey[];
  /** Tab shown on first paint. */
  defaultTab: ConsoleTabKey;
  theme: ConsoleTheme;
  capabilities: ConsoleCapabilities;
  /** i18n key in the `referrals` namespace for the role-label pill. */
  roleLabelKey: string;
  /**
   * Active/history split policy for this surface. The shared feed splits
   * server-side today; this is carried so a surface that computes its own
   * split (streetside) stays governed by ONE policy definition.
   */
  surfacePolicy: ReferralSurfacePolicy;
}

/** Identity shown in the profile module. Purely display data. */
export interface ConsoleIdentity {
  displayName: string;
  referralCode: string;
  organization?: string;
}
