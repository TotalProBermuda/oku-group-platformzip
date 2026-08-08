/**
 * Pure Referrer Console — role/actor-type → config resolver (Task #144, slice A).
 *
 * DORMANT: not wired into any route yet.
 *
 * `resolveConsoleConfig` is a pure function: given the viewer's login roles and
 * their `ReferralActor.actorTypeCode`, it returns the presentation `ConsoleConfig`.
 * Archetype resolution prefers the actor type (the canonical cross-role signal)
 * and falls back to the login role. It NEVER changes data access — only labels,
 * theme, and which optional tabs show.
 */
import type {
  ConsoleArchetype,
  ConsoleConfig,
  ConsoleTabKey,
  ConsoleTheme,
} from "./types";

const GOLD: ConsoleTheme = { accent: "#c8a96e", accentSoft: "rgba(200,169,110,0.15)" };

const THEME_BY_ARCHETYPE: Record<ConsoleArchetype, ConsoleTheme> = {
  STREETSIDE: GOLD,
  REFERRER: GOLD,
  TAXI: { accent: "#f5b301", accentSoft: "rgba(245,179,1,0.15)" },
  CONCIERGE: { accent: "#a78bfa", accentSoft: "rgba(167,139,250,0.15)" },
  TOUR_GUIDE: { accent: "#34d399", accentSoft: "rgba(52,211,153,0.15)" },
  PROMOTER: { accent: "#f472b6", accentSoft: "rgba(244,114,182,0.15)" },
  INFLUENCER: { accent: "#60a5fa", accentSoft: "rgba(96,165,250,0.15)" },
  PARTNER: GOLD,
  GENERIC: GOLD,
};

const ROLE_LABEL_KEY_BY_ARCHETYPE: Record<ConsoleArchetype, string> = {
  STREETSIDE: "console.role.streetside",
  REFERRER: "console.role.referrer",
  TAXI: "console.role.taxi",
  CONCIERGE: "console.role.concierge",
  TOUR_GUIDE: "console.role.tourGuide",
  PROMOTER: "console.role.promoter",
  INFLUENCER: "console.role.influencer",
  PARTNER: "console.role.partner",
  GENERIC: "console.role.generic",
};

const BASE_TABS: readonly ConsoleTabKey[] = ["qr", "offers", "activity", "earnings", "profile"];

/** Map a `ReferralActor.actorTypeCode` to a console archetype. */
function archetypeFromActorType(actorTypeCode: string): ConsoleArchetype | null {
  switch (actorTypeCode) {
    case "STREETSIDE_HOST":
      return "STREETSIDE";
    case "TAXI_DRIVER":
    case "UBER_DRIVER":
      return "TAXI";
    case "HOTEL_CONCIERGE":
      return "CONCIERGE";
    case "TOUR_GUIDE":
      return "TOUR_GUIDE";
    case "PROMOTER":
      return "PROMOTER";
    case "INFLUENCER_SUB_REFERRER":
      return "INFLUENCER";
    case "PRIVATE_NETWORK":
    case "OTHER":
      return "GENERIC";
    default:
      return null;
  }
}

/** Fallback: map a login role to a console archetype when no actor type is known. */
function archetypeFromRoles(roles: readonly string[]): ConsoleArchetype {
  if (roles.includes("STREETSIDE_HOST")) return "STREETSIDE";
  if (roles.includes("INFLUENCER")) return "INFLUENCER";
  if (roles.includes("PARTNER")) return "PARTNER";
  if (roles.includes("REFERRER")) return "REFERRER";
  return "GENERIC";
}

export interface ResolveConsoleInput {
  /** Viewer's login roles (RoleKey strings). */
  roles?: readonly string[];
  /** Viewer's owned `ReferralActor.actorTypeCode`, when known. */
  actorTypeCode?: string | null;
}

/**
 * Pure resolver: (roles, actorTypeCode) → immutable ConsoleConfig.
 * Actor type wins; login role is the fallback; GENERIC is the safe default.
 */
export function resolveConsoleConfig({
  roles = [],
  actorTypeCode,
}: ResolveConsoleInput): ConsoleConfig {
  const archetype: ConsoleArchetype =
    (actorTypeCode ? archetypeFromActorType(actorTypeCode) : null) ??
    archetypeFromRoles(roles);

  const isStreetside = archetype === "STREETSIDE";

  const tabs: readonly ConsoleTabKey[] = isStreetside
    ? ([...BASE_TABS.slice(0, 1), "menu", ...BASE_TABS.slice(1)] as ConsoleTabKey[])
    : BASE_TABS;

  return {
    archetype,
    tabs,
    defaultTab: "qr",
    theme: THEME_BY_ARCHETYPE[archetype],
    roleLabelKey: ROLE_LABEL_KEY_BY_ARCHETYPE[archetype],
    surfacePolicy: isStreetside ? "STREETSIDE" : "DEFAULT",
    capabilities: {
      // Default: all referrer archetypes get the instruction card and WhatsApp CTA.
      // Streetside opts out of WhatsApp share (they hand the phone physically).
      // Streetside opts in to the menu tab (guest-facing venue menu at the door).
      showWhatsAppShare: !isStreetside,
      showMenuTab: isStreetside,
      // Show "Show this to your guest" instruction card for ALL archetypes —
      // taxi drivers, concierges, influencers, and partners all hand their phone
      // to a guest. Only streetside was getting this before; now it is the default.
      showQRInstruction: true,
    },
  };
}
