/**
 * OKÜ Hospitality Group — Demo Seed
 * Populates: influencer profiles, referrer personas, attendee personas, and orders.
 * Safe to re-run: uses upsert / skip-if-exists patterns.
 */

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

// ─── helpers ──────────────────────────────────────────────────────────────────

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ─── data ─────────────────────────────────────────────────────────────────────

const INFLUENCERS = [
  {
    email: "ines.montoya@oku.demo",
    name: "Inés Montoya",
    handle: "@ines.montoya",
    refCode: "INF-INES",
    displayName: "Inés Montoya",
    headline: "Chef · Culinary Storyteller · Miami",
    shortBio:
      "Michelin-trained chef turned hospitality curator. I bring guests inside the kitchen and beyond.",
    longBio:
      "After 12 years in fine dining across Paris, Tokyo, and Miami, Inés pivoted to creating immersive culinary experiences for a new generation of food lovers. Her series 'Table For Ten' sells out within hours and has been featured in Eater, Bon Appétit, and The New York Times T Magazine.",
    location: "Miami, FL",
    instagramUrl: "https://instagram.com/ines.montoya",
    tiktokUrl: "https://tiktok.com/@ines.montoya",
    websiteUrl: "https://inesmontoya.com",
    profileImageUrl: "https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=400&q=80",
    coverImageUrl: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1200&q=80",
    commissionRateBps: 1200,
    approved: true,
    isVerified: true,
    approvalStatus: "APPROVED" as const,
  },
  {
    email: "rafael.diaz@oku.demo",
    name: "Rafael Díaz",
    handle: "@rafaeldiaz",
    refCode: "INF-RAFAEL",
    displayName: "Rafael Díaz",
    headline: "Sommelier · Wine Educator · NYC",
    shortBio:
      "Former head sommelier at Eleven Madison Park. Now leading intimate wine-pairing journeys.",
    longBio:
      "Rafael's events combine deep wine knowledge with cinematic ambience. His monthly 'Cellar Sessions' in lower Manhattan draw collectors, restaurateurs, and curious beginners alike. He holds the WSET Diploma and is a Court of Master Sommeliers candidate.",
    location: "New York, NY",
    instagramUrl: "https://instagram.com/rafaeldiaz.wine",
    tiktokUrl: null,
    websiteUrl: "https://rafaeldiaz.wine",
    profileImageUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&q=80",
    coverImageUrl: "https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=1200&q=80",
    commissionRateBps: 1000,
    approved: true,
    isVerified: true,
    approvalStatus: "APPROVED" as const,
  },
  {
    email: "leila.nasser@oku.demo",
    name: "Leila Nasser",
    handle: "@leila.nasser",
    refCode: "INF-LEILA",
    displayName: "Leila Nasser",
    headline: "Art Director · Collector · LA",
    shortBio: "Curator of experiences at the intersection of contemporary art, design, and dining.",
    longBio:
      "Leila has spent a decade programming cultural dinners, gallery openings, and design salons for some of LA's most coveted circles. Her events often feature emerging artists and debut collections — a unique gateway for collectors and creators.",
    location: "Los Angeles, CA",
    instagramUrl: "https://instagram.com/leila.nasser",
    tiktokUrl: "https://tiktok.com/@leila.nasser",
    websiteUrl: "https://leilanasser.studio",
    profileImageUrl: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&q=80",
    coverImageUrl: "https://images.unsplash.com/photo-1553361371-9b22f78e8b1d?w=1200&q=80",
    commissionRateBps: 1500,
    approved: true,
    isVerified: true,
    approvalStatus: "APPROVED" as const,
  },
  {
    email: "tomas.reyes@oku.demo",
    name: "Tomás Reyes",
    handle: "@tomasreyes",
    refCode: "INF-TOMAS",
    displayName: "Tomás Reyes",
    headline: "Architect · Hospitality Designer · Mexico City",
    shortBio:
      "I design the spaces you'll never forget. My events are tours through the architecture of pleasure.",
    longBio:
      "Tomás runs a boutique architecture practice specialising in restaurant and hospitality interiors across LATAM. He hosts quarterly design salons in Mexico City that routinely draw architects, developers, and lifestyle entrepreneurs from across the hemisphere.",
    location: "Mexico City, MX",
    instagramUrl: "https://instagram.com/tomasreyes.arch",
    tiktokUrl: null,
    websiteUrl: "https://reyesarch.mx",
    profileImageUrl: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&q=80",
    coverImageUrl: "https://images.unsplash.com/photo-1487958449943-2429e8be8625?w=1200&q=80",
    commissionRateBps: 800,
    approved: true,
    isVerified: false,
    approvalStatus: "APPROVED" as const,
  },
  {
    email: "nina.volkov@oku.demo",
    name: "Nina Volkov",
    handle: "@ninavolkov",
    refCode: "INF-NINA",
    displayName: "Nina Volkov",
    headline: "Mixologist · Sensory Experience Curator · Miami",
    shortBio: "I build cocktails the way architects build rooms — every detail has intention.",
    longBio:
      "Nina is the creative force behind Miami's most talked-about cocktail pop-ups. Her sensory supper clubs blend molecular mixology with perfumery, fashion, and performance art. She has consulted for W Hotels, Four Seasons, and Diageo.",
    location: "Miami, FL",
    instagramUrl: "https://instagram.com/ninavolkov.mix",
    tiktokUrl: "https://tiktok.com/@ninavolkov",
    websiteUrl: "https://ninavolkov.co",
    profileImageUrl: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400&q=80",
    coverImageUrl: "https://images.unsplash.com/photo-1516997121675-4c2d1684aa3e?w=1200&q=80",
    commissionRateBps: 1200,
    approved: false,
    isVerified: false,
    approvalStatus: "PENDING" as const,
  },
];

// ─── Referrer personas: walk-in & corporate referrers ─────────────────────────

const REFERRERS = [
  {
    email: "concierge.palacio@oku.demo",
    name: "Hotel Palacio Concierge",
    fullName: "Hotel Palacio Concierge Desk",
    referralCode: "REF-PALACIO",
    referrerType: "HOTEL_CONCIERGE" as const,
    organizationName: "Hotel Palacio de las Flores",
    phone: "+507-555-0101",
    persona: "Luxury Hotel Concierge",
    notes: "Premium partner — 5-star hotel directing guests to OKÜ experiences",
  },
  {
    email: "marco.pellegrini@oku.demo",
    name: "Marco Pellegrini",
    fullName: "Marco Pellegrini",
    referralCode: "REF-MARCO",
    referrerType: "PARTNER" as const,
    organizationName: null,
    phone: "+1-786-555-0202",
    persona: "Corporate Event Planner",
    notes: "Books group tables for corporate entertainment; high conversion rate",
  },
  {
    email: "alejandro.tours@oku.demo",
    name: "Alejandro Vidal",
    fullName: "Alejandro Vidal",
    referralCode: "REF-ALEJANDRO",
    referrerType: "TOUR_GUIDE" as const,
    organizationName: "Panama City VIP Tours",
    phone: "+507-555-0303",
    persona: "Luxury Tour Guide",
    notes: "Brings high-end tourism groups to OKÜ dining and experiences",
  },
  {
    email: "bora.kalkan@oku.demo",
    name: "Bora Kalkan",
    fullName: "Bora Kalkan",
    referralCode: "REF-BORA",
    referrerType: "STREETSIDE_HOST" as const,
    organizationName: null,
    phone: "+1-212-555-0404",
    persona: "Streetside Brand Ambassador",
    notes: "Walk-in referrer with strong local network; high foot-traffic converter",
  },
  {
    email: "vida.collective@oku.demo",
    name: "Vida Collective",
    fullName: "Vida Collective",
    referralCode: "REF-VIDA",
    referrerType: "PARTNER" as const,
    organizationName: "Vida Collective",
    phone: "+1-424-555-0505",
    persona: "Members Club Partner",
    notes: "Lifestyle members club with cross-promotional agreement",
  },
];

// ─── Persona archetypes: diverse attendee profiles ─────────────────────────

const ATTENDEES: Array<{
  email: string;
  name: string;
  persona: string;
  tags: string[];
  membershipTier?: string;
}> = [
  { email: "charlotte.wu@oku.demo",   name: "Charlotte Wu",       persona: "VIP Founding Member",     tags: ["founding-member", "vip", "repeat-attendee"],             membershipTier: "FOUNDER" },
  { email: "marcus.bell@oku.demo",    name: "Marcus Bell",        persona: "Corporate Executive",     tags: ["corporate", "bulk-buyer", "table-booker"],                membershipTier: "MEMBER" },
  { email: "ana.silva@oku.demo",      name: "Ana Silva",          persona: "Food Blogger",            tags: ["food-media", "comped", "press"],                          membershipTier: undefined },
  { email: "james.okafor@oku.demo",   name: "James Okafor",       persona: "First-Time Attendee",     tags: ["first-time", "referral"],                                 membershipTier: undefined },
  { email: "priya.sharma@oku.demo",   name: "Priya Sharma",       persona: "Repeat Collector",        tags: ["art-collector", "repeat-attendee", "vip"],               membershipTier: "MEMBER" },
  { email: "lucas.berti@oku.demo",    name: "Lucas Berti",        persona: "Restaurant Owner",        tags: ["industry", "b2b", "hospitality-professional"],           membershipTier: undefined },
  { email: "camille.dubois@oku.demo", name: "Camille Dubois",     persona: "Luxury PR Executive",     tags: ["luxury", "pr", "brand-partner", "vip"],                  membershipTier: "MEMBER" },
  { email: "darius.kim@oku.demo",     name: "Darius Kim",         persona: "Tech Entrepreneur",       tags: ["tech", "first-time", "high-net-worth"],                  membershipTier: undefined },
  { email: "fatima.hassan@oku.demo",  name: "Fatima Hassan",      persona: "Lifestyle Influencer",    tags: ["social-media", "micro-influencer", "content-creator"],   membershipTier: undefined },
  { email: "olivier.martin@oku.demo", name: "Olivier Martin",     persona: "Wine Collector",          tags: ["wine", "repeat-attendee", "sommelier"],                  membershipTier: "MEMBER" },
  { email: "sofia.ramos@oku.demo",    name: "Sofía Ramos",        persona: "Interior Designer",       tags: ["design", "creative", "industry"],                        membershipTier: undefined },
  { email: "ben.kowalski@oku.demo",   name: "Ben Kowalski",       persona: "Hospitality Investor",    tags: ["investor", "vip", "f&b-investor"],                       membershipTier: "FOUNDER" },
  { email: "amara.osei@oku.demo",     name: "Amara Osei",         persona: "Creative Director",       tags: ["creative", "fashion", "culture"],                        membershipTier: undefined },
  { email: "victor.chen@oku.demo",    name: "Victor Chen",        persona: "Private Club Member",     tags: ["private-club", "vip", "repeat-attendee"],               membershipTier: "MEMBER" },
  { email: "isabela.cruz@oku.demo",   name: "Isabela Cruz",       persona: "Artist",                  tags: ["artist", "creative", "culture"],                         membershipTier: undefined },
  { email: "henry.ashford@oku.demo",  name: "Henry Ashford",      persona: "Real Estate Developer",   tags: ["real-estate", "high-net-worth", "investor"],             membershipTier: undefined },
  { email: "mia.tanaka@oku.demo",     name: "Mia Tanaka",         persona: "Fashion Buyer",           tags: ["fashion", "luxury", "repeat-attendee"],                  membershipTier: "MEMBER" },
  { email: "carlos.vega@oku.demo",    name: "Carlos Vega",        persona: "Chef (Industry)",         tags: ["chef", "industry", "culinary"],                          membershipTier: undefined },
  { email: "elena.popov@oku.demo",    name: "Elena Popov",        persona: "Brand Strategist",        tags: ["brand", "marketing", "luxury"],                          membershipTier: undefined },
  { email: "jay.moreau@oku.demo",     name: "Jay Moreau",         persona: "Young Professional",      tags: ["first-time", "young-professional", "aspiring-member"],   membershipTier: undefined },
];

// ─── Streetside Host personas ─────────────────────────────────────────────────

const STREETSIDE_HOSTS = [
  {
    email: "maya.okonkwo@oku.demo",
    name: "Maya Okonkwo",
    displayName: "Maya O.",
    badgeColor: "#a78bfa",
    refCode: "SIDE-MAYA",
    phone: "+507-6300-0011",
    isActive: true,
    persona: "Street-facing brand ambassador · high energy · tourist corridor",
  },
  {
    email: "felix.santos@oku.demo",
    name: "Félix Santos",
    displayName: "Félix S.",
    badgeColor: "#34d399",
    refCode: "SIDE-FELIX",
    phone: "+507-6300-0012",
    isActive: false,
    persona: "Bilingual host (EN/ES/PT) · strong conversion on walk-in groups",
  },
  {
    email: "isla.morrow@oku.demo",
    name: "Isla Morrow",
    displayName: "Isla M.",
    badgeColor: "#f59e0b",
    refCode: "SIDE-ISLA",
    phone: "+507-6300-0013",
    isActive: true,
    persona: "Evening specialist · fashion crowd · club introductions",
  },
  {
    email: "dani.reyes@oku.demo",
    name: "Dani Reyes",
    displayName: "Dani R.",
    badgeColor: "#60a5fa",
    refCode: "SIDE-DANI",
    phone: "+507-6300-0014",
    isActive: false,
    persona: "Weekend host · high-net-worth neighbourhood reach",
  },
];

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🌱  OKÜ Demo Seed starting…\n");

  // ── 1. Influencer profiles ────────────────────────────────────────────────
  console.log("  → Seeding influencers…");
  for (const inf of INFLUENCERS) {
    const user = await prisma.user.upsert({
      where:  { email: inf.email },
      update: { name: inf.name },
      create: {
        email:  inf.email,
        name:   inf.name,
        status: "ACTIVE",
        tags:   ["demo", "influencer"],
      },
    });

    const existing = await prisma.influencerProfile.findUnique({ where: { userId: user.id } });
    if (!existing) {
      await prisma.influencerProfile.create({
        data: {
          userId:            user.id,
          handle:            inf.handle,
          refCode:           inf.refCode,
          commissionRateBps: inf.commissionRateBps,
          approved:          inf.approved,
          displayName:       inf.displayName,
          headline:          inf.headline,
          shortBio:          inf.shortBio,
          longBio:           inf.longBio,
          location:          inf.location,
          instagramUrl:      inf.instagramUrl,
          tiktokUrl:         inf.tiktokUrl ?? null,
          websiteUrl:        inf.websiteUrl,
          profileImageUrl:   inf.profileImageUrl,
          coverImageUrl:     inf.coverImageUrl,
          isPublic:          true,
          isVerified:        inf.isVerified,
          approvalStatus:    inf.approvalStatus,
        },
      });
      console.log(`     ✓ Created influencer: ${inf.displayName} (${inf.handle})`);
    } else {
      await prisma.influencerProfile.update({
        where: { userId: user.id },
        data: {
          displayName:     inf.displayName,
          headline:        inf.headline,
          shortBio:        inf.shortBio,
          longBio:         inf.longBio,
          location:        inf.location,
          profileImageUrl: inf.profileImageUrl,
          coverImageUrl:   inf.coverImageUrl,
          isVerified:      inf.isVerified,
        },
      });
      console.log(`     ↺ Updated influencer: ${inf.displayName}`);
    }
  }

  // ── 2. Referrer personas ──────────────────────────────────────────────────
  console.log("\n  → Seeding referrer personas…");
  for (const ref of REFERRERS) {
    // Create or find the backing user
    const user = await prisma.user.upsert({
      where:  { email: ref.email },
      update: { name: ref.name },
      create: {
        email:  ref.email,
        name:   ref.name,
        status: "ACTIVE",
        tags:   ["demo", "referrer"],
        internalNotes: `Demo referrer persona: ${ref.persona}. ${ref.notes}`,
      },
    });

    // Upsert the Referrer record
    const existing = await prisma.referrer.findUnique({ where: { referralCode: ref.referralCode } });
    if (!existing) {
      await prisma.referrer.create({
        data: {
          userId:           user.id,
          fullName:         ref.fullName,
          referrerType:     ref.referrerType,
          referralCode:     ref.referralCode,
          phone:            ref.phone ?? null,
          email:            ref.email,
          organizationName: ref.organizationName ?? null,
          isActive:         true,
          metadataJson:     { persona: ref.persona, notes: ref.notes, demo: true },
        },
      });
      console.log(`     ✓ Created referrer: ${ref.fullName} (${ref.referralCode})`);
    } else {
      console.log(`     ↺ Exists: ${ref.fullName}`);
    }
  }

  // ── 3. Attendee personas ──────────────────────────────────────────────────
  console.log("\n  → Seeding attendee personas…");
  const createdAttendees: string[] = [];

  const TIER_MAP: Record<string, "EXPLORER" | "INSIDER" | "PATRON" | "FOUNDER"> = {
    FOUNDER: "FOUNDER",
    MEMBER:  "PATRON",
    INSIDER: "INSIDER",
    EXPLORER: "EXPLORER",
    PATRON: "PATRON",
  };

  for (const att of ATTENDEES) {
    const user = await prisma.user.upsert({
      where:  { email: att.email },
      update: { name: att.name, tags: ["demo", "attendee", ...att.tags] },
      create: {
        email:  att.email,
        name:   att.name,
        status: "ACTIVE",
        tags:   ["demo", "attendee", ...att.tags],
        internalNotes: `Demo persona: ${att.persona}`,
      },
    });
    createdAttendees.push(user.id);

    if (att.membershipTier) {
      const tier = TIER_MAP[att.membershipTier] ?? "PATRON";
      const existingMembership = await prisma.membership.findUnique({ where: { userId: user.id } });
      if (!existingMembership) {
        await prisma.membership.create({
          data: {
            userId:  user.id,
            tier,
            status:  "ACTIVE",
            startsAt: new Date(),
          },
        });
      }
    }

    console.log(`     ✓ ${att.persona}: ${att.name}${att.membershipTier ? ` [${att.membershipTier}]` : ""}`);
  }

  // ── 4. Demo orders ────────────────────────────────────────────────────────
  console.log("\n  → Seeding demo orders…");

  const sessions = await prisma.session.findMany({
    select: { id: true, seriesId: true },
    take: 6,
  });
  const influencerProfiles = await prisma.influencerProfile.findMany({
    where: { approved: true },
    select: { id: true },
    take: 4,
  });

  if (sessions.length === 0) {
    console.log("     ⚠ No sessions found — skipping orders");
  } else {
    const ORDER_STATUSES = ["PAID", "PAID", "PAID", "PENDING", "CANCELLED"] as const;
    const ATTRIBUTION_SOURCES = ["DIRECT", "DIRECT", "INFLUENCER_HOST", "EVENT_REFERRER_LINK"] as const;
    const DEMO_TRANS_IDS = ["AUTH-100123", "AUTH-100456", "AUTH-100789", "AUTH-101234", "AUTH-101567"];
    let ordersCreated = 0;

    for (const userId of createdAttendees.slice(0, 15)) {
      const existingOrders = await prisma.order.count({ where: { userId } });
      if (existingOrders > 0) continue;

      const sessionsToBook = sessions.slice(0, rand([1, 1, 2, 2, 3]));

      for (const session of sessionsToBook) {
        const ticketType = await prisma.ticketType.findFirst({
          where: { seriesId: session.seriesId },
          select: { id: true, name: true, priceCents: true },
        });

        const basePriceCents = ticketType?.priceCents ?? 15000;
        const qty = rand([1, 1, 1, 2]);
        const subtotal = basePriceCents * qty;
        const fees = Math.round(subtotal * 0.05);
        const tax = Math.round(subtotal * 0.085);
        const total = subtotal + fees + tax;

        const attrSource = rand(ATTRIBUTION_SOURCES);
        const attrInfluencerId =
          attrSource === "INFLUENCER_HOST" && influencerProfiles.length > 0
            ? rand(influencerProfiles).id
            : null;

        const orderStatus = rand(ORDER_STATUSES);

        const order = await prisma.order.create({
          data: {
            userId,
            seriesId:               session.seriesId,
            sessionId:              session.id,
            status:                 orderStatus,
            subtotalCents:          subtotal,
            feesCents:              fees,
            taxCents:               tax,
            totalCents:             total,
            currency:               "USD",
            attributionSource:      attrSource,
            attributedInfluencerId: attrInfluencerId,
          },
        });

        await prisma.orderLineItem.create({
          data: {
            orderId:       order.id,
            itemType:      "ticket",
            ticketTypeId:  ticketType?.id ?? null,
            nameSnapshot:  ticketType?.name ?? "General Admission",
            qty,
            unitPriceCents: basePriceCents,
            totalCents:    subtotal,
          },
        });

        for (let i = 0; i < qty; i++) {
          await prisma.ticket.create({
            data: {
              orderId:      order.id,
              userId,
              sessionId:    session.id,
              ticketTypeId: ticketType?.id ?? null,
              code:         `TKT-${order.id.slice(-6).toUpperCase()}-${i + 1}`,
              ticketStatus: orderStatus === "CANCELLED" ? "CANCELLED" : "ISSUED",
            },
          });
        }

        if (orderStatus === "PAID") {
          await prisma.payment.create({
            data: {
              orderId:       order.id,
              provider:      "DEMO",
              status:        "SUCCEEDED",
              amountCents:   total,
              currency:      "USD",
              authNetTransId: rand(DEMO_TRANS_IDS),
              authNetRefId:  `REF-${order.id.slice(-6).toUpperCase()}`,
            },
          });
        }

        ordersCreated++;
      }
    }
    console.log(`     ✓ Created ${ordersCreated} demo orders`);
  }

  // ── 5. Streetside host personas ──────────────────────────────────────────
  console.log("\n  → Seeding streetside host personas…");

  // Find the venue so we can link profiles
  const venue = await prisma.venue.findFirst({ select: { id: true } });

  for (const sh of STREETSIDE_HOSTS) {
    // User
    const user = await prisma.user.upsert({
      where:  { email: sh.email },
      update: { name: sh.name },
      create: {
        email:  sh.email,
        name:   sh.name,
        status: "ACTIVE",
        tags:   ["demo", "streetside-host"],
        internalNotes: `Demo persona: ${sh.persona}`,
      },
    });

    // STREETSIDE_HOST role
    const existingRole = await prisma.userRole.findFirst({
      where: { userId: user.id, roleKey: "STREETSIDE_HOST" },
    });
    if (!existingRole) {
      await prisma.userRole.create({
        data: { userId: user.id, roleKey: "STREETSIDE_HOST" },
      });
    }

    // RestaurantHostProfile (drives shift tracking & team view)
    const existingProfile = await prisma.restaurantHostProfile.findUnique({
      where: { userId: user.id },
    });
    if (!existingProfile) {
      await prisma.restaurantHostProfile.create({
        data: {
          userId:      user.id,
          displayName: sh.displayName,
          isActive:    sh.isActive,
          badgeColor:  sh.badgeColor,
          venueId:     venue?.id ?? null,
        },
      });
    } else {
      await prisma.restaurantHostProfile.update({
        where: { userId: user.id },
        data:  { isActive: sh.isActive, badgeColor: sh.badgeColor },
      });
    }

    // Referrer record (so they show up in referral attribution)
    const existingRef = await prisma.referrer.findUnique({ where: { referralCode: sh.refCode } });
    if (!existingRef) {
      await prisma.referrer.create({
        data: {
          userId:       user.id,
          fullName:     sh.name,
          referrerType: "STREETSIDE_HOST",
          referralCode: sh.refCode,
          phone:        sh.phone,
          email:        sh.email,
          isActive:     sh.isActive,
          metadataJson: { persona: sh.persona, demo: true },
        },
      });
    }

    const shiftLabel = sh.isActive ? "ON shift" : "off shift";
    console.log(`     ✓ ${sh.name} (${sh.displayName}) — ${shiftLabel}`);
  }

  // ── 6. Summary ────────────────────────────────────────────────────────────
  const totals = await Promise.all([
    prisma.user.count(),
    prisma.influencerProfile.count(),
    prisma.referrer.count(),
    prisma.order.count(),
    prisma.restaurantHostProfile.count(),
  ]);

  console.log(`\n✅  Seed complete.`);
  console.log(`    Total users:            ${totals[0]}`);
  console.log(`    Total influencers:      ${totals[1]}`);
  console.log(`    Total referrers:        ${totals[2]}`);
  console.log(`    Total orders:           ${totals[3]}`);
  console.log(`    Streetside host profiles: ${totals[4]}`);
}

main()
  .catch((e) => { console.error("❌  Seed failed:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
