/**
 * Pure Referrer Console — barrel export.
 *
 * Wired: /referrer/dashboard (slice B). Remaining surfaces (streetside,
 * influencer, partner) adopt in subsequent slices.
 */
export * from "./types";
export * from "./roleConfig";
export { QRModule } from "./QRModule";
export { ActivityModule } from "./ActivityModule";
export { EarningsModule } from "./EarningsModule";
export { ProfileMenuModule, MenuSlotModule } from "./ProfileMenuModule";
export { PureReferrerConsole } from "./PureReferrerConsole";
