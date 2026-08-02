import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const VENUE_SLUGS = ["oku", "catch", "terrace"] as const;
type VenueSlug = (typeof VENUE_SLUGS)[number];

function extractVenueSlug(metadata: unknown): VenueSlug | null {
  if (!metadata || typeof metadata !== "object") return null;
  const candidate = (metadata as Record<string, unknown>).venueSlug;
  if (typeof candidate !== "string") return null;
  const normalized = candidate.toLowerCase();
  return (VENUE_SLUGS as readonly string[]).includes(normalized) ? (normalized as VenueSlug) : null;
}

const VENUE_SCOPED_REFERRER_TYPES = new Set([
  "TAXI_DRIVER",
  "STREETSIDE_HOST",
  "HOTEL_CONCIERGE",
  "TOUR_GUIDE",
  "PARTNER",
]);

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");

  if (!code) return NextResponse.json({ error: "Missing code" }, { status: 400 });

  const upperCode = code.toUpperCase();

  const referrer = await prisma.referrer.findFirst({
    where: { referralCode: upperCode },
    select: {
      fullName: true,
      referralCode: true,
      referrerType: true,
      organizationName: true,
      metadataJson: true,
    },
  });

  if (referrer) {
    const venueSlug = extractVenueSlug(referrer.metadataJson);
    const isVenueScoped = VENUE_SCOPED_REFERRER_TYPES.has(referrer.referrerType);
    return NextResponse.json({
      fullName: referrer.fullName,
      referralCode: referrer.referralCode,
      referrerType: referrer.referrerType,
      organizationName: referrer.organizationName,
      venueSlug,
      isVenueScoped,
    });
  }

  // Fallback: HOST-* (and any other code minted directly on
  // EventReferrerAssignment without a Referrer row) is the modern
  // primitive — streetside hosts, sub-referrers, and partner seats all
  // carry their own EventReferrerAssignment.referralCode that doesn't
  // round-trip through the legacy Referrer table. Mirror the same
  // 3-tier resolution `resolveActorFromCode` performs so the wizard's
  // "Referred By" line renders for these codes too.
  const eventAssignment = await prisma.eventReferrerAssignment.findUnique({
    where: { referralCode: upperCode },
    select: {
      referralCode: true,
      displayName: true,
      parentHostProfileId: true,
      parentInfluencerId: true,
      parentPartnerId: true,
      parentHostProfile: {
        select: {
          user: { select: { name: true, email: true } },
        },
      },
      parentPartner: { select: { name: true } },
    },
  });

  if (!eventAssignment) {
    // Final fallback: the unified ReferralLink → ReferralActor chain (Task #104).
    // Modern share-wallet codes (REF-XXXXXXXX) live here, and neither legacy
    // table will resolve them. We surface the actor's display + organization
    // so the wizard's "Referred By" line still renders.
    const link = await prisma.referralLink.findUnique({
      where: { code: upperCode },
      include: {
        referralActor: {
          select: { displayName: true, organizationName: true, actorType: true },
        },
      },
    });
    if (link?.referralActor) {
      const actor = link.referralActor;
      const referrerType = actor.actorType ?? "REFERRER";
      return NextResponse.json({
        fullName: actor.displayName,
        referralCode: link.code,
        referrerType,
        organizationName: actor.organizationName ?? null,
        venueSlug: null,
        isVenueScoped: VENUE_SCOPED_REFERRER_TYPES.has(referrerType),
      });
    }
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const fullName =
    eventAssignment.parentHostProfile?.user?.name?.trim() ||
    eventAssignment.displayName?.trim() ||
    eventAssignment.parentHostProfile?.user?.email ||
    "Referrer";

  // Anchor type determines the wizard's "Referred By" copy/icon. HOST
  // anchor → streetside host; PARTNER anchor → partner; influencer
  // anchor falls through to a generic INFLUENCER label.
  const referrerType: string = eventAssignment.parentHostProfileId
    ? "STREETSIDE_HOST"
    : eventAssignment.parentPartnerId
    ? "PARTNER"
    : "INFLUENCER";

  return NextResponse.json({
    fullName,
    referralCode: eventAssignment.referralCode,
    referrerType,
    organizationName:
      eventAssignment.parentPartner?.name ?? null,
    venueSlug: null,
    isVenueScoped: VENUE_SCOPED_REFERRER_TYPES.has(referrerType),
  });
}
