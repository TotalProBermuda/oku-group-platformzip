import type { Locale } from "@/types/i18n";

import enCommon from "./translations/en/common.json";
import enNavigation from "./translations/en/navigation.json";
import enFooter from "./translations/en/footer.json";
import enHome from "./translations/en/home.json";
import enVenues from "./translations/en/venues.json";
import enBooking from "./translations/en/booking.json";
import enForms from "./translations/en/forms.json";
import enValidation from "./translations/en/validation.json";
import enSeo from "./translations/en/seo.json";
import enAuth from "./translations/en/auth.json";
import enMembership from "./translations/en/membership.json";
import enEvents from "./translations/en/events.json";
import enDashboard from "./translations/en/dashboard.json";
import enAdmin from "./translations/en/admin.json";
import enErrors from "./translations/en/errors.json";
import enTickets from "./translations/en/tickets.json";
import enReferrals from "./translations/en/referrals.json";
import enEmails from "./translations/en/emails.json";
import enCheckin from "./translations/en/checkin.json";
import enHost from "./translations/en/host.json";
import enPrivacy from "./translations/en/privacy.json";

import esCommon from "./translations/es/common.json";
import esNavigation from "./translations/es/navigation.json";
import esFooter from "./translations/es/footer.json";
import esHome from "./translations/es/home.json";
import esVenues from "./translations/es/venues.json";
import esBooking from "./translations/es/booking.json";
import esForms from "./translations/es/forms.json";
import esValidation from "./translations/es/validation.json";
import esSeo from "./translations/es/seo.json";
import esAuth from "./translations/es/auth.json";
import esMembership from "./translations/es/membership.json";
import esEvents from "./translations/es/events.json";
import esDashboard from "./translations/es/dashboard.json";
import esAdmin from "./translations/es/admin.json";
import esErrors from "./translations/es/errors.json";
import esTickets from "./translations/es/tickets.json";
import esReferrals from "./translations/es/referrals.json";
import esEmails from "./translations/es/emails.json";
import esCheckin from "./translations/es/checkin.json";
import esHost from "./translations/es/host.json";
import esPrivacy from "./translations/es/privacy.json";

import ptCommon from "./translations/pt/common.json";
import ptNavigation from "./translations/pt/navigation.json";
import ptFooter from "./translations/pt/footer.json";
import ptHome from "./translations/pt/home.json";
import ptVenues from "./translations/pt/venues.json";
import ptBooking from "./translations/pt/booking.json";
import ptForms from "./translations/pt/forms.json";
import ptValidation from "./translations/pt/validation.json";
import ptSeo from "./translations/pt/seo.json";
import ptAuth from "./translations/pt/auth.json";
import ptMembership from "./translations/pt/membership.json";
import ptEvents from "./translations/pt/events.json";
import ptDashboard from "./translations/pt/dashboard.json";
import ptAdmin from "./translations/pt/admin.json";
import ptErrors from "./translations/pt/errors.json";
import ptTickets from "./translations/pt/tickets.json";
import ptReferrals from "./translations/pt/referrals.json";
import ptEmails from "./translations/pt/emails.json";
import ptCheckin from "./translations/pt/checkin.json";
import ptHost from "./translations/pt/host.json";
import ptPrivacy from "./translations/pt/privacy.json";

export interface AdminLaunchReadinessTranslations {
  navLabel: string;
  title: string;
  subtitle: string;
  overallVerdict: string;
  verdictGo: string;
  verdictNoGo: string;
  blockingFailures: string;
  readyToLaunch: string;
  refresh: string;
  refreshing: string;
  sendTestAlert: string;
  sendingTestAlert: string;
  sendTestAlertOk: string;
  sendTestAlertError: string;
  lastChecked: string;
  statusPass: string;
  statusWarn: string;
  statusFail: string;
  fix: string;
  informational: string;
  blocking: string;
  errorTitle: string;
  errorBody: string;
  historyTitle: string;
  historySubtitle: string;
  historyEmpty: string;
  historyGate: string;
  historyOverall: string;
  alertsTitle: string;
  alertsSubtitle: string;
  alertsEmpty: string;
  alertsColTime: string;
  alertsColEvent: string;
  alertsColRecipients: string;
  alertsColStatus: string;
  alertsEventNoGo: string;
  alertsEventResolved: string;
  alertsEventRetry: string;
  alertsEventSkipped: string;
  alertsRecipientsCount: string;
  alertsDeliveredOf: string;
  alertsStatusDelivered: string;
  alertsStatusPartial: string;
  alertsStatusFailed: string;
  alertsStatusSkipped: string;
  alertsReasonNoRecipients: string;
  alertsReasonAllFailed: string;
  alertsReasonRetryFailed: string;
  alertsReasonPartial: string;
  alertsReasonGeneric: string;
  testAlertsTitle: string;
  testAlertsSubtitle: string;
  testAlertsEmpty: string;
  testAlertsColTime: string;
  testAlertsColActor: string;
  testAlertsColRecipient: string;
  testAlertsColStatus: string;
  testAlertsStatusOk: string;
  testAlertsStatusFailed: string;
  testAlertsUnknownActor: string;
}

type WidenTranslation<T> = T extends string
  ? string
  : T extends number | boolean | null
    ? T
    : T extends readonly (infer Item)[]
      ? WidenTranslation<Item>[]
      : T extends object
        ? { [Key in keyof T]: WidenTranslation<T[Key]> }
        : T;

export type AdminTranslations = WidenTranslation<typeof enAdmin> & {
  launchReadiness?: AdminLaunchReadinessTranslations;
};

export type Translations = {
  common: WidenTranslation<typeof enCommon>;
  navigation: WidenTranslation<typeof enNavigation>;
  footer: WidenTranslation<typeof enFooter>;
  home: WidenTranslation<typeof enHome>;
  venues: WidenTranslation<typeof enVenues>;
  booking: WidenTranslation<typeof enBooking>;
  forms: WidenTranslation<typeof enForms>;
  validation: WidenTranslation<typeof enValidation>;
  seo: WidenTranslation<typeof enSeo>;
  auth: WidenTranslation<typeof enAuth>;
  membership: WidenTranslation<typeof enMembership>;
  events: WidenTranslation<typeof enEvents>;
  dashboard: WidenTranslation<typeof enDashboard>;
  admin: AdminTranslations;
  errors: WidenTranslation<typeof enErrors>;
  tickets: WidenTranslation<typeof enTickets>;
  referrals: WidenTranslation<typeof enReferrals>;
  emails: Record<string, unknown>;
  checkin: WidenTranslation<typeof enCheckin>;
  host: Record<string, unknown>;
  privacy: Record<string, string>;
};

export const translations: Record<Locale, Translations> = {
  en: {
    common: enCommon,
    navigation: enNavigation,
    footer: enFooter,
    home: enHome,
    venues: enVenues,
    booking: enBooking,
    forms: enForms,
    validation: enValidation,
    seo: enSeo,
    auth: enAuth,
    membership: enMembership,
    events: enEvents,
    dashboard: enDashboard,
    admin: enAdmin,
    errors: enErrors,
    tickets: enTickets,
    referrals: enReferrals,
    emails: enEmails,
    checkin: enCheckin,
    host: enHost as Record<string, unknown>,
    privacy: enPrivacy,
  },
  es: {
    common: esCommon,
    navigation: esNavigation,
    footer: esFooter,
    home: esHome,
    venues: esVenues,
    booking: esBooking,
    forms: esForms,
    validation: esValidation,
    seo: esSeo,
    auth: esAuth,
    membership: esMembership,
    events: esEvents,
    dashboard: esDashboard,
    admin: esAdmin,
    errors: esErrors,
    tickets: esTickets,
    referrals: esReferrals,
    emails: esEmails,
    checkin: esCheckin,
    host: esHost as Record<string, unknown>,
    privacy: { ...enPrivacy, ...esPrivacy },
  },
  pt: {
    common: ptCommon,
    navigation: ptNavigation,
    footer: ptFooter,
    home: ptHome,
    venues: ptVenues,
    booking: ptBooking,
    forms: ptForms,
    validation: ptValidation,
    seo: ptSeo,
    auth: ptAuth,
    membership: ptMembership,
    events: ptEvents,
    dashboard: ptDashboard,
    admin: ptAdmin,
    errors: ptErrors,
    tickets: ptTickets,
    referrals: ptReferrals,
    emails: ptEmails,
    checkin: ptCheckin,
    host: ptHost as Record<string, unknown>,
    privacy: { ...enPrivacy, ...ptPrivacy },
  },
};

export function getTranslations(locale: Locale): Translations {
  return translations[locale] || translations.en;
}
