// ───────────────────────────────────────────────────────────────────────────
// Single source of truth for every link that leaves this site.
//
// All commercial actions (table reservations + event-ticket checkout) happen on
// the shared OKÜ Hospitality Group engine — this CATCH site never takes payment.
//
// These paths are verified against the live group app:
//   • Reservations         ->  /{locale}/reservations
//   • Events ("Series")     ->  /{locale}/series
//   • A specific event      ->  /{locale}/series/{seriesSlug}
// The group app currently does NOT filter reservations or series by venue via a
// query string, so we link to the real pages directly (no ?concept / ?venue).
// ───────────────────────────────────────────────────────────────────────────

export const GROUP_BASE = "https://okuhospitalitygroup.com";
export const LOCALE = "en";

const base = `${GROUP_BASE}/${LOCALE}`;

// Reservations -> group reservation wizard.
export const reserveUrl = `${base}/reservations`;

// Events listing on the group engine (the platform calls these "Series").
export const eventsUrl = `${base}/series`;

// Ticket checkout. Pass the REAL group "Series" slug to deep-link a specific
// event; with no slug we send the guest to the events browse page (never a 404).
export const ticketUrl = (seriesSlug?: string) =>
  seriesSlug ? `${base}/series/${seriesSlug}` : eventsUrl;
