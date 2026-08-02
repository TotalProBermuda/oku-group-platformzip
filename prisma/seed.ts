import { PrismaClient } from "@prisma/client";
import { ensureStreetsideReferralIdentity } from "@/server/referrals/streetsideReferralService";

const prisma = new PrismaClient();

function randCode(len = 8) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

async function main() {
  // ── Clean slate ──────────────────────────────────────────────────────────
  // Hiring system
  await prisma.applicationWorkflowEvent.deleteMany();
  await prisma.applicationStageTransition.deleteMany();
  await prisma.applicationDocument.deleteMany();
  await prisma.applicationSubmission.deleteMany();
  await prisma.applicationDraft.deleteMany();
  await prisma.applicantProfile.deleteMany();
  await prisma.opportunity.deleteMany();
  await prisma.formTemplate.deleteMany();
  await prisma.applicationPipelineStage.deleteMany();
  await prisma.applicationPipeline.deleteMany();

  // Chat system cleanup (must come before venue/reservation)
  await prisma.hostChatMessage.deleteMany();
  await prisma.hostChatSession.deleteMany();

  // Reservation system cleanup (must come before user/referrer deletion)
  await prisma.reservationCommunication.deleteMany();
  await prisma.resWaitlistEntry.deleteMany();
  await prisma.commissionSuggestion.deleteMany();
  await prisma.commissionEntry.deleteMany();
  await prisma.referralBenefit.deleteMany();
  await prisma.reservationAttribution.deleteMany();
  await prisma.reservationHandoff.deleteMany();
  await prisma.reservationAddon.deleteMany();
  await prisma.reservationStatusLog.deleteMany();
  await prisma.privateRequest.deleteMany();
  await prisma.reservation.deleteMany();
  await prisma.resGuestProfile.deleteMany();
  await prisma.referrer.deleteMany();
  await prisma.compensationPlan.deleteMany();
  await prisma.restaurantHostProfile.deleteMany();
  await prisma.zoneManagerAssignment.deleteMany();
  await prisma.venueTable.deleteMany();
  await prisma.zone.deleteMany();
  await prisma.venue.deleteMany();

  await prisma.attendanceEvent.deleteMany();
  await prisma.checkInLog.deleteMany();
  await prisma.userAuditLog.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.eventLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.experienceAnalyticsDaily.deleteMany();
  await prisma.experienceCheckin.deleteMany();
  await prisma.inventoryHold.deleteMany();
  await prisma.experienceWaitlist.deleteMany();
  await prisma.newsletterSubscription.deleteMany();
  await prisma.ledgerEntry.deleteMany();
  await prisma.payoutBatch.deleteMany();
  await prisma.iRAccessLog.deleteMany();
  await prisma.executiveInquiry.deleteMany();
  await prisma.attributionEvent.deleteMany();
  await prisma.attribution.deleteMany();
  await prisma.sopAcknowledgement.deleteMany();
  await prisma.orderEvent.deleteMany();
  await prisma.orderNote.deleteMany();
  await prisma.ticket.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.orderLineItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.iRDocumentVersion.deleteMany();
  await prisma.iRDocument.deleteMany();
  await prisma.sopDocument.deleteMany();
  await prisma.jobApplication.deleteMany();
  await prisma.jobPost.deleteMany();
  await prisma.ticketPricingRule.deleteMany();
  await prisma.experienceAddon.deleteMany();
  await prisma.experienceInfluencer.deleteMany();
  await prisma.influencerSubCommissionLedger.deleteMany();
  await prisma.referralActor.deleteMany();
  await prisma.eventReferrerAssignment.deleteMany();
  await prisma.ticketType.deleteMany();
  await prisma.session.deleteMany();
  await prisma.series.deleteMany();
  await prisma.founderMembershipApplication.deleteMany();
  await prisma.membershipPlanConfig.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.staffProfile.deleteMany();
  await prisma.investorProfile.deleteMany();
  await prisma.partnerProfile.deleteMany();
  await prisma.influencerProfile.deleteMany();
  await prisma.userProfile.deleteMany();
  await prisma.userRole.deleteMany();
  await prisma.user.deleteMany();

  // ── Roles ────────────────────────────────────────────────────────────────
  const roleLabels: Record<string, string> = {
    VISITOR: "Visitor",
    ATTENDEE: "Attendee",
    INFLUENCER: "Influencer",
    PARTNER: "Partner",
    INVESTOR: "Investor",
    REFERRER: "Referrer",
    STAFF_OKU: "Staff OKU",
    STAFF_CATCH: "Staff CATCH",
    RESTAURANT_HOST: "Restaurant Host",
    STREETSIDE_HOST: "Streetside Host",
    ADMIN_COMMERCIAL: "Admin Commercial",
    ADMIN_IR: "Admin IR",
    ADMIN_HR: "Admin HR",
    SUPERADMIN: "Superadmin",
  };

  for (const [key, label] of Object.entries(roleLabels)) {
    await prisma.role.upsert({
      where: { key: key as any },
      update: { label },
      create: { key: key as any, label },
    });
  }

  // ── Users ────────────────────────────────────────────────────────────────
  async function mkUser(email: string, name: string, roleKey: string) {
    const user = await prisma.user.create({ data: { email, name } });
    await prisma.userRole.create({ data: { userId: user.id, roleKey: roleKey as any } });
    return user;
  }

  const admin        = await mkUser("admin@oku.local",      "Diana Torres",       "SUPERADMIN");
  const commercial   = await mkUser("commercial@oku.local", "Carlos Mendez",      "ADMIN_COMMERCIAL");
  const irAdmin      = await mkUser("ir@oku.local",         "Valentina Reyes",    "ADMIN_IR");
  const hrAdmin      = await mkUser("hr@oku.local",         "Roberto Castillo",   "ADMIN_HR");
  const infUser      = await mkUser("influencer@oku.local", "Sophia Laurent",     "INFLUENCER");
  const inf2User     = await mkUser("sarah@oku.local",      "Sarah Jenkins",      "INFLUENCER");
  const partUser     = await mkUser("partner@oku.local",    "Marco Rossi",        "PARTNER");
  const invUser      = await mkUser("investor@oku.local",   "James Whitfield",    "INVESTOR");
  const staff1User   = await mkUser("staff1@oku.local",     "Elena Vargas",       "STAFF_OKU");
  const staff2User   = await mkUser("staff2@oku.local",     "Luis Padilla",       "STAFF_CATCH");
  const inf3User     = await mkUser("marco@oku.local",      "Marco Villanueva",   "INFLUENCER");
  const att1         = await mkUser("attendee@oku.local",   "Mia Rodriguez",      "ATTENDEE");
  const att2         = await mkUser("john@doe.local",       "John Doe",           "ATTENDEE");
  const att3         = await mkUser("jane@smith.local",     "Jane Smith",         "ATTENDEE");
  const att4         = await mkUser("isabella@chen.local",  "Isabella Chen",      "ATTENDEE");
  const att5         = await mkUser("oliver@nakamura.local","Oliver Nakamura",    "ATTENDEE");
  const att6         = await mkUser("camille@dubois.local", "Camille Dubois",     "ATTENDEE");
  const att7         = await mkUser("rafael@costa.local",   "Rafael Costa",       "ATTENDEE");
  const att8         = await mkUser("yuki@tanaka.local",    "Yuki Tanaka",        "ATTENDEE");
  const att9         = await mkUser("priya@patel.local",    "Priya Patel",        "ATTENDEE");

  const host1User    = await mkUser("host1@oku.local",      "Rafael Núñez",       "RESTAURANT_HOST");
  const host2User    = await mkUser("host2@oku.local",      "Camila Santos",      "RESTAURANT_HOST");
  const sideHostUser = await mkUser("sidehost@oku.local",   "Diego Rivera",       "STREETSIDE_HOST");

  // ── Profiles ─────────────────────────────────────────────────────────────
  const influencer = await prisma.influencerProfile.create({
    data: {
      userId: infUser.id,
      handle: "@sophia_laurent",
      refCode: "INF-SOPHIA",
      commissionRateBps: 1200,
      approved: true,
      approvalStatus: "APPROVED",
      displayName: "Sophia Laurent",
      headline: "Interior Designer & Luxury Lifestyle Creator",
      shortBio: "Renowned designer and tastemaker curating elevated living experiences.",
      longBio: "Sophia Laurent is an internationally recognised interior designer with 15 years of experience crafting spaces for leading hotels, restaurants, and private residences across Europe and the Americas. Through her curated series at OKÜ, she shares the principles of luxury minimalism, material selection, and hospitality design with an intimate audience of design lovers.",
      instagramUrl: "https://instagram.com/sophia_laurent",
      tiktokUrl: "https://tiktok.com/@sophia_laurent",
      youtubeUrl: "https://youtube.com/@sophialaurent",
      websiteUrl: "https://sophialaurent.design",
      location: "Paris & New York",
      isPublic: true,
      isVerified: true,
    },
  });

  const influencer2 = await prisma.influencerProfile.create({
    data: {
      userId: inf2User.id,
      handle: "@sarahj_travel",
      refCode: "INF-SARAHJ",
      commissionRateBps: 1000,
      approved: true,
      approvalStatus: "APPROVED",
      displayName: "Sarah Jenkins",
      headline: "Travel & Culinary Storyteller",
      shortBio: "Documenting the world's finest dining and travel experiences.",
      longBio: "Sarah Jenkins has spent a decade traversing the globe in search of extraordinary culinary and cultural experiences. Her work has been featured in Condé Nast Traveller, Food & Wine, and The New York Times. She brings her discerning eye and infectious enthusiasm to every OKÜ experience she hosts.",
      instagramUrl: "https://instagram.com/sarahj_travel",
      tiktokUrl: "https://tiktok.com/@sarahj_travel",
      websiteUrl: "https://sarahjtravel.com",
      location: "London & Ibiza",
      isPublic: true,
      isVerified: true,
    },
  });

  await prisma.influencerProfile.create({
    data: {
      userId: inf3User.id,
      handle: "@marcovillanueva",
      refCode: "INF-MARCO",
      commissionRateBps: 1100,
      approved: true,
      approvalStatus: "APPROVED",
      displayName: "Marco Villanueva",
      headline: "Panama City Food & Culture Explorer",
      shortBio: "Local guide to the best of Panama's dining, nightlife, and cultural scene.",
      longBio: "Born and raised in Casco Viejo, Marco Villanueva has spent fifteen years documenting the transformation of Panama City's hospitality scene. His social channels are the definitive guide for both locals and visitors seeking authentic, elevated dining experiences. As the only Panama-based host in the OKÜ family, Marco brings an irreplaceable insider perspective to everything he curates.",
      instagramUrl: "https://instagram.com/marcovillanueva",
      tiktokUrl: "https://tiktok.com/@marcovillanueva",
      websiteUrl: "https://marcovillanueva.pa",
      location: "Panama City, Panama",
      isPublic: true,
      isVerified: true,
    },
  });

  const partner = await prisma.partnerProfile.create({
    data: { userId: partUser.id, name: "Rossi Hospitality Group", approved: true },
  });

  await prisma.investorProfile.create({
    data: { userId: invUser.id, approved: true, ndaAcceptedAt: new Date() },
  });

  const staff1 = await prisma.staffProfile.create({
    data: { userId: staff1User.id, venue: "OKU", department: "FOH" },
  });

  const staff2 = await prisma.staffProfile.create({
    data: { userId: staff2User.id, venue: "CATCH", department: "BAR" },
  });

  // ── Membership Plan Config ────────────────────────────────────────────────
  await prisma.membershipPlanConfig.create({
    data: {
      tier: "PATRON",
      displayName: "Patron",
      tagline: "Access to the OKÜ world",
      priceAnnualCents: 250000,
      currency: "USD",
      avacaContributionBps: 1500,
      isPubliclyJoinable: true,
      isInviteOnly: false,
      maxActiveMembers: null,
      active: true,
      benefitsJson: {
        earlyAccess: true,
        priorityReservations: true,
        memberOnlyEvents: true,
        founderOnlyEligible: false,
        networkAccessLevel: "PATRON",
        eventAccessLevel: "PATRON",
        discountBps: 1000,
      },
    },
  });

  await prisma.membershipPlanConfig.create({
    data: {
      tier: "FOUNDER",
      displayName: "Founder",
      tagline: "Access to the OKÜ network",
      priceAnnualCents: 1000000,
      currency: "USD",
      avacaContributionBps: 1500,
      isPubliclyJoinable: false,
      isInviteOnly: true,
      maxActiveMembers: 50,
      active: true,
      benefitsJson: {
        earlyAccess: true,
        priorityReservations: true,
        memberOnlyEvents: true,
        founderOnlyEligible: true,
        networkAccessLevel: "FOUNDER",
        eventAccessLevel: "FOUNDER",
        conciergeAccess: true,
        privateDinnersAccess: true,
        curatedIntroductions: true,
        discountBps: 1500,
      },
    },
  });

  // ── Memberships ──────────────────────────────────────────────────────────
  const patronBenefits = { earlyAccess: true, priorityReservations: true, memberOnlyEvents: true, founderOnlyEligible: false, networkAccessLevel: "PATRON", eventAccessLevel: "PATRON", discountBps: 1000 };
  const founderBenefits = { earlyAccess: true, priorityReservations: true, memberOnlyEvents: true, founderOnlyEligible: true, networkAccessLevel: "FOUNDER", eventAccessLevel: "FOUNDER", conciergeAccess: true, privateDinnersAccess: true, curatedIntroductions: true, discountBps: 1500 };

  await prisma.membership.create({
    data: {
      userId: att1.id,
      tier: "PATRON",
      status: "ACTIVE",
      startsAt: new Date(Date.now() - 30 * 86400000),
      renewsAt: new Date(Date.now() + 335 * 86400000),
      priceAnnualCents: 250000,
      avacaContributionBps: 1500,
      benefitsJson: patronBenefits,
    },
  });

  await prisma.membership.create({
    data: {
      userId: att2.id,
      tier: "PATRON",
      status: "ACTIVE",
      startsAt: new Date(Date.now() - 90 * 86400000),
      renewsAt: new Date(Date.now() + 275 * 86400000),
      priceAnnualCents: 250000,
      avacaContributionBps: 1500,
      benefitsJson: patronBenefits,
    },
  });

  // New attendee memberships
  await prisma.membership.create({
    data: {
      userId: att4.id,
      tier: "PATRON",
      status: "ACTIVE",
      startsAt: new Date(Date.now() - 14 * 86400000),
      renewsAt: new Date(Date.now() + 351 * 86400000),
      priceAnnualCents: 250000,
      avacaContributionBps: 1500,
      benefitsJson: patronBenefits,
    },
  });

  await prisma.membership.create({
    data: {
      userId: att6.id,
      tier: "FOUNDER",
      status: "ACTIVE",
      startsAt: new Date(Date.now() - 180 * 86400000),
      renewsAt: new Date(Date.now() + 185 * 86400000),
      priceAnnualCents: 1000000,
      avacaContributionBps: 1500,
      benefitsJson: founderBenefits,
    },
  });

  // Pending approval membership — demos PENDING_APPROVAL state in /my/membership dashboard
  await prisma.membership.create({
    data: {
      userId: att9.id,
      tier: "PATRON",
      status: "PENDING_APPROVAL",
      startsAt: new Date(Date.now()),
      renewsAt: new Date(Date.now() + 365 * 86400000),
      priceAnnualCents: 250000,
      avacaContributionBps: 1500,
      benefitsJson: patronBenefits,
    },
  });

  // Expired membership — demos expired renewal state
  await prisma.membership.create({
    data: {
      userId: att8.id,
      tier: "PATRON",
      status: "EXPIRED",
      startsAt: new Date(Date.now() - 400 * 86400000),
      renewsAt: new Date(Date.now() - 35 * 86400000),
      priceAnnualCents: 250000,
      avacaContributionBps: 1500,
      benefitsJson: patronBenefits,
    },
  });

  // ── Series (Experiences) ─────────────────────────────────────────────────
  const now  = new Date();
  const in7  = (h = 0) => new Date(now.getTime() + 7  * 86400000 + h * 3600000);
  const in14 = (h = 0) => new Date(now.getTime() + 14 * 86400000 + h * 3600000);
  const in21 = (h = 0) => new Date(now.getTime() + 21 * 86400000 + h * 3600000);
  const in28 = (h = 0) => new Date(now.getTime() + 28 * 86400000 + h * 3600000);
  const in3  = (h = 0) => new Date(now.getTime() + 3  * 86400000 + h * 3600000);

  const series1 = await prisma.series.create({
    data: {
      slug: "sophia-design-masterclass",
      title: "Sophia's Design Masterclass",
      subtitle: "A 3-session deep-dive into luxury interior design",
      description: "Join renowned designer Sophia Laurent for an exclusive 3-session masterclass on modern interior design. Learn the principles of luxury minimalism, colour theory for hospitality spaces, and hands-on styling with curated materials.",
      category: "Design & Art",
      venue: "OKU",
      city: "New York",
      country: "US",
      venueAddress: "OKÜ Lounge, 42 Park Avenue, New York, NY 10016",
      hostType: "INFLUENCER",
      influencerId: influencer.id,
      status: "PUBLISHED",
      capacityTotal: 75,
      capacityReserved: 0,
      capacitySold: 22,
      availableSeatsMode: "APPROXIMATE",
      attendeeListMode: "BUYERS_ONLY",
      showCountdown: false,
      newsletterCaptureEnabled: true,
      waitlistEnabled: true,
      membershipRuleMode: "MEMBERS_EARLY_ACCESS",
      isFeatured: true,
      seoTitle: "Sophia's Design Masterclass | OKÜ Hospitality Group",
      seoDescription: "An exclusive 3-session interior design masterclass with Sophia Laurent at OKÜ New York.",
      communityUrl: "https://discord.gg/oku-design",
      startsAt: in7(18),
      endsAt: in21(21),
    },
  });

  const series2 = await prisma.series.create({
    data: {
      slug: "catch-cocktail-experience",
      title: "CATCH Cocktail Experience",
      subtitle: "Master the art of mixology with our award-winning bar team",
      description: "An immersive cocktail crafting series at CATCH. Each session covers a different spirit category — gin & botanicals, whiskey expressions, and zero-proof cocktails — with tasting flights and take-home recipe cards.",
      category: "Food & Drink",
      venue: "CATCH",
      city: "New York",
      country: "US",
      venueAddress: "CATCH NYC, 21 9th Avenue, New York, NY 10014",
      hostType: "CATCH",
      status: "PUBLISHED",
      capacityTotal: 90,
      capacityReserved: 0,
      capacitySold: 48,
      availableSeatsMode: "APPROXIMATE",
      attendeeListMode: "PUBLIC",
      showCountdown: false,
      newsletterCaptureEnabled: true,
      waitlistEnabled: true,
      membershipRuleMode: "NONE",
      isFeatured: true,
      seoTitle: "CATCH Cocktail Experience | OKÜ Hospitality Group",
      seoDescription: "Immersive cocktail masterclasses at CATCH NYC — taste, learn, and take home the recipes.",
      startsAt: in7(19),
      endsAt: in21(22),
    },
  });

  const series3 = await prisma.series.create({
    data: {
      slug: "rossi-wine-dinner",
      title: "Rossi Wine & Dinner Pairing",
      subtitle: "Five-course Tuscan dinner with rare vintages from Rossi Family Estate",
      description: "Partner Marco Rossi presents an elegant wine dinner series featuring curated pairings from his family vineyard in Tuscany. A five-course menu by our Executive Chef is complemented by hand-selected vintages and a guided tasting from Marco himself.",
      category: "Food & Drink",
      venue: "OKU",
      city: "New York",
      country: "US",
      venueAddress: "OKÜ Private Dining Room, 42 Park Avenue, New York, NY 10016",
      hostType: "PARTNER",
      partnerId: partner.id,
      status: "PUBLISHED",
      capacityTotal: 60,
      capacityReserved: 0,
      capacitySold: 36,
      availableSeatsMode: "EXACT",
      attendeeListMode: "BUYERS_ONLY",
      showCountdown: false,
      newsletterCaptureEnabled: false,
      waitlistEnabled: true,
      membershipRuleMode: "MEMBERS_DISCOUNT",
      isFeatured: false,
      seoTitle: "Rossi Wine & Dinner Pairing | OKÜ Hospitality Group",
      seoDescription: "An intimate wine dinner series with rare Tuscan vintages, hosted by Marco Rossi.",
      startsAt: in14(19),
      endsAt: in28(23),
    },
  });

  const series4 = await prisma.series.create({
    data: {
      slug: "oku-wellness-retreat",
      title: "OKU Wellness Retreat",
      subtitle: "Mind, body, and nourishment in our garden terrace",
      description: "A holistic wellness series blending mindfulness, nutrition, and movement. Sessions include guided meditation by candlelight, plant-based cooking demonstrations, and energising yoga flows on our garden terrace.",
      category: "Wellness",
      venue: "OKU",
      city: "New York",
      country: "US",
      venueAddress: "OKÜ Garden Terrace, 42 Park Avenue, New York, NY 10016",
      hostType: "OKU",
      status: "PUBLISHED",
      capacityTotal: 120,
      capacityReserved: 0,
      capacitySold: 64,
      availableSeatsMode: "APPROXIMATE",
      attendeeListMode: "HIDDEN",
      showCountdown: false,
      newsletterCaptureEnabled: true,
      waitlistEnabled: true,
      membershipRuleMode: "NONE",
      isFeatured: true,
      seoTitle: "OKU Wellness Retreat | OKÜ Hospitality Group",
      seoDescription: "A holistic wellness series combining meditation, yoga, and plant-based cooking at OKÜ.",
      startsAt: in7(9),
      endsAt: in28(13),
    },
  });

  // Countdown / early-release series
  const series5 = await prisma.series.create({
    data: {
      slug: "sarah-ibiza-supper-club",
      title: "Sarah Jenkins: Ibiza Supper Club",
      subtitle: "A taste of the Mediterranean, brought to New York",
      description: "Travel & food creator Sarah Jenkins curates a night inspired by Ibiza's legendary dining scene — shared plates, natural wines, and music from a rotating DJ residency. Limited to 40 guests per session.",
      category: "Food & Drink",
      venue: "OKU",
      city: "New York",
      country: "US",
      venueAddress: "OKÜ Rooftop, 42 Park Avenue, New York, NY 10016",
      hostType: "INFLUENCER",
      influencerId: influencer2.id,
      status: "PUBLISHED",
      capacityTotal: 40,
      capacityReserved: 0,
      capacitySold: 0,
      availableSeatsMode: "EXACT",
      attendeeListMode: "PARTIAL",
      showCountdown: true,
      countdownLabel: "Early Access Opens In",
      earlyReleaseAt: in3(12),
      publicReleaseAt: in7(12),
      newsletterCaptureEnabled: true,
      waitlistEnabled: true,
      membershipRuleMode: "MEMBERS_EARLY_ACCESS",
      isFeatured: true,
      seoTitle: "Ibiza Supper Club by Sarah Jenkins | OKÜ Hospitality Group",
      seoDescription: "Mediterranean-inspired shared plates, natural wines, and DJ sets — a curated night by Sarah Jenkins.",
      startsAt: in14(20),
      endsAt: in14(23),
    },
  });

  const draftSeries = await prisma.series.create({
    data: {
      slug: "art-showcase-2026",
      title: "Art Showcase 2026 (Draft)",
      description: "A contemporary art showcase featuring local and international artists. Currently in planning.",
      category: "Design & Art",
      venue: "OKU",
      hostType: "OKU",
      status: "DRAFT",
      capacityTotal: 200,
      isFeatured: false,
    },
  });

  // ── ExperienceInfluencer assignments ─────────────────────────────────────
  await prisma.experienceInfluencer.create({
    data: { seriesId: series1.id, influencerProfileId: influencer.id, roleLabel: "FEATURED_HOST", sortOrder: 0, isPubliclyVisible: true },
  });
  await prisma.experienceInfluencer.create({
    data: { seriesId: series5.id, influencerProfileId: influencer2.id, roleLabel: "FEATURED_HOST", sortOrder: 0, isPubliclyVisible: true },
  });
  // Sophia as a special guest on Ibiza Supper Club
  await prisma.experienceInfluencer.create({
    data: { seriesId: series5.id, influencerProfileId: influencer.id, roleLabel: "SPECIAL_GUEST", sortOrder: 1, isPubliclyVisible: true },
  });

  // ── Sessions ─────────────────────────────────────────────────────────────
  const s1s1 = await prisma.session.create({ data: { seriesId: series1.id, title: "Session 1: Foundations of Luxury Design", startsAt: in7(18), endsAt: in7(20), capacity: 25, soldCount: 8 } });
  const s1s2 = await prisma.session.create({ data: { seriesId: series1.id, title: "Session 2: Colour & Texture Workshop",    startsAt: in14(18), endsAt: in14(20), capacity: 25, soldCount: 8 } });
  const s1s3 = await prisma.session.create({ data: { seriesId: series1.id, title: "Session 3: Styling & Presentation",       startsAt: in21(18), endsAt: in21(20), capacity: 25, soldCount: 6 } });
  const s2s1 = await prisma.session.create({ data: { seriesId: series2.id, title: "Gin & Botanical Tasting",                 startsAt: in7(19),  endsAt: in7(22),  capacity: 30, soldCount: 20 } });
  const s2s2 = await prisma.session.create({ data: { seriesId: series2.id, title: "Whiskey & Barrel Expressions",            startsAt: in14(19), endsAt: in14(22), capacity: 30, soldCount: 18 } });
  const s2s3 = await prisma.session.create({ data: { seriesId: series2.id, title: "Zero-Proof: The Art of NA Cocktails",     startsAt: in21(19), endsAt: in21(22), capacity: 30, soldCount: 10 } });
  const s3s1 = await prisma.session.create({ data: { seriesId: series3.id, title: "Tuscan Reds Evening",                    startsAt: in14(19), endsAt: in14(23), capacity: 20, soldCount: 14 } });
  const s3s2 = await prisma.session.create({ data: { seriesId: series3.id, title: "Super Tuscans & White Night",            startsAt: in28(19), endsAt: in28(23), capacity: 20, soldCount: 12 } });
  const s4s1 = await prisma.session.create({ data: { seriesId: series4.id, title: "Morning Meditation & Plant Brunch",      startsAt: in7(9),   endsAt: in7(13),  capacity: 40, soldCount: 30 } });
  const s4s2 = await prisma.session.create({ data: { seriesId: series4.id, title: "Yoga Flow & Cooking Demo",               startsAt: in14(9),  endsAt: in14(13), capacity: 40, soldCount: 22 } });
  const s4s3 = await prisma.session.create({ data: { seriesId: series4.id, title: "Breathwork & Nourish Workshop",          startsAt: in28(9),  endsAt: in28(13), capacity: 40, soldCount: 12 } });
  const s5s1 = await prisma.session.create({ data: { seriesId: series5.id, title: "Ibiza Supper Club — Night One",          startsAt: in14(20), endsAt: in14(23), capacity: 40, soldCount: 0 } });

  // ── Ticket Types ──────────────────────────────────────────────────────────
  const tt1gen = await prisma.ticketType.create({ data: { seriesId: series1.id, name: "General Admission",   tierCode: "GA",  priceCents: 15000, maxPerOrder: 4, typeCapacity: 60, displayOrder: 0, ticketStatus: "ACTIVE" } });
  const tt1vip = await prisma.ticketType.create({ data: { seriesId: series1.id, name: "VIP Experience",      tierCode: "VIP", priceCents: 25000, maxPerOrder: 2, typeCapacity: 15, displayOrder: 1, ticketStatus: "ACTIVE" } });
  const tt1mem = await prisma.ticketType.create({ data: { seriesId: series1.id, name: "Member Early Access", tierCode: "MEM", priceCents: 13500, maxPerOrder: 2, typeCapacity: 10, displayOrder: 2, ticketStatus: "ACTIVE", requiresMembership: true, earlyAccessOnly: true, visibilityMode: "MEMBERS_ONLY" } });

  const tt2gen = await prisma.ticketType.create({ data: { seriesId: series2.id, name: "Single Session",         tierCode: "SGL", priceCents: 8500,  maxPerOrder: 6, typeCapacity: 75, displayOrder: 0, ticketStatus: "ACTIVE" } });
  const tt2vip = await prisma.ticketType.create({ data: { seriesId: series2.id, name: "Premium (incl. Bottle)", tierCode: "VIP", priceCents: 17500, maxPerOrder: 4, typeCapacity: 15, displayOrder: 1, ticketStatus: "ACTIVE" } });

  const tt3gen = await prisma.ticketType.create({ data: { seriesId: series3.id, name: "Dinner Seat",        tierCode: "STD", priceCents: 22000, maxPerOrder: 4, typeCapacity: 50, displayOrder: 0, ticketStatus: "ACTIVE" } });
  const tt3mem = await prisma.ticketType.create({ data: { seriesId: series3.id, name: "Member Seat (10% off)", tierCode: "MEM", priceCents: 19800, maxPerOrder: 2, typeCapacity: 10, displayOrder: 1, ticketStatus: "ACTIVE", requiresMembership: true, visibilityMode: "MEMBERS_ONLY" } });

  const tt4day = await prisma.ticketType.create({ data: { seriesId: series4.id, name: "Day Pass",         tierCode: "DAY", priceCents: 7500,  maxPerOrder: 6, typeCapacity: 100, displayOrder: 0, ticketStatus: "ACTIVE" } });
  const tt4all = await prisma.ticketType.create({ data: { seriesId: series4.id, name: "Full Series Pass", tierCode: "SRS", priceCents: 18000, maxPerOrder: 2, typeCapacity: 20,  displayOrder: 1, ticketStatus: "ACTIVE" } });

  const tt5gen = await prisma.ticketType.create({ data: { seriesId: series5.id, name: "General Admission", tierCode: "GA",  priceCents: 12000, maxPerOrder: 2, typeCapacity: 30, displayOrder: 0, ticketStatus: "ACTIVE", saleStartsAt: in7(12) } });
  const tt5mem = await prisma.ticketType.create({ data: { seriesId: series5.id, name: "Member Early Access", tierCode: "MEM", priceCents: 10000, maxPerOrder: 2, typeCapacity: 10, displayOrder: 1, ticketStatus: "ACTIVE", requiresMembership: true, earlyAccessOnly: true, visibilityMode: "MEMBERS_ONLY", saleStartsAt: in3(12) } });

  // ── Dynamic pricing rules ─────────────────────────────────────────────────
  await prisma.ticketPricingRule.create({
    data: {
      ticketTypeId: tt1gen.id,
      ruleType: "INVENTORY_THRESHOLD",
      conditionJson: { field: "remainingPct", operator: "lt", value: 20 },
      actionJson: { type: "price_increase_pct", value: 15 },
      priority: 1,
      isActive: true,
    },
  });
  await prisma.ticketPricingRule.create({
    data: {
      ticketTypeId: tt2gen.id,
      ruleType: "INVENTORY_THRESHOLD",
      conditionJson: { field: "remainingPct", operator: "lt", value: 10 },
      actionJson: { type: "price_increase_pct", value: 10 },
      priority: 1,
      isActive: true,
    },
  });

  // ── Experience Add-ons ────────────────────────────────────────────────────
  await prisma.experienceAddon.createMany({
    data: [
      { seriesId: series1.id, name: "Design Workbook & Tools Kit", description: "Premium sketchbook, colour swatches, and designer pencils.", priceCents: 4500, capacity: 30, displayOrder: 0 },
      { seriesId: series1.id, name: "Private Portfolio Review (30 min)", description: "One-on-one with Sophia to review your design portfolio.", priceCents: 15000, capacity: 6, displayOrder: 1, requiresTicketTypeId: tt1vip.id },
      { seriesId: series2.id, name: "Cocktail Recipe Card Set", description: "Printed recipe cards for all 12 cocktails from the series.", priceCents: 1500, capacity: 60, displayOrder: 0 },
      { seriesId: series2.id, name: "Bottle to Take Home", description: "Select a full bottle from our premium spirits selection.", priceCents: 8500, capacity: 20, displayOrder: 1 },
      { seriesId: series3.id, name: "Wine Selection (3 bottles)", description: "Take home a hand-picked trio of Rossi Estate wines.", priceCents: 18000, capacity: 20, displayOrder: 0 },
      { seriesId: series4.id, name: "Wellness Bag", description: "OKÜ wellness essentials: herbal tea, essential oils, and a journal.", priceCents: 3500, capacity: 80, displayOrder: 0 },
      { seriesId: series5.id, name: "Natural Wine Flight",  description: "Curated flight of 4 natural wines from Sarah's collection.", priceCents: 5500, capacity: 30, displayOrder: 0 },
    ],
  });

  // ── Attribution ───────────────────────────────────────────────────────────
  const attr1 = await prisma.attribution.create({
    data: {
      refCode: "INF-SOPHIA",
      influencerId: influencer.id,
      utmSource: "instagram",
      utmMedium: "story",
      utmCampaign: "design-launch",
      landingPath: "/experiences/sophia-design-masterclass",
      expiresAt: new Date(now.getTime() + 90 * 86400000),
    },
  });
  await prisma.attributionEvent.createMany({
    data: [
      { attributionId: attr1.id, type: "CLICK", path: "/experiences/sophia-design-masterclass" },
      { attributionId: attr1.id, type: "CLICK", path: "/experiences/sophia-design-masterclass" },
      { attributionId: attr1.id, type: "CLICK", path: "/experiences/sophia-design-masterclass" },
      { attributionId: attr1.id, type: "SIGNUP", path: "/register" },
      { attributionId: attr1.id, type: "PURCHASE", path: "/checkout" },
    ],
  });

  // ── Orders ────────────────────────────────────────────────────────────────
  const ordersNow = new Date();
  const daysAgo = (d: number) => new Date(ordersNow.getTime() - d * 86400000);

  // Order 1: att1 buys design masterclass VIP (PAID, attributed to influencer via ref link)
  const order1 = await prisma.order.create({
    data: {
      userId: att1.id, seriesId: series1.id, sessionId: s1s1.id,
      status: "PAID", orderType: "TICKET", channel: "INFLUENCER",
      orderNumber: "OKU-0001",
      subtotalCents: 25000, feesCents: 1250, taxCents: 2100, totalCents: 28350,
      discountCents: 0, commissionCents: 3000, netRevenueCents: 25350,
      coversCount: 1,
      currency: "USD", attributedInfluencerId: influencer.id, attributionId: attr1.id,
      attributionSource: "INFLUENCER_HOST",
      placedAt: daysAgo(12), paidAt: daysAgo(12),
      lineItems: { create: [{ ticketTypeId: tt1vip.id, nameSnapshot: "VIP Experience", itemType: "ticket", qty: 1, unitPriceCents: 25000, totalCents: 25000 }] },
    },
  });
  await prisma.payment.create({ data: { orderId: order1.id, provider: "DEMO", status: "SUCCEEDED", amountCents: 28350, currency: "USD", authNetTransId: "DEMO-" + randCode(10) } });
  const t1 = await prisma.ticket.create({ data: { orderId: order1.id, userId: att1.id, sessionId: s1s1.id, ticketTypeId: tt1vip.id, code: "TIX-" + randCode(8), attendeeName: "Mia Rodriguez", attendeeEmail: "attendee@oku.local", isPubliclyVisible: true, ticketStatus: "ISSUED" } });
  await prisma.orderEvent.createMany({ data: [
    { orderId: order1.id, eventType: "ORDER_CREATED",      eventLabel: "Order placed",          performedBy: "Mia Rodriguez",   createdAt: daysAgo(12) },
    { orderId: order1.id, eventType: "PAYMENT_SUCCEEDED",  eventLabel: "Payment succeeded",     performedBy: "System",          createdAt: daysAgo(12) },
    { orderId: order1.id, eventType: "TICKET_ISSUED",      eventLabel: "1 ticket issued",       performedBy: "System",          createdAt: daysAgo(12) },
    { orderId: order1.id, eventType: "CONFIRMATION_SENT",  eventLabel: "Confirmation email sent", performedBy: "System",        createdAt: daysAgo(12) },
  ]});

  // Order 2: att1 buys wellness (PAID, direct)
  const order2 = await prisma.order.create({
    data: {
      userId: att1.id, seriesId: series4.id, sessionId: s4s1.id,
      status: "PAID", orderType: "TICKET", channel: "DIRECT",
      orderNumber: "OKU-0002",
      subtotalCents: 18000, feesCents: 900, taxCents: 1512, totalCents: 20412,
      discountCents: 0, commissionCents: 0, netRevenueCents: 20412,
      coversCount: 1,
      currency: "USD",
      placedAt: daysAgo(10), paidAt: daysAgo(10),
      lineItems: { create: [{ ticketTypeId: tt4all.id, nameSnapshot: "Full Series Pass", itemType: "ticket", qty: 1, unitPriceCents: 18000, totalCents: 18000 }] },
    },
  });
  await prisma.payment.create({ data: { orderId: order2.id, provider: "DEMO", status: "SUCCEEDED", amountCents: 20412, currency: "USD", authNetTransId: "DEMO-" + randCode(10) } });
  await prisma.ticket.create({ data: { orderId: order2.id, userId: att1.id, sessionId: s4s1.id, ticketTypeId: tt4all.id, code: "TIX-" + randCode(8), attendeeName: "Mia Rodriguez", attendeeEmail: "attendee@oku.local", ticketStatus: "ISSUED" } });
  await prisma.orderEvent.createMany({ data: [
    { orderId: order2.id, eventType: "ORDER_CREATED",     eventLabel: "Order placed",        performedBy: "Mia Rodriguez", createdAt: daysAgo(10) },
    { orderId: order2.id, eventType: "PAYMENT_SUCCEEDED", eventLabel: "Payment succeeded",   performedBy: "System",        createdAt: daysAgo(10) },
    { orderId: order2.id, eventType: "TICKET_ISSUED",     eventLabel: "1 ticket issued",     performedBy: "System",        createdAt: daysAgo(10) },
  ]});

  // Order 3: att2 buys cocktail for 2 (PAID, via referrer QR)
  const order3 = await prisma.order.create({
    data: {
      userId: att2.id, seriesId: series2.id, sessionId: s2s1.id,
      status: "PAID", orderType: "TICKET", channel: "QR",
      orderNumber: "OKU-0003",
      subtotalCents: 17000, feesCents: 850, taxCents: 1428, totalCents: 19278,
      discountCents: 0, commissionCents: 0, netRevenueCents: 19278,
      coversCount: 2,
      currency: "USD",
      placedAt: daysAgo(8), paidAt: daysAgo(8),
      lineItems: { create: [{ ticketTypeId: tt2gen.id, nameSnapshot: "Single Session", itemType: "ticket", qty: 2, unitPriceCents: 8500, totalCents: 17000 }] },
    },
  });
  await prisma.payment.create({ data: { orderId: order3.id, provider: "DEMO", status: "SUCCEEDED", amountCents: 19278, currency: "USD", authNetTransId: "DEMO-" + randCode(10) } });
  await prisma.ticket.createMany({ data: [
    { orderId: order3.id, userId: att2.id, sessionId: s2s1.id, ticketTypeId: tt2gen.id, code: "TIX-" + randCode(8), attendeeName: "John Doe", attendeeEmail: "john@doe.local", isPubliclyVisible: true, ticketStatus: "ISSUED" },
    { orderId: order3.id, userId: att2.id, sessionId: s2s1.id, ticketTypeId: tt2gen.id, code: "TIX-" + randCode(8), attendeeName: "Guest", attendeeEmail: "john@doe.local", ticketStatus: "ISSUED" },
  ]});
  await prisma.orderEvent.createMany({ data: [
    { orderId: order3.id, eventType: "ORDER_CREATED",     eventLabel: "Order placed",        performedBy: "John Doe",  createdAt: daysAgo(8) },
    { orderId: order3.id, eventType: "PAYMENT_SUCCEEDED", eventLabel: "Payment succeeded",   performedBy: "System",    createdAt: daysAgo(8) },
    { orderId: order3.id, eventType: "TICKET_ISSUED",     eventLabel: "2 tickets issued",    performedBy: "System",    createdAt: daysAgo(8) },
  ]});

  // Order 4: att3 buys wine dinner 2-pax (PAID, attributed to influencer)
  const order4 = await prisma.order.create({
    data: {
      userId: att3.id, seriesId: series3.id, sessionId: s3s1.id,
      status: "PAID", orderType: "DINING", channel: "INFLUENCER",
      orderNumber: "OKU-0004",
      subtotalCents: 44000, feesCents: 2200, taxCents: 3696, totalCents: 49896,
      discountCents: 0, commissionCents: 5280, netRevenueCents: 44616,
      coversCount: 2,
      currency: "USD", attributedInfluencerId: influencer.id,
      attributionSource: "INFLUENCER_HOST",
      placedAt: daysAgo(6), paidAt: daysAgo(6),
      lineItems: { create: [{ ticketTypeId: tt3gen.id, nameSnapshot: "Dinner Seat", itemType: "ticket", qty: 2, unitPriceCents: 22000, totalCents: 44000 }] },
    },
  });
  await prisma.payment.create({ data: { orderId: order4.id, provider: "DEMO", status: "SUCCEEDED", amountCents: 49896, currency: "USD", authNetTransId: "DEMO-" + randCode(10) } });
  await prisma.ticket.createMany({ data: [
    { orderId: order4.id, userId: att3.id, sessionId: s3s1.id, ticketTypeId: tt3gen.id, code: "TIX-" + randCode(8), attendeeName: "Jane Smith", attendeeEmail: "jane@smith.local", isPubliclyVisible: true, ticketStatus: "ISSUED" },
    { orderId: order4.id, userId: att3.id, sessionId: s3s1.id, ticketTypeId: tt3gen.id, code: "TIX-" + randCode(8), attendeeName: "Guest", attendeeEmail: "jane@smith.local", ticketStatus: "ISSUED" },
  ]});
  await prisma.orderEvent.createMany({ data: [
    { orderId: order4.id, eventType: "ORDER_CREATED",     eventLabel: "Order placed",        performedBy: "Jane Smith", createdAt: daysAgo(6) },
    { orderId: order4.id, eventType: "PAYMENT_SUCCEEDED", eventLabel: "Payment succeeded",   performedBy: "System",     createdAt: daysAgo(6) },
    { orderId: order4.id, eventType: "TICKET_ISSUED",     eventLabel: "2 tickets issued",    performedBy: "System",     createdAt: daysAgo(6) },
  ]});

  // Order 5: REFUNDED
  const order5 = await prisma.order.create({
    data: {
      userId: att2.id, seriesId: series4.id, sessionId: s4s2.id,
      status: "REFUNDED", orderType: "TICKET", channel: "DIRECT",
      orderNumber: "OKU-0005",
      subtotalCents: 7500, feesCents: 375, taxCents: 630, totalCents: 8505,
      discountCents: 0, commissionCents: 0, netRevenueCents: 0,
      coversCount: 1,
      currency: "USD",
      placedAt: daysAgo(5), paidAt: daysAgo(5), cancelledAt: daysAgo(3),
      lineItems: { create: [{ ticketTypeId: tt4day.id, nameSnapshot: "Day Pass", itemType: "ticket", qty: 1, unitPriceCents: 7500, totalCents: 7500 }] },
    },
  });
  await prisma.payment.create({ data: { orderId: order5.id, provider: "DEMO", status: "REFUNDED", amountCents: 8505, currency: "USD", authNetTransId: "DEMO-" + randCode(10) } });
  await prisma.orderEvent.createMany({ data: [
    { orderId: order5.id, eventType: "ORDER_CREATED",    eventLabel: "Order placed",      performedBy: "John Doe", createdAt: daysAgo(5) },
    { orderId: order5.id, eventType: "PAYMENT_SUCCEEDED",eventLabel: "Payment succeeded", performedBy: "System",   createdAt: daysAgo(5) },
    { orderId: order5.id, eventType: "ORDER_REFUNDED",   eventLabel: "Order refunded",    performedBy: "Admin",    createdAt: daysAgo(3) },
  ]});

  // Order 6: PENDING
  await prisma.order.create({
    data: {
      userId: att3.id, seriesId: series2.id, sessionId: s2s2.id,
      status: "PENDING", orderType: "TICKET", channel: "DIRECT",
      orderNumber: "OKU-0006",
      subtotalCents: 17500, feesCents: 875, taxCents: 1470, totalCents: 19845,
      discountCents: 0, commissionCents: 0, netRevenueCents: 0,
      coversCount: 1,
      currency: "USD",
      placedAt: daysAgo(1),
      lineItems: { create: [{ ticketTypeId: tt2vip.id, nameSnapshot: "Premium (incl. Bottle)", itemType: "ticket", qty: 1, unitPriceCents: 17500, totalCents: 17500 }] },
    },
  });

  // ── Checkins (demo) ───────────────────────────────────────────────────────
  await prisma.experienceCheckin.create({
    data: { ticketId: t1.id, sessionId: s1s1.id, checkedInById: staff1User.id, method: "QR" },
  });

  // ── Commission ledger ─────────────────────────────────────────────────────
  await prisma.ledgerEntry.createMany({ data: [
    { influencerId: influencer.id, orderId: order1.id, type: "COMMISSION_EARNED", amountCents: 3000, note: "12% commission — Design Masterclass VIP" },
    { influencerId: influencer.id, orderId: order4.id, type: "COMMISSION_EARNED", amountCents: 5280, note: "12% commission — Wine Dinner" },
  ]});

  // ── Newsletter subscriptions ──────────────────────────────────────────────
  await prisma.newsletterSubscription.createMany({ data: [
    { email: "attendee@oku.local",       userId: att1.id,  segmentKey: "wellness",    source: "series_page", isActive: true  },
    { email: "attendee@oku.local",       userId: att1.id,  segmentKey: "design",      source: "series_page", isActive: true  },
    { email: "john@doe.local",           userId: att2.id,  segmentKey: "food-drink",  source: "series_page", isActive: true  },
    { email: "jane@smith.local",         userId: att3.id,  segmentKey: "food-drink",  source: "countdown",   isActive: true  },
    { email: "isabella@chen.local",      userId: att4.id,  segmentKey: "design",      source: "series_page", isActive: true  },
    { email: "oliver@nakamura.local",    userId: att5.id,  segmentKey: "food-drink",  source: "series_page", isActive: true  },
    { email: "camille@dubois.local",     userId: att6.id,  segmentKey: "membership",  source: "membership",  isActive: true  },
    { email: "rafael@costa.local",       userId: att7.id,  segmentKey: "food-drink",  source: "series_page", isActive: true  },
    { email: "yuki@tanaka.local",        userId: att8.id,  segmentKey: "design",      source: "homepage",    isActive: true  },
    { email: "priya@patel.local",        userId: att9.id,  segmentKey: "wellness",    source: "membership",  isActive: true  },
    { email: "newguest@test.com",        userId: null,     segmentKey: "general",     source: "homepage",    isActive: true  },
    { email: "curious@outside.com",      userId: null,     segmentKey: "food-drink",  source: "series_page", isActive: false },
  ]});

  // ── Waitlists ─────────────────────────────────────────────────────────────
  await prisma.experienceWaitlist.createMany({ data: [
    { seriesId: series5.id, email: "waitlist1@example.com", userId: null,    source: "EVENT_PAGE",  status: "ACTIVE" },
    { seriesId: series5.id, email: "waitlist2@example.com", userId: null,    source: "COUNTDOWN",   status: "ACTIVE" },
    { seriesId: series5.id, email: "attendee@oku.local",    userId: att1.id, source: "EVENT_PAGE",  status: "ACTIVE" },
    { seriesId: series1.id, email: "waiting@test.com",      userId: null,    source: "SOLD_OUT_PAGE", status: "ACTIVE" },
  ]});

  // ── Analytics (demo rollup) ───────────────────────────────────────────────
  for (const [sid, pv, cs, op, ts, gr, ws, ns, mp] of [
    [series1.id, 842, 120, 22, 22, 550000, 18, 34, 6],
    [series2.id, 1240, 180, 48, 48, 744000, 12, 56, 0],
    [series3.id, 614,  90, 36, 36, 812000,  8, 14, 8],
    [series4.id, 1820, 200, 64, 64, 468000, 24, 82, 0],
    [series5.id, 320,  40,  0,  0,      0, 28, 44, 0],
  ] as any[]) {
    await prisma.experienceAnalyticsDaily.create({
      data: { seriesId: sid, date: now, pageViews: pv, checkoutStarts: cs, ordersPaid: op, ticketsSold: ts, grossRevenueCents: gr, waitlistSignups: ws, newsletterSignups: ns, memberPurchases: mp },
    });
  }

  // ── IR Documents ──────────────────────────────────────────────────────────
  await prisma.iRDocument.create({ data: { title: "Q4 2025 Financial Summary", description: "Quarterly financials including venue revenue breakdown, EBITDA, and key metrics.", visibility: "APPROVED_INVESTORS", versions: { create: [{ version: 1, fileKey: "ir/q4-2025-v1.pdf", fileName: "Q4_2025_Financial_Summary.pdf", mimeType: "application/pdf", sizeBytes: 2450000 }, { version: 2, fileKey: "ir/q4-2025-v2.pdf", fileName: "Q4_2025_Financial_Summary_v2.pdf", mimeType: "application/pdf", sizeBytes: 2680000 }] } } });
  await prisma.iRDocument.create({ data: { title: "2026 Strategic Growth Plan", description: "Five-year expansion roadmap, new venue pipeline, and projected investor returns.", visibility: "APPROVED_INVESTORS", versions: { create: [{ version: 1, fileKey: "ir/2026-growth-plan.pdf", fileName: "2026_Strategic_Growth_Plan.pdf", mimeType: "application/pdf", sizeBytes: 5200000 }] } } });
  await prisma.iRDocument.create({ data: { title: "OKU Brand Guidelines", description: "Official brand identity guide — logo, colour, typography, and photography standards.", visibility: "APPROVED_INVESTORS", versions: { create: [{ version: 1, fileKey: "ir/brand-guidelines.pdf", fileName: "OKU_Brand_Guidelines.pdf", mimeType: "application/pdf", sizeBytes: 8100000 }] } } });
  await prisma.iRDocument.create({ data: { title: "Cap Table & Equity Structure", description: "Current capitalisation table and equity distribution. Confidential.", visibility: "PRIVATE", versions: { create: [{ version: 1, fileKey: "ir/cap-table.xlsx", fileName: "Cap_Table_2026.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", sizeBytes: 340000 }] } } });

  // ── Job Posts & Applications ──────────────────────────────────────────────
  const job1 = await prisma.jobPost.create({ data: { slug: "head-bartender-catch", title: "Head Bartender", department: "BAR", location: "CATCH — Downtown", description: "Lead our bar programme at CATCH. Design seasonal cocktail menus, manage a team of 6 bartenders, and ensure exceptional guest experiences.\n\n**Requirements**\n- 5+ years bartending experience\n- 2+ years in a leadership role\n- Expertise in classic and contemporary cocktails\n- Wine and spirits certifications preferred", isActive: true } });
  const job2 = await prisma.jobPost.create({ data: { slug: "events-coordinator-oku", title: "Events Coordinator", department: "EVENTS", location: "OKÜ — Main Venue", description: "Join our events team to plan and execute unforgettable experiences at OKÜ. From intimate dinners to large-scale series.\n\n**Requirements**\n- 3+ years event coordination experience\n- Strong organisational and communication skills\n- Ability to work evenings and weekends", isActive: true } });
  const job3 = await prisma.jobPost.create({ data: { slug: "marketing-manager", title: "Marketing & PR Manager", department: "MARKETING_PR", location: "Corporate Office", description: "Lead our marketing and PR efforts across all venues. Develop campaigns, manage influencer partnerships, and drive brand awareness.\n\n**Requirements**\n- 5+ years marketing experience in hospitality or luxury brands\n- Proven track record with influencer campaigns\n- Strong storytelling and copywriting skills", isActive: true } });
  const job4 = await prisma.jobPost.create({ data: { slug: "sous-chef-oku", title: "Sous Chef", department: "BOH", location: "OKÜ — Kitchen", description: "Support our Executive Chef delivering world-class dining. Oversee daily kitchen operations and contribute to menu development.\n\n**Requirements**\n- 4+ years professional kitchen experience\n- Culinary degree or equivalent\n- Experience with Mediterranean and Asian fusion cuisine", isActive: true } });
  await prisma.jobPost.create({ data: { slug: "reservations-host", title: "Reservations & Front Desk Host", department: "RESERVATIONS", location: "OKÜ — Main Venue", description: "Be the first point of contact for guests. Manage reservations and ensure a seamless arrival experience.\n\n**Requirements**\n- 1+ years hospitality experience\n- Excellent communication skills\n- Familiarity with OpenTable or Resy", isActive: true } });

  await prisma.jobApplication.createMany({ data: [
    { jobId: job1.id, name: "Alex Rivera",   email: "alex@example.com",   phone: "+1-555-0101", resumeUrl: "https://example.com/resume/alex.pdf",   notes: "10 years experience, Diageo certified",                   stage: "INTERVIEW" },
    { jobId: job1.id, name: "Priya Sharma",  email: "priya@example.com",  phone: "+1-555-0102", resumeUrl: "https://example.com/resume/priya.pdf",  notes: "Currently at Nobu, strong cocktail portfolio",            stage: "REVIEW" },
    { jobId: job1.id, name: "Tom Wilson",    email: "tom@example.com",    phone: "+1-555-0103",                                                                                                                          stage: "NEW" },
    { jobId: job2.id, name: "Rachel Kim",    email: "rachel@example.com", phone: "+1-555-0201", resumeUrl: "https://example.com/resume/rachel.pdf", notes: "5 years at W Hotels events team",                         stage: "OFFER" },
    { jobId: job2.id, name: "David Chen",    email: "david@example.com",  phone: "+1-555-0202",                                                                                                                          stage: "REJECTED" },
    { jobId: job3.id, name: "Sofia Perez",   email: "sofia@example.com",  phone: "+1-555-0301", resumeUrl: "https://example.com/resume/sofia.pdf",  notes: "Led digital campaigns for Mandarin Oriental",            stage: "INTERVIEW" },
    { jobId: job4.id, name: "Ahmed Hassan",  email: "ahmed@example.com",  phone: "+1-555-0401", resumeUrl: "https://example.com/resume/ahmed.pdf",  notes: "Le Cordon Bleu graduate, 6 years experience",            stage: "HIRED" },
    { jobId: job4.id, name: "Lisa Park",     email: "lisa@example.com",   phone: "+1-555-0402",                                                                                                                          stage: "NEW" },
  ]});

  // ── SOP Documents ─────────────────────────────────────────────────────────
  const sopData = [
    { title: "Opening Procedures — Front of House", department: "FOH", venue: "OKU",  contentMd: `# Opening Procedures — Front of House\n\n## Pre-Service Checklist\n\n1. Arrive 30 minutes before service\n2. Check reservation list and note VIPs\n3. Inspect all table settings\n4. Verify lighting levels (dimmer at 70%)\n5. Test background music system\n\n## Guest Arrival Protocol\n\n1. Greet within 10 seconds of entry\n2. Confirm reservation name\n3. Escort to table — walk at guest pace\n4. Present menu and offer still or sparkling water\n5. Introduce server by name\n\n## Emergency Contacts\n\n- Manager on Duty: ext. 100\n- Kitchen: ext. 200\n- Security: ext. 300` },
    { title: "Bar Service Standards",              department: "BAR", venue: "CATCH", contentMd: `# Bar Service Standards\n\n## Cocktail Preparation\n\n1. **Ice** — fresh ice for every drink, never reuse\n2. **Measurements** — always use a jigger\n3. **Garnishes** — prep fresh daily, discard at end of shift\n\n## Speed of Service\n\n| Drink Type | Target Time |\n|---|---|\n| Beer / Wine | 2 min |\n| Cocktails | 4 min |\n| Non-alcoholic | 2 min |\n\n## Responsible Service\n\nCheck ID for anyone appearing under 30. Manager approval required to refuse service.` },
    { title: "Kitchen Hygiene & Food Safety",      department: "BOH", venue: null,    contentMd: `# Kitchen Hygiene & Food Safety\n\n## Personal Hygiene\n\n1. Wash hands every 30 minutes\n2. Clean uniform required each shift\n3. Hair must be covered at all times\n\n## Temperature Control\n\n| Item | Storage Temp |\n|---|---|\n| Raw Meat | Below 40°F |\n| Dairy | Below 40°F |\n| Hot Hold | Above 140°F |\n| Frozen | Below 0°F |\n\n## FIFO\n\nAll items labelled with date received. Older items placed in front. Daily expiry check at 6 AM.` },
    { title: "Event Setup & Breakdown Guide",      department: "EVENTS", venue: null, contentMd: `# Event Setup & Breakdown\n\n## Pre-Event (T-2 hours)\n\n1. Confirm floor plan with event coordinator\n2. Set tables per diagram\n3. Test AV equipment (mic, projector, speakers)\n4. Stage floral arrangements\n5. Brief all staff on event details\n\n## Post-Event\n\n1. Clear all tables within 30 minutes\n2. Deep clean event space\n3. Submit event report within 24 hours` },
    { title: "Community & Social Media Guidelines", department: "COMMUNITY", venue: null, contentMd: `# Community & Social Media Guidelines\n\n## Brand Voice\n\n- Warm, refined, approachable\n- Respond to all comments within 4 hours\n\n## Content Calendar\n\n- Monday: Behind-the-scenes\n- Wednesday: Menu or chef feature\n- Friday: Weekend event promotion\n- Sunday: Guest or influencer repost\n\n## Photography Standards\n\nNatural lighting preferred. No competitor branding visible. Model releases required.` },
    { title: "Reservations Management",           department: "RESERVATIONS", venue: "OKU", contentMd: `# Reservations Management\n\n## Booking Channels\n\n1. Phone (primary)\n2. OpenTable / Resy\n3. Email\n4. Walk-ins (subject to availability)\n\n## Confirmation Protocol\n\n- Confirm 24 hours in advance by SMS\n- No-show policy: 15-minute grace period\n- Cancellation: minimum 4 hours notice\n\n## VIP Handling\n\n- Pre-set preferred table\n- Alert GM and kitchen of dietary preferences\n- Complimentary amuse-bouche on arrival` },
  ];

  for (const s of sopData) {
    await prisma.sopDocument.create({ data: { title: s.title, department: s.department as any, venue: s.venue as any, contentMd: s.contentMd, version: 1, isActive: true } });
  }

  const sops = await prisma.sopDocument.findMany();
  for (const sop of sops.slice(0, 3)) {
    await prisma.sopAcknowledgement.create({ data: { sopId: sop.id, staffProfileId: staff1.id } });
  }

  // ── Notifications ─────────────────────────────────────────────────────────
  await prisma.notification.createMany({ data: [
    { userId: att1.id, title: "Order Confirmed",       body: "Your VIP ticket for Sophia's Design Masterclass is confirmed. Check My Tickets for your QR code.", href: "/my/tickets" },
    { userId: att1.id, title: "Upcoming Event",        body: "Reminder: Morning Meditation & Plant Brunch is in 7 days.", href: "/experiences/oku-wellness-retreat" },
    { userId: infUser.id, title: "Commission Earned",  body: "You earned $30.00 in commission from a new referral purchase.", href: "/influencer/dashboard" },
    { userId: infUser.id, title: "New Referral Click", body: "Your referral link received 3 new clicks from Instagram.", href: "/influencer/dashboard" },
    { userId: invUser.id, title: "New IR Document",    body: "Q4 2025 Financial Summary has been updated.", href: "/investor" },
    { userId: staff1User.id, title: "New SOP Published", body: "Opening Procedures — Front of House requires your acknowledgment.", href: "/staff" },
    { userId: hrAdmin.id, title: "New Application",    body: "New application received for Head Bartender.", href: "/admin/hr" },
    { userId: commercial.id, title: "Daily Summary",   body: "4 new orders totaling $1,980 processed today.", href: "/admin/orders" },
  ]});

  // ── Audit log ─────────────────────────────────────────────────────────────
  await prisma.auditLog.createMany({ data: [
    { actorId: admin.id,      action: "SEED_COMPLETE",            metadata: { note: "Seed data created" } },
    { actorId: commercial.id, action: "ORDER_REFUNDED",           metadata: { orderId: order5.id, reason: "Customer request" } },
    { actorId: hrAdmin.id,    action: "APPLICATION_STAGE_CHANGED", metadata: { applicant: "Rachel Kim", from: "INTERVIEW", to: "OFFER" } },
    { actorId: admin.id,      action: "EXPERIENCE_PUBLISHED",     metadata: { seriesId: series1.id, title: series1.title } },
  ]});

  // ── Event log ─────────────────────────────────────────────────────────────
  await prisma.eventLog.createMany({ data: [
    { type: "PAYMENT_SUCCEEDED", userId: att1.id,  entityId: order1.id },
    { type: "PAYMENT_SUCCEEDED", userId: att1.id,  entityId: order2.id },
    { type: "PAYMENT_SUCCEEDED", userId: att2.id,  entityId: order3.id },
    { type: "PAYMENT_SUCCEEDED", userId: att3.id,  entityId: order4.id },
    { type: "ORDER_REFUNDED",    userId: att2.id,  entityId: order5.id },
    { type: "ATTRIBUTION_CLICK", userId: null,     entityId: attr1.id },
    { type: "WAITLIST_JOINED",   userId: att1.id,  entityId: series5.id },
    { type: "NEWSLETTER_JOINED", userId: att2.id,  entityId: series2.id },
    { type: "CHECKIN_COMPLETED", userId: staff1User.id, entityId: t1.id },
  ]});

  // ── Executive inquiries ───────────────────────────────────────────────────
  await prisma.executiveInquiry.createMany({ data: [
    { name: "Amanda Foster", email: "amanda@luxurygroup.com", phone: "+1-555-9001", company: "Luxury Group International", inquiryType: "PARTNERSHIP", message: "Interested in a strategic partnership for our upcoming Dubai venue launch." },
    { name: "Kenji Tanaka",  email: "kenji@tokyoventures.jp",  company: "Tokyo Ventures",              inquiryType: "INVESTMENT",   message: "Exploring investment opportunities in OKÜ brand expansion to Asia-Pacific." },
  ]});

  // ── User Profiles (attendees + staff + personas) ──────────────────────────
  await prisma.userProfile.createMany({ data: [
    // Original attendees
    { userId: att1.id, language: "en", preferredVenue: "OKU",     marketingOptIn: true  },
    { userId: att2.id, language: "en", preferredVenue: "CATCH",   marketingOptIn: true  },
    { userId: att3.id, language: "en", preferredVenue: "OKU",     marketingOptIn: false },
    // New attendee personas
    { userId: att4.id, language: "zh", preferredVenue: "OKU",     marketingOptIn: true  },
    { userId: att5.id, language: "ja", preferredVenue: "CATCH",   marketingOptIn: true  },
    { userId: att6.id, language: "fr", preferredVenue: "OKU",     marketingOptIn: true  },
    // Additional attendee personas (att7–att9)
    { userId: att7.id, language: "es", preferredVenue: "OKU",     marketingOptIn: true  },
    { userId: att8.id, language: "en", preferredVenue: "OKU",     marketingOptIn: true  },
    { userId: att9.id, language: "en", preferredVenue: "OKU",     marketingOptIn: true  },
    // Influencers
    { userId: infUser.id,  language: "fr", marketingOptIn: true  },
    { userId: inf2User.id, language: "en", marketingOptIn: true  },
    { userId: inf3User.id, language: "es", preferredVenue: "OKU", marketingOptIn: true  },
    // Other staff & partners
    { userId: partUser.id,    language: "it", preferredVenue: "OKU",   marketingOptIn: true  },
    { userId: invUser.id,     language: "en",                          marketingOptIn: false },
    { userId: staff1User.id,  language: "en", preferredVenue: "OKU",   marketingOptIn: true  },
    { userId: staff2User.id,  language: "en", preferredVenue: "CATCH", marketingOptIn: true  },
    { userId: host1User.id,   language: "es", preferredVenue: "OKU",   marketingOptIn: true  },
    { userId: host2User.id,   language: "en", preferredVenue: "CATCH", marketingOptIn: true  },
  ]});

  // ── Multi-day analytics (30-day rolling trend) ────────────────────────────
  // Base values per series: [pageViews/day, checkouts, orders, tickets, revenueRatio, waitlist, newsletter]
  const seriesBases: Array<[string, number, number, number, number, number, number, number]> = [
    [series1.id, 28, 4, 1, 1, 18000, 1, 1],
    [series2.id, 42, 6, 2, 2, 25000, 1, 2],
    [series3.id, 20, 3, 1, 2, 27000, 0, 1],
    [series4.id, 62, 7, 2, 2, 16000, 1, 3],
    [series5.id, 11, 1, 0, 0,     0, 1, 2],
  ];

  for (let daysAgo = 29; daysAgo >= 1; daysAgo--) {
    const date = new Date(now.getTime() - daysAgo * 86400000);
    // Scale factor: ramp up over time (newer = more traffic)
    const ramp = 0.6 + (29 - daysAgo) / 29 * 0.7;
    const jitter = () => 0.8 + Math.random() * 0.4;
    for (const [sid, pv, cs, op, ts, rev, ws, ns] of seriesBases) {
      const pvDay = Math.round(pv * ramp * jitter());
      const csDay = Math.round(cs * ramp * jitter());
      const opDay = Math.round(op * ramp * jitter());
      const tsDay = Math.round(ts * ramp * jitter());
      const revDay = Math.round(rev * ramp * jitter());
      const wsDay  = Math.random() > 0.6 ? Math.round(ws * jitter()) : 0;
      const nsDay  = Math.random() > 0.5 ? Math.round(ns * jitter()) : 0;
      await prisma.experienceAnalyticsDaily.create({
        data: { seriesId: sid, date, pageViews: pvDay, checkoutStarts: csDay, ordersPaid: opDay, ticketsSold: tsDay, grossRevenueCents: revDay, waitlistSignups: wsDay, newsletterSignups: nsDay, memberPurchases: 0 },
      });
    }
  }

  // ── Attribution for influencer2 (Sarah) ──────────────────────────────────
  const attr2 = await prisma.attribution.create({
    data: {
      refCode: "INF-SARAHJ",
      influencerId: influencer2.id,
      utmSource: "instagram",
      utmMedium: "reel",
      utmCampaign: "ibiza-launch",
      landingPath: "/experiences/sarah-ibiza-supper-club",
      expiresAt: new Date(now.getTime() + 90 * 86400000),
    },
  });
  await prisma.attributionEvent.createMany({
    data: [
      { attributionId: attr2.id, type: "CLICK",   path: "/experiences/sarah-ibiza-supper-club" },
      { attributionId: attr2.id, type: "CLICK",   path: "/experiences/sarah-ibiza-supper-club" },
      { attributionId: attr2.id, type: "CLICK",   path: "/experiences/sarah-ibiza-supper-club" },
      { attributionId: attr2.id, type: "CLICK",   path: "/experiences/sarah-ibiza-supper-club" },
      { attributionId: attr2.id, type: "CLICK",   path: "/experiences/sarah-ibiza-supper-club" },
      { attributionId: attr2.id, type: "SIGNUP",  path: "/register" },
    ],
  });

  // Additional attributions for Sophia (series 3 via social)
  const attr3 = await prisma.attribution.create({
    data: {
      refCode: "INF-SOPHIA",
      influencerId: influencer.id,
      utmSource: "tiktok",
      utmMedium: "video",
      utmCampaign: "wine-dinner-promo",
      landingPath: "/experiences/rossi-wine-dinner",
      expiresAt: new Date(now.getTime() + 60 * 86400000),
    },
  });
  await prisma.attributionEvent.createMany({
    data: [
      { attributionId: attr3.id, type: "CLICK",    path: "/experiences/rossi-wine-dinner" },
      { attributionId: attr3.id, type: "CLICK",    path: "/experiences/rossi-wine-dinner" },
      { attributionId: attr3.id, type: "PURCHASE", path: "/checkout" },
    ],
  });

  // ── Commission ledger (additional entries) ────────────────────────────────
  await prisma.ledgerEntry.createMany({ data: [
    { influencerId: influencer.id,  type: "COMMISSION_EARNED", amountCents: 3242, note: "12% commission — Rossi Wine Dinner (referral via TikTok)" },
    { influencerId: influencer2.id, type: "COMMISSION_EARNED", amountCents: 1200, note: "10% commission — Ibiza Supper Club early-bird waitlist conversion" },
  ]});

  // ── Payout batches ────────────────────────────────────────────────────────
  const batch1 = await prisma.payoutBatch.create({
    data: {
      status: "CLOSED",
      from: new Date(now.getTime() - 60 * 86400000),
      to:   new Date(now.getTime() - 30 * 86400000),
      closedAt: new Date(now.getTime() - 28 * 86400000),
    },
  });

  const batch2 = await prisma.payoutBatch.create({
    data: {
      status: "OPEN",
      from: new Date(now.getTime() - 30 * 86400000),
      to:   new Date(now.getTime() +  1 * 86400000),
    },
  });

  // Link ledger entries to payout batches
  const [le1, le2] = await prisma.ledgerEntry.findMany({ where: { influencerId: influencer.id }, take: 2, orderBy: { createdAt: "asc" } });
  if (le1) await prisma.ledgerEntry.update({ where: { id: le1.id }, data: { payoutBatchId: batch1.id } });
  if (le2) await prisma.ledgerEntry.update({ where: { id: le2.id }, data: { payoutBatchId: batch2.id } });

  // ── Dynamic Hiring System ─────────────────────────────────────────────────
  const hiringPipeline = await prisma.applicationPipeline.create({
    data: {
      name: "Default Hiring Pipeline",
      slug: "default-hiring-pipeline",
      isDefault: true,
      stages: {
        create: [
          { key: "submitted",           label: "Submitted",           orderIndex: 1, isDefault: true },
          { key: "under_review",        label: "Under Review",        orderIndex: 2 },
          { key: "hr_screen",           label: "HR Screen",           orderIndex: 3 },
          { key: "interview_scheduled", label: "Interview Scheduled", orderIndex: 4 },
          { key: "offer_pending",       label: "Offer Pending",       orderIndex: 5 },
          { key: "hired",               label: "Hired",               orderIndex: 6, isTerminal: true },
          { key: "rejected",            label: "Rejected",            orderIndex: 7, isTerminal: true },
        ],
      },
    },
  });

  const hospTemplate = await prisma.formTemplate.create({
    data: {
      name: "Standard Hospitality Employment Form",
      slug: "standard-hospitality-employment-form",
      category: "employment",
      status: "PUBLISHED",
      description: "General employment form for front-of-house and hospitality roles.",
      schemaJson: {
        version: 2,
        sections: [
          {
            id: "personal_information",
            title: "Personal Information",
            description: "Tell us a bit about yourself. We'll use this to reach out about your application.",
            fields: [
              { key: "full_name", widget: "text",  label: "Full Legal Name",  required: true, placeholder: "As it appears on your ID" },
              { key: "email",     widget: "email", label: "Email Address",    required: true, placeholder: "you@example.com" },
              { key: "phone",     widget: "phone", label: "Phone / WhatsApp", required: true, placeholder: "+507 xxx xxxx", helpText: "We use WhatsApp for scheduling coordination" },
              {
                key: "residence_area",
                widget: "select",
                label: "Area of Residence",
                required: true,
                helpText: "Helps us understand your commute to Casco Viejo",
                options: [
                  { label: "Casco Viejo",                     value: "casco_viejo" },
                  { label: "Bella Vista",                     value: "bella_vista" },
                  { label: "El Cangrejo",                     value: "el_cangrejo" },
                  { label: "Marbella",                        value: "marbella" },
                  { label: "San Francisco / Obarrio",         value: "san_francisco" },
                  { label: "Betania / Pueblo Nuevo",          value: "betania" },
                  { label: "Panama Oeste / La Chorrera",      value: "panama_oeste" },
                  { label: "Other / Outside Panama City",     value: "other" },
                ],
              },
              {
                key: "commute_time_estimate",
                widget: "select",
                label: "Estimated Commute Time to Casco Viejo",
                helpText: "Approximate travel time on a typical evening",
                options: [
                  { label: "Under 15 minutes",  value: "under_15" },
                  { label: "15–30 minutes",      value: "15_30" },
                  { label: "30–45 minutes",      value: "30_45" },
                  { label: "45–60 minutes",      value: "45_60" },
                  { label: "Over 60 minutes",    value: "over_60" },
                ],
              },
            ],
          },
          {
            id: "work_authorization",
            title: "Work Authorization",
            description: "This information is required for all employment in Panama.",
            fields: [
              {
                key: "authorized_to_work_in_panama",
                widget: "radio",
                label: "Are you legally authorized to work in Panama?",
                required: true,
                options: [
                  { label: "Yes — I am authorized to work in Panama",              value: "yes" },
                  { label: "No — I would require a work permit or sponsorship",     value: "no" },
                ],
              },
              {
                key: "work_permit_status",
                widget: "select",
                label: "Work Permit / Immigration Status",
                helpText: "Select the option that best describes your current situation",
                visibility: {
                  showWhen: {
                    logic: "AND",
                    rules: [{ field: "authorized_to_work_in_panama", operator: "equals", value: "no" }],
                  },
                },
                options: [
                  { label: "Permit currently in process",           value: "in_process" },
                  { label: "Employer sponsorship required",          value: "sponsorship_required" },
                  { label: "Married to Panamanian national",         value: "married_panamanian" },
                  { label: "Pensionado / Retiree visa",              value: "pensionado" },
                  { label: "Other immigration status",               value: "other" },
                ],
              },
              {
                key: "earliest_start_date",
                widget: "text",
                label: "Earliest Available Start Date",
                placeholder: "e.g. Immediately, 2 weeks notice, March 15",
              },
            ],
          },
          {
            id: "availability",
            title: "Availability & Schedule",
            description: "Most of our roles involve evening and weekend service. Please be honest — it helps us place you in the right role.",
            fields: [
              {
                key: "shift_preference",
                widget: "shift_selector",
                label: "Preferred Shifts",
                required: true,
                helpText: "Select all that apply",
                options: [
                  { label: "Morning  6am–2pm",   value: "morning" },
                  { label: "Afternoon  2pm–6pm", value: "afternoon" },
                  { label: "Evening  6pm–12am",  value: "evening" },
                  { label: "Late Night  12am+",  value: "late_night" },
                  { label: "Weekends",           value: "weekend" },
                ],
              },
              {
                key: "weekend_availability",
                widget: "yesno",
                label: "Available for weekend shifts (Friday–Sunday)?",
                required: true,
              },
              {
                key: "holiday_availability",
                widget: "yesno",
                label: "Available to work on public holidays?",
              },
              {
                key: "split_shift_ok",
                widget: "yesno",
                label: "Open to split shifts if required?",
                helpText: "e.g. lunch service + evening service with a break in between",
              },
            ],
          },
          {
            id: "experience",
            title: "Experience & Skills",
            description: "Help us understand your hospitality background and guest-facing capabilities.",
            fields: [
              {
                key: "years_experience",
                widget: "select",
                label: "Years of Hospitality Experience",
                required: true,
                options: [
                  { label: "Less than 1 year", value: "under_1" },
                  { label: "1–2 years",         value: "1_2" },
                  { label: "2–5 years",         value: "2_5" },
                  { label: "5–10 years",        value: "5_10" },
                  { label: "10+ years",          value: "10_plus" },
                ],
              },
              {
                key: "venue_types",
                widget: "multiselect",
                label: "Types of Venues You Have Worked In",
                required: true,
                helpText: "Select all that apply",
                options: [
                  { label: "Fine Dining",         value: "fine_dining" },
                  { label: "Casual Dining",        value: "casual_dining" },
                  { label: "Bar / Nightlife",      value: "bar_nightlife" },
                  { label: "Hotel / Resort",       value: "hotel" },
                  { label: "Events / Catering",    value: "events" },
                  { label: "Café / Brunch",        value: "cafe" },
                  { label: "Rooftop / Terrace",    value: "rooftop" },
                ],
              },
              {
                key: "systems_used",
                widget: "multiselect",
                label: "Hospitality Systems You Have Used",
                helpText: "Select all that apply",
                options: [
                  { label: "OpenTable",            value: "opentable" },
                  { label: "Resy",                  value: "resy" },
                  { label: "SevenRooms",            value: "sevenrooms" },
                  { label: "Toast POS",             value: "toast" },
                  { label: "Oracle / Micros",       value: "oracle" },
                  { label: "Square",                value: "square" },
                  { label: "Lightspeed",            value: "lightspeed" },
                  { label: "None / Not applicable", value: "none" },
                ],
              },
              {
                key: "languages_spoken",
                widget: "multiselect",
                label: "Languages Spoken",
                required: true,
                helpText: "Select all that apply",
                options: [
                  { label: "Spanish",     value: "spanish" },
                  { label: "English",     value: "english" },
                  { label: "French",      value: "french" },
                  { label: "Portuguese",  value: "portuguese" },
                  { label: "Italian",     value: "italian" },
                  { label: "Other",       value: "other" },
                ],
              },
              {
                key: "international_guest_comfort",
                widget: "yesno",
                label: "Comfortable serving international guests and tourists?",
                helpText: "Our venues regularly host guests from Europe, the Americas, and beyond.",
              },
            ],
          },
          {
            id: "declaration",
            title: "Declaration",
            description: "Please read and confirm the following before you submit your application.",
            fields: [
              {
                key: "data_consent",
                widget: "data_consent",
                label: "Data Consent",
                required: true,
                consentText: "I consent to OKÜ Hospitality Group storing and processing my personal information for the purpose of assessing this application. My data will not be shared with third parties without my consent.",
              },
              {
                key: "truthfulness_declaration",
                widget: "truthfulness_declaration",
                label: "Truthfulness Declaration",
                required: true,
                declarationText: "I confirm that all information provided in this application is accurate and complete. I understand that providing false or misleading information may disqualify my application.",
              },
            ],
          },
        ],
      },
      uiSchemaJson: { layout: "multi_step", showProgressBar: true, saveDraftEnabled: true },
      validationJson: {
        full_name:    { minLength: 3, maxLength: 120 },
        email:        { format: "email" },
        phone:        { minLength: 7 },
        authorized_to_work_in_panama: { required: true },
        shift_preference: { required: true },
        weekend_availability: { required: true },
        years_experience: { required: true },
        venue_types:  { required: true },
        languages_spoken: { required: true },
        data_consent: { required: true },
        truthfulness_declaration: { required: true },
      },
    },
  });

  const talentTemplate = await prisma.formTemplate.create({
    data: {
      name: "Talent & Performer Application",
      slug: "talent-performer-application",
      category: "talent",
      status: "PUBLISHED",
      description: "Form for artists, DJs, performers, and brand talent.",
      schemaJson: {
        version: 1,
        sections: [
          {
            id: "contact",
            title: "Contact Details",
            fields: [
              { key: "full_name",       type: "text",     label: "Full Name",           required: true },
              { key: "email",           type: "email",    label: "Email",               required: true },
              { key: "phone",           type: "phone",    label: "Phone / WhatsApp",    required: true },
              { key: "instagram_handle",type: "text",     label: "Instagram Handle",    placeholder: "@yourhandle" },
            ],
          },
          {
            id: "performance",
            title: "Performance Details",
            fields: [
              {
                key: "genre_or_style",
                type: "text",
                label: "Genre / Style",
                required: true,
                placeholder: "e.g. House, Techno, Live Jazz, Dance",
              },
              {
                key: "performance_types",
                type: "multiselect",
                label: "Performance Types",
                required: true,
                options: [
                  { label: "DJ Set",       value: "dj_set" },
                  { label: "Live Music",   value: "live_music" },
                  { label: "Dance",        value: "dance" },
                  { label: "Host / MC",    value: "host_mc" },
                  { label: "Brand Talent", value: "brand_talent" },
                  { label: "Other",        value: "other" },
                ],
              },
              {
                key: "epm_link",
                type: "text",
                label: "EPK / Portfolio Link",
                placeholder: "https://",
              },
              {
                key: "bio",
                type: "textarea",
                label: "Artist Bio",
                helpText: "Brief overview of your work and experience (max 300 words).",
              },
            ],
          },
        ],
      },
      uiSchemaJson: { layout: "multi_step", showProgressBar: true, saveDraftEnabled: true },
      validationJson: {
        full_name:        { minLength: 2, maxLength: 100 },
        email:            { format: "email" },
        genre_or_style:   { minLength: 2 },
      },
    },
  });

  // Published opportunities
  await prisma.opportunity.create({
    data: {
      title:               "Hostess — Casco Viejo",
      slug:                "hostess-casco-viejo",
      department:          "Front of House",
      brandKey:            "OKÜ",
      locationKey:         "Casco Viejo",
      engagementType:      "PART_TIME",
      employmentCategory:  "EMPLOYEE",
      visibility:          "PUBLIC",
      status:              "PUBLISHED",
      description:         "We are looking for a warm, bilingual hostess to be the first point of welcome at OKÜ Casco Viejo. You will greet guests, manage reservations, coordinate with service staff, and set the tone for our elevated hospitality experience.",
      responsibilities:    ["Greet and seat guests with warmth and professionalism", "Manage reservations and walk-in flow via OpenTable", "Coordinate with FOH and management during service", "Maintain knowledge of menu, events, and venue policies"],
      requirements:        ["Fluent in English and Spanish", "Prior hosting or front-of-house experience preferred", "Professional appearance and excellent interpersonal skills", "Availability for evening and weekend shifts"],
      openingsCount:       2,
      formTemplateId:      hospTemplate.id,
      applicationPipelineId: hiringPipeline.id,
    },
  });

  await prisma.opportunity.create({
    data: {
      title:               "Bartender — CATCH",
      slug:                "bartender-catch",
      department:          "Bar",
      brandKey:            "CATCH",
      locationKey:         "Panama City",
      engagementType:      "FULL_TIME",
      employmentCategory:  "EMPLOYEE",
      visibility:          "PUBLIC",
      status:              "PUBLISHED",
      description:         "CATCH is seeking an experienced, high-energy bartender who can craft cocktails with precision while delivering an exceptional guest experience in a fast-paced environment.",
      responsibilities:    ["Craft signature and classic cocktails to spec", "Maintain bar setup, cleanliness, and inventory", "Engage guests with product knowledge and hospitality", "Support floor team during high-volume service"],
      requirements:        ["Minimum 2 years bartending experience in a full-service venue", "Knowledge of classic cocktail techniques and spirits", "Availability for night shifts and weekends", "Responsible alcohol service certification preferred"],
      openingsCount:       1,
      formTemplateId:      hospTemplate.id,
      applicationPipelineId: hiringPipeline.id,
    },
  });

  await prisma.opportunity.create({
    data: {
      title:               "Resident DJ — Weekend Events",
      slug:                "resident-dj-weekend-events",
      department:          "Entertainment",
      brandKey:            "OKÜ",
      locationKey:         "Panama City",
      engagementType:      "FREELANCE",
      employmentCategory:  "PERFORMER",
      visibility:          "PUBLIC",
      status:              "PUBLISHED",
      description:         "We are seeking a versatile resident DJ to anchor our Friday and Saturday night programming across OKÜ venues. The ideal candidate has deep knowledge of house, afrobeats, and reggaeton, reads the crowd well, and brings consistent energy.",
      requirements:        ["Proven residency or event experience", "Own professional DJ setup or willing to use venue equipment", "Available Friday and Saturday evenings", "Strong social media presence preferred"],
      openingsCount:       1,
      formTemplateId:      talentTemplate.id,
      applicationPipelineId: hiringPipeline.id,
    },
  });

  // Draft opportunity (not public)
  await prisma.opportunity.create({
    data: {
      title:               "Event Coordinator — Experiences Team",
      slug:                "event-coordinator-experiences-team",
      department:          "Operations",
      engagementType:      "FULL_TIME",
      employmentCategory:  "EMPLOYEE",
      visibility:          "INTERNAL_ONLY",
      status:              "DRAFT",
      description:         "Internal draft — not yet published.",
      formTemplateId:      hospTemplate.id,
      applicationPipelineId: hiringPipeline.id,
    },
  });

  // ── Additional opportunities ─────────────────────────────────────────────
  const opp1 = await prisma.opportunity.create({
    data: {
      title: "Reservations & Front Desk Host", slug: "reservations-front-desk-host",
      department: "FOH", brandKey: "OKÜ", locationKey: "Panama City",
      engagementType: "FULL_TIME", employmentCategory: "EMPLOYEE",
      visibility: "PUBLIC", status: "PUBLISHED", openingsCount: 2,
      description: "Be the first point of contact for all guests. Manage reservations via Resy/OpenTable and ensure a flawless arrival experience.",
      requirements: ["1+ years hospitality experience", "Excellent communication", "OpenTable or Resy familiarity"],
      formTemplateId: hospTemplate.id, applicationPipelineId: hiringPipeline.id,
    },
  });
  const opp2 = await prisma.opportunity.create({
    data: {
      title: "Sous Chef", slug: "sous-chef-oku",
      department: "BOH", brandKey: "OKÜ", locationKey: "Panama City",
      engagementType: "FULL_TIME", employmentCategory: "EMPLOYEE",
      visibility: "PUBLIC", status: "PUBLISHED", openingsCount: 1,
      description: "Support our Executive Chef in daily kitchen operations, menu development, and BOH team management.",
      requirements: ["4+ years professional kitchen experience", "Culinary degree or equivalent", "Mediterranean/Asian fusion background preferred"],
      formTemplateId: hospTemplate.id, applicationPipelineId: hiringPipeline.id,
    },
  });
  const opp3 = await prisma.opportunity.create({
    data: {
      title: "Marketing & PR Manager", slug: "marketing-pr-manager",
      department: "Marketing", brandKey: "OKÜ", locationKey: "Panama City",
      engagementType: "FULL_TIME", employmentCategory: "EMPLOYEE",
      visibility: "PUBLIC", status: "PUBLISHED", openingsCount: 1,
      description: "Lead brand communications, PR campaigns, influencer partnerships, and press relations for the OKÜ Hospitality Group.",
      requirements: ["5+ years marketing/PR", "Strong English and Spanish", "Event and brand experience preferred"],
      compensationType: "SALARY", compensationMin: 3000, compensationMax: 4500, currency: "USD",
      formTemplateId: hospTemplate.id, applicationPipelineId: hiringPipeline.id,
    },
  });
  const opp4 = await prisma.opportunity.create({
    data: {
      title: "Head Bartender", slug: "head-bartender-oku",
      department: "F&B", brandKey: "OKÜ", locationKey: "Panama City",
      engagementType: "FULL_TIME", employmentCategory: "EMPLOYEE",
      visibility: "PUBLIC", status: "PUBLISHED", openingsCount: 1,
      description: "Lead our bar programme. Design seasonal cocktail menus, train the bar team, and ensure exceptional guest experiences.",
      requirements: ["5+ years bartending", "2+ years leadership", "Expertise in classic and contemporary cocktails"],
      formTemplateId: hospTemplate.id, applicationPipelineId: hiringPipeline.id,
    },
  });
  const opp5 = await prisma.opportunity.create({
    data: {
      title: "Server", slug: "server-oku",
      department: "FOH", brandKey: "OKÜ", locationKey: "Panama City",
      engagementType: "PART_TIME", employmentCategory: "EMPLOYEE",
      visibility: "PUBLIC", status: "PUBLISHED", openingsCount: 4,
      description: "Deliver outstanding table service across all dining spaces. Weekend availability required.",
      requirements: ["1+ years fine dining service", "English and Spanish", "Weekend availability"],
      formTemplateId: hospTemplate.id, applicationPipelineId: hiringPipeline.id,
    },
  });
  const opp6 = await prisma.opportunity.create({
    data: {
      title: "Floor Supervisor", slug: "floor-supervisor",
      department: "FOH", brandKey: "OKÜ", locationKey: "Panama City",
      engagementType: "FULL_TIME", employmentCategory: "EMPLOYEE",
      visibility: "PUBLIC", status: "PUBLISHED", openingsCount: 1,
      description: "Oversee front-of-house floor operations during service. Coordinate staff, resolve guest issues, and maintain standards.",
      requirements: ["3+ years FOH experience", "1+ year supervisory role", "Bilingual English/Spanish"],
      formTemplateId: hospTemplate.id, applicationPipelineId: hiringPipeline.id,
    },
  });
  const opp7 = await prisma.opportunity.create({
    data: {
      title: "Pastry Assistant", slug: "pastry-assistant",
      department: "BOH", brandKey: "OKÜ", locationKey: "Panama City",
      engagementType: "FULL_TIME", employmentCategory: "EMPLOYEE",
      visibility: "PUBLIC", status: "PUBLISHED", openingsCount: 1,
      description: "Support the pastry team in daily prep, dessert plating, and special event menus.",
      requirements: ["Culinary school training or equivalent", "1+ year pastry experience", "Attention to detail"],
      formTemplateId: hospTemplate.id, applicationPipelineId: hiringPipeline.id,
    },
  });
  const opp8 = await prisma.opportunity.create({
    data: {
      title: "Content Creator", slug: "content-creator-oku",
      department: "Creative", brandKey: "OKÜ", locationKey: "Panama City",
      engagementType: "FREELANCE", employmentCategory: "INDEPENDENT_CONTRACTOR",
      visibility: "PUBLIC", status: "PUBLISHED", openingsCount: 2,
      description: "Create compelling short-form video and photo content for OKÜ social channels. Instagram, TikTok, and Reels focus.",
      requirements: ["Strong portfolio of branded content", "Video editing skills", "50k+ following preferred"],
      formTemplateId: talentTemplate.id, applicationPipelineId: hiringPipeline.id,
    },
  });
  const opp9 = await prisma.opportunity.create({
    data: {
      title: "Photographer", slug: "photographer-oku",
      department: "Creative", brandKey: "OKÜ", locationKey: "Panama City",
      engagementType: "FREELANCE", employmentCategory: "INDEPENDENT_CONTRACTOR",
      visibility: "PUBLIC", status: "PUBLISHED", openingsCount: 1,
      description: "Capture events, food, and atmosphere across all OKÜ venues. Must have experience with low-light event photography.",
      requirements: ["Professional portfolio", "Event photography experience", "Own professional equipment"],
      formTemplateId: talentTemplate.id, applicationPipelineId: hiringPipeline.id,
    },
  });
  const opp10 = await prisma.opportunity.create({
    data: {
      title: "Live Performer", slug: "live-performer",
      department: "Entertainment", brandKey: "OKÜ", locationKey: "Panama City",
      engagementType: "FREELANCE", employmentCategory: "PERFORMER",
      visibility: "PUBLIC", status: "PUBLISHED", openingsCount: 3,
      description: "Live musicians, vocalists, and performers for weekly programming and special events.",
      requirements: ["Demo recordings required", "Event performance experience", "Available weekends"],
      formTemplateId: talentTemplate.id, applicationPipelineId: hiringPipeline.id,
    },
  });
  const opp11 = await prisma.opportunity.create({
    data: {
      title: "Culinary Consultant", slug: "culinary-consultant",
      department: "Management", brandKey: "OKÜ", locationKey: "Panama City",
      engagementType: "CONTRACT", employmentCategory: "INDEPENDENT_CONTRACTOR",
      visibility: "PUBLIC", status: "PUBLISHED", openingsCount: 1,
      description: "Six-month engagement to review and elevate our culinary programme across all venues.",
      requirements: ["10+ years culinary leadership", "Consulting background preferred", "Bilingual a plus"],
      compensationType: "SALARY", compensationMin: 5000, compensationMax: 8000, currency: "USD",
      formTemplateId: hospTemplate.id, applicationPipelineId: hiringPipeline.id,
    },
  });

  // ── 50 Applicants ──────────────────────────────────────────────────────────
  const allOpps = [opp1, opp2, opp3, opp4, opp5, opp6, opp7, opp8, opp9, opp10, opp11];

  const applicantData: Array<{
    name: string; email: string; phone: string; stage: string;
    oppIndex: number; source: string; yrsExp: number;
    languages: string[]; workAuth: boolean; weekend: boolean;
    systems: string[]; compensation: number;
  }> = [
    { name: "Sofia Reyes",       email: "sofia.reyes@gmail.com",      phone: "+507-6201-1001", stage: "SUBMITTED",           oppIndex: 0, source: "instagram",  yrsExp: 2, languages: ["Spanish","English"],   workAuth: true,  weekend: true,  systems: ["Resy"],          compensation: 900  },
    { name: "James Whitfield",   email: "james.w@email.com",          phone: "+507-6201-1002", stage: "UNDER_REVIEW",        oppIndex: 0, source: "referral",   yrsExp: 3, languages: ["English"],             workAuth: true,  weekend: true,  systems: ["OpenTable","Resy"], compensation: 1000 },
    { name: "Camila Torres",     email: "camila.t@hotmail.com",       phone: "+507-6201-1003", stage: "HR_SCREEN",           oppIndex: 0, source: "website",    yrsExp: 1, languages: ["Spanish"],             workAuth: false, weekend: true,  systems: ["OpenTable"],     compensation: 800  },
    { name: "Daniella Marin",    email: "d.marin@live.com",           phone: "+507-6201-1004", stage: "INTERVIEW_SCHEDULED", oppIndex: 0, source: "linkedin",   yrsExp: 4, languages: ["Spanish","English","French"], workAuth: true, weekend: false, systems: ["Resy","Toast"], compensation: 1100 },
    { name: "André Belfort",     email: "andre.belfort@gmail.com",    phone: "+507-6201-1005", stage: "SUBMITTED",           oppIndex: 1, source: "referral",   yrsExp: 6, languages: ["French","English"],    workAuth: true,  weekend: true,  systems: ["Toast"],         compensation: 2200 },
    { name: "Maria Gutiérrez",   email: "mgutierrez@yahoo.com",       phone: "+507-6201-1006", stage: "UNDER_REVIEW",        oppIndex: 1, source: "instagram",  yrsExp: 5, languages: ["Spanish","English"],   workAuth: true,  weekend: true,  systems: [],                compensation: 2000 },
    { name: "Ravi Nair",         email: "ravi.nair@gmail.com",        phone: "+507-6201-1007", stage: "MANAGER_REVIEW",      oppIndex: 1, source: "website",    yrsExp: 8, languages: ["English","Hindi"],     workAuth: true,  weekend: true,  systems: ["Toast","Micros"], compensation: 2500 },
    { name: "Valentina Cruz",    email: "vcruz@email.com",            phone: "+507-6201-1008", stage: "OFFER_PENDING",       oppIndex: 1, source: "referral",   yrsExp: 7, languages: ["Spanish","English"],   workAuth: true,  weekend: false, systems: ["Toast"],         compensation: 2300 },
    { name: "Priya Sharma",      email: "priya.s@gmail.com",          phone: "+507-6201-1009", stage: "REJECTED",            oppIndex: 1, source: "linkedin",   yrsExp: 2, languages: ["English"],             workAuth: true,  weekend: true,  systems: [],                compensation: 1500 },
    { name: "Lucas Fernández",   email: "lucas.f@hotmail.com",        phone: "+507-6201-1010", stage: "SUBMITTED",           oppIndex: 2, source: "linkedin",   yrsExp: 6, languages: ["Spanish","English"],   workAuth: true,  weekend: false, systems: [],                compensation: 3500 },
    { name: "Isabella Moore",    email: "i.moore@gmail.com",          phone: "+507-6201-1011", stage: "HR_SCREEN",           oppIndex: 2, source: "referral",   yrsExp: 8, languages: ["English","French"],    workAuth: true,  weekend: false, systems: [],                compensation: 4000 },
    { name: "Carlos Mendez",     email: "c.mendez@gmail.com",         phone: "+507-6201-1012", stage: "INTERVIEW_SCHEDULED", oppIndex: 3, source: "referral",   yrsExp: 7, languages: ["Spanish","English"],   workAuth: true,  weekend: true,  systems: ["Toast","Micros"], compensation: 2000 },
    { name: "Natalie Kim",       email: "nat.kim@email.com",          phone: "+507-6201-1013", stage: "TRIAL_SHIFT",         oppIndex: 3, source: "website",    yrsExp: 9, languages: ["English","Korean"],    workAuth: true,  weekend: true,  systems: ["Toast"],         compensation: 2200 },
    { name: "Alejandro Vega",    email: "a.vega@yahoo.com",           phone: "+507-6201-1014", stage: "SUBMITTED",           oppIndex: 3, source: "instagram",  yrsExp: 3, languages: ["Spanish"],             workAuth: false, weekend: true,  systems: [],                compensation: 1500 },
    { name: "Emilia Rossi",      email: "emilia.r@gmail.com",         phone: "+507-6201-1015", stage: "OFFER_PENDING",       oppIndex: 3, source: "referral",   yrsExp: 10,languages: ["Italian","English"],   workAuth: true,  weekend: true,  systems: ["Toast","Micros"], compensation: 2500 },
    { name: "David Chen",        email: "d.chen@gmail.com",           phone: "+507-6201-1016", stage: "HIRED",               oppIndex: 3, source: "linkedin",   yrsExp: 12,languages: ["English","Mandarin"],  workAuth: true,  weekend: false, systems: ["Toast"],         compensation: 2800 },
    { name: "Mia Johansson",     email: "mia.j@live.com",             phone: "+507-6201-1017", stage: "SUBMITTED",           oppIndex: 4, source: "instagram",  yrsExp: 1, languages: ["Swedish","English"],   workAuth: true,  weekend: true,  systems: [],                compensation: 700  },
    { name: "Felipe Ortiz",      email: "f.ortiz@email.com",          phone: "+507-6201-1018", stage: "SUBMITTED",           oppIndex: 4, source: "website",    yrsExp: 2, languages: ["Spanish","English"],   workAuth: true,  weekend: true,  systems: [],                compensation: 750  },
    { name: "Aisha Diallo",      email: "aisha.d@gmail.com",          phone: "+507-6201-1019", stage: "UNDER_REVIEW",        oppIndex: 4, source: "referral",   yrsExp: 3, languages: ["French","English"],    workAuth: true,  weekend: true,  systems: [],                compensation: 900  },
    { name: "Omar Hassan",       email: "o.hassan@yahoo.com",         phone: "+507-6201-1020", stage: "SUBMITTED",           oppIndex: 4, source: "instagram",  yrsExp: 2, languages: ["Arabic","English"],    workAuth: false, weekend: true,  systems: [],                compensation: 750  },
    { name: "Lucia Paredes",     email: "lucia.p@hotmail.com",        phone: "+507-6201-1021", stage: "INTERVIEW_SCHEDULED", oppIndex: 4, source: "linkedin",   yrsExp: 4, languages: ["Spanish","English"],   workAuth: true,  weekend: true,  systems: ["Toast"],         compensation: 950  },
    { name: "Thomas Adler",      email: "t.adler@gmail.com",          phone: "+507-6201-1022", stage: "REJECTED",            oppIndex: 4, source: "website",    yrsExp: 1, languages: ["German","English"],    workAuth: true,  weekend: false, systems: [],                compensation: 700  },
    { name: "Renata Souza",      email: "renata.s@gmail.com",         phone: "+507-6201-1023", stage: "SUBMITTED",           oppIndex: 5, source: "referral",   yrsExp: 4, languages: ["Portuguese","English"], workAuth: true,  weekend: true, systems: [],                compensation: 1200 },
    { name: "Miguel Ángel León", email: "m.leon@email.com",           phone: "+507-6201-1024", stage: "HR_SCREEN",           oppIndex: 5, source: "linkedin",   yrsExp: 5, languages: ["Spanish","English"],   workAuth: true,  weekend: true,  systems: ["Toast"],         compensation: 1300 },
    { name: "Sara Bloom",        email: "sara.b@gmail.com",           phone: "+507-6201-1025", stage: "MANAGER_REVIEW",      oppIndex: 5, source: "website",    yrsExp: 6, languages: ["English"],             workAuth: true,  weekend: false, systems: ["Toast","Micros"], compensation: 1500 },
    { name: "Kwame Asante",      email: "k.asante@live.com",          phone: "+507-6201-1026", stage: "SUBMITTED",           oppIndex: 6, source: "instagram",  yrsExp: 2, languages: ["English","Twi"],       workAuth: false, weekend: true,  systems: [],                compensation: 900  },
    { name: "Hana Nakamura",     email: "hana.n@gmail.com",           phone: "+507-6201-1027", stage: "UNDER_REVIEW",        oppIndex: 6, source: "referral",   yrsExp: 3, languages: ["Japanese","English"],  workAuth: true,  weekend: true,  systems: [],                compensation: 1000 },
    { name: "Elena Popescu",     email: "e.popescu@yahoo.com",        phone: "+507-6201-1028", stage: "INTERVIEW_SCHEDULED", oppIndex: 6, source: "website",    yrsExp: 4, languages: ["Romanian","English"],  workAuth: true,  weekend: true,  systems: ["Toast"],         compensation: 1100 },
    { name: "Pablo Ruiz",        email: "p.ruiz@gmail.com",           phone: "+507-6201-1029", stage: "SUBMITTED",           oppIndex: 7, source: "instagram",  yrsExp: 2, languages: ["Spanish"],             workAuth: true,  weekend: true,  systems: [],                compensation: 900  },
    { name: "Simone Laurent",    email: "s.laurent@email.com",        phone: "+507-6201-1030", stage: "HR_SCREEN",           oppIndex: 7, source: "website",    yrsExp: 3, languages: ["French","English"],    workAuth: true,  weekend: false, systems: [],                compensation: 950  },
    { name: "Yuki Tanaka",       email: "yuki.t@gmail.com",           phone: "+507-6201-1031", stage: "SUBMITTED",           oppIndex: 8, source: "instagram",  yrsExp: 3, languages: ["Japanese","English"],  workAuth: true,  weekend: true,  systems: [],                compensation: 1500 },
    { name: "Nina Petrova",      email: "nina.p@live.com",            phone: "+507-6201-1032", stage: "UNDER_REVIEW",        oppIndex: 8, source: "referral",   yrsExp: 5, languages: ["Russian","English"],   workAuth: true,  weekend: false, systems: [],                compensation: 2000 },
    { name: "Mateo Vargas",      email: "m.vargas@gmail.com",         phone: "+507-6201-1033", stage: "SUBMITTED",           oppIndex: 8, source: "website",    yrsExp: 2, languages: ["Spanish","English"],   workAuth: false, weekend: true,  systems: [],                compensation: 1200 },
    { name: "Zara Ahmed",        email: "zara.a@email.com",           phone: "+507-6201-1034", stage: "INTERVIEW_SCHEDULED", oppIndex: 8, source: "instagram",  yrsExp: 4, languages: ["Arabic","English","French"], workAuth: true, weekend: true, systems: [],             compensation: 1800 },
    { name: "Rodrigo Lima",      email: "r.lima@gmail.com",           phone: "+507-6201-1035", stage: "SUBMITTED",           oppIndex: 9, source: "instagram",  yrsExp: 3, languages: ["Portuguese","English"], workAuth: true,  weekend: true, systems: [],                compensation: 0    },
    { name: "Amara Diop",        email: "amara.d@gmail.com",          phone: "+507-6201-1036", stage: "UNDER_REVIEW",        oppIndex: 9, source: "referral",   yrsExp: 5, languages: ["French","English"],    workAuth: true,  weekend: true,  systems: [],                compensation: 0    },
    { name: "Jin Park",          email: "jin.p@hotmail.com",          phone: "+507-6201-1037", stage: "INTERVIEW_SCHEDULED", oppIndex: 9, source: "website",    yrsExp: 4, languages: ["Korean","English"],    workAuth: true,  weekend: false, systems: [],                compensation: 0    },
    { name: "Leila Mansouri",    email: "l.mansouri@gmail.com",       phone: "+507-6201-1038", stage: "SUBMITTED",           oppIndex: 9, source: "instagram",  yrsExp: 6, languages: ["Persian","English","French"], workAuth: true, weekend: true, systems: [],            compensation: 0    },
    { name: "Diego Ramírez",     email: "d.ramirez@yahoo.com",        phone: "+507-6201-1039", stage: "SUBMITTED",           oppIndex: 9, source: "linkedin",   yrsExp: 7, languages: ["Spanish","English"],   workAuth: true,  weekend: true,  systems: [],                compensation: 0    },
    { name: "Chloe Martin",      email: "chloe.m@gmail.com",          phone: "+507-6201-1040", stage: "REJECTED",            oppIndex: 9, source: "website",    yrsExp: 1, languages: ["French","English"],    workAuth: true,  weekend: false, systems: [],                compensation: 0    },
    { name: "Alberto Ferreira",  email: "a.ferreira@email.com",       phone: "+507-6201-1041", stage: "SUBMITTED",           oppIndex: 10,source: "referral",   yrsExp: 12,languages: ["Spanish","Portuguese","English"], workAuth: true, weekend: false, systems: ["Toast","Micros","Oracle"], compensation: 6000 },
    { name: "Grace Okonkwo",     email: "g.okonkwo@gmail.com",        phone: "+507-6201-1042", stage: "UNDER_REVIEW",        oppIndex: 10,source: "linkedin",   yrsExp: 15,languages: ["English","Yoruba"],    workAuth: true,  weekend: false, systems: ["Micros"],        compensation: 7000 },
    { name: "Viktor Kozlov",     email: "v.kozlov@live.com",          phone: "+507-6201-1043", stage: "INTERVIEW_SCHEDULED", oppIndex: 10,source: "website",    yrsExp: 11,languages: ["Russian","English"],   workAuth: true,  weekend: false, systems: ["Toast","Oracle"], compensation: 5500 },
    { name: "Fatima Al-Rashid",  email: "f.alrashid@email.com",       phone: "+507-6201-1044", stage: "SUBMITTED",           oppIndex: 0, source: "instagram",  yrsExp: 2, languages: ["Arabic","English"],    workAuth: true,  weekend: true,  systems: ["Resy"],          compensation: 950  },
    { name: "Hugo Martínez",     email: "hugo.m@gmail.com",           phone: "+507-6201-1045", stage: "SUBMITTED",           oppIndex: 1, source: "website",    yrsExp: 4, languages: ["Spanish","English"],   workAuth: true,  weekend: true,  systems: ["Toast"],         compensation: 1800 },
    { name: "Beatriz Alves",     email: "b.alves@hotmail.com",        phone: "+507-6201-1046", stage: "SUBMITTED",           oppIndex: 2, source: "linkedin",   yrsExp: 5, languages: ["Portuguese","Spanish","English"], workAuth: true, weekend: false, systems: [],      compensation: 3200 },
    { name: "Kevin O'Brien",     email: "k.obrien@gmail.com",         phone: "+507-6201-1047", stage: "HR_SCREEN",           oppIndex: 4, source: "referral",   yrsExp: 2, languages: ["English"],             workAuth: true,  weekend: true,  systems: [],                compensation: 850  },
    { name: "Nadia Müller",      email: "nadia.m@gmail.com",          phone: "+507-6201-1048", stage: "UNDER_REVIEW",        oppIndex: 5, source: "website",    yrsExp: 3, languages: ["German","English"],    workAuth: true,  weekend: true,  systems: [],                compensation: 1200 },
    { name: "Samuel Osei",       email: "s.osei@email.com",           phone: "+507-6201-1049", stage: "SUBMITTED",           oppIndex: 6, source: "instagram",  yrsExp: 2, languages: ["English","Twi"],       workAuth: false, weekend: true,  systems: [],                compensation: 1000 },
    { name: "Mei Ling Wang",     email: "meilingw@gmail.com",         phone: "+507-6201-1050", stage: "SUBMITTED",           oppIndex: 7, source: "referral",   yrsExp: 2, languages: ["Mandarin","English"],  workAuth: true,  weekend: false, systems: [],                compensation: 950  },
  ];

  for (const a of applicantData) {
    const opp = allOpps[a.oppIndex];
    const profile = await prisma.applicantProfile.create({
      data: {
        fullName: a.name,
        email:    a.email,
        phone:    a.phone,
      },
    });
    await prisma.applicationSubmission.create({
      data: {
        opportunityId:      opp.id,
        formTemplateId:     hospTemplate.id,
        applicantProfileId: profile.id,
        status:             a.stage as any,
        source:             a.source,
        submittedAt:        new Date(Date.now() - Math.floor(Math.random() * 30) * 86400000),
        submissionDataJson: {
          full_name: a.name, email: a.email, phone: a.phone,
          authorized_to_work_in_panama: a.workAuth ? "yes" : "no",
          shift_preference: a.weekend ? ["evening", "weekend"] : ["evening"],
          years_experience: a.yrsExp,
          languages: a.languages,
          systems_experience: a.systems,
          compensation_expectation: a.compensation,
          source: a.source,
        },
        normalizedSnapshotJson: {
          authorizedToWork:      a.workAuth,
          weekendAvailability:   a.weekend,
          yearsExperience:       a.yrsExp,
          yearsHospitalityExperience: a.yrsExp,
          languages:             a.languages,
          systemsExperience:     a.systems,
          compensationExpectation: a.compensation,
          documentsComplete:     a.workAuth,
        },
      },
    });
  }

  // ─── Reservation System Seed ─────────────────────────────────────────────

  // Venue
  const goldHouse = await prisma.venue.upsert({
    where: { slug: "gold-house" },
    update: { commissionValidationMode: "ON_SEATED" },
    create: {
      name: "Gold House",
      slug: "gold-house",
      addressLine: "Calle 1a Este, Casco Viejo",
      city: "Panama City",
      country: "Panama",
      description: "One physical destination with four experiential zones.",
      commissionValidationMode: "ON_SEATED",
    },
  });

  // Restaurant Host Profiles
  const host1Profile = await prisma.restaurantHostProfile.create({
    data: { userId: host1User.id, venueId: goldHouse.id, displayName: "Rafael N.", isActive: true },
  });
  const host2Profile = await prisma.restaurantHostProfile.create({
    data: { userId: host2User.id, venueId: goldHouse.id, displayName: "Camila S.", isActive: true },
  });

  // Zones
  const zoneData = [
    { name: "OKÜ",              slug: "oku",      zoneType: "FINE_DINING" as const, conceptKey: "oku",     capacityCovers: 27, sortOrder: 0, description: "Fine dining, white linen, structured service." },
    { name: "CATCH Experience",  slug: "catch",    zoneType: "NIGHTLIFE"   as const, conceptKey: "catch",   capacityCovers: 24, sortOrder: 1, description: "Boho-caribbean nightlife energy." },
    { name: "Terrace",           slug: "terrace",  zoneType: "TERRACE"     as const, conceptKey: "terrace", capacityCovers: 42, sortOrder: 2, description: "Open-air dining, patterned tile, daylight to evening." },
    { name: "VIP",               slug: "vip",      zoneType: "PRIVATE"     as const, conceptKey: "vip",     capacityCovers: 10, sortOrder: 3, description: "Private, premium, controlled access." },
  ];

  const zones: Record<string, { id: string }> = {};
  for (const z of zoneData) {
    const zone = await prisma.zone.upsert({
      where: { venueId_slug: { venueId: goldHouse.id, slug: z.slug } },
      update: {},
      create: { ...z, venueId: goldHouse.id },
    });
    zones[z.slug] = zone;
  }

  // Tables per zone
  const tableConfigs = [
    // OKÜ
    { zoneKey: "oku",     name: "T1",  min: 2, max: 2, seats: 2 },
    { zoneKey: "oku",     name: "T2",  min: 2, max: 4, seats: 4 },
    { zoneKey: "oku",     name: "T3",  min: 2, max: 4, seats: 4 },
    { zoneKey: "oku",     name: "T4",  min: 4, max: 6, seats: 6 },
    { zoneKey: "oku",     name: "T5",  min: 2, max: 4, seats: 4, isVip: true },
    // CATCH
    { zoneKey: "catch",   name: "C1",  min: 2, max: 4, seats: 4 },
    { zoneKey: "catch",   name: "C2",  min: 2, max: 6, seats: 6 },
    { zoneKey: "catch",   name: "C3",  min: 4, max: 8, seats: 8, mergeable: true },
    // Terrace
    { zoneKey: "terrace", name: "TR1", min: 2, max: 4, seats: 4 },
    { zoneKey: "terrace", name: "TR2", min: 2, max: 4, seats: 4 },
    { zoneKey: "terrace", name: "TR3", min: 4, max: 6, seats: 6 },
    { zoneKey: "terrace", name: "TR4", min: 4, max: 8, seats: 8, mergeable: true },
    { zoneKey: "terrace", name: "TR5", min: 6, max: 10, seats: 10, mergeable: true },
    // VIP
    { zoneKey: "vip",     name: "V1",  min: 2, max: 10, seats: 10, isVip: true },
  ];

  for (const t of tableConfigs) {
    await prisma.venueTable.create({
      data: {
        zoneId: zones[t.zoneKey].id,
        name: t.name,
        minPartySize: t.min,
        maxPartySize: t.max,
        seats: t.seats,
        mergeable: t.mergeable ?? false,
        isVip: t.isVip ?? false,
      },
    });
  }

  // ─── Restaurant Spaces (Task #181 — idempotent upsert) ─────────────────────
  // Four permanent OKÜ dining spaces. Keyed by (venueId, name) so running
  // the seed twice or on an existing DB never creates duplicate rows.
  const spaceData = [
    { name: "OKÜ Dining Room",   capacity: 27, sortOrder: 0, weatherSensitive: false },
    { name: "Catch Experience",  capacity: 24, sortOrder: 1, weatherSensitive: false },
    { name: "Terrace",           capacity: 42, sortOrder: 2, weatherSensitive: true  },
    { name: "VIP",               capacity: 10, sortOrder: 3, weatherSensitive: false, requiresApproval: true },
  ];
  for (const s of spaceData) {
    await prisma.restaurantSpace.upsert({
      where: { venueId_name: { venueId: goldHouse.id, name: s.name } },
      update: { capacity: s.capacity, sortOrder: s.sortOrder, weatherSensitive: s.weatherSensitive, requiresApproval: (s as any).requiresApproval ?? false },
      create: {
        venueId: goldHouse.id,
        name: s.name,
        capacity: s.capacity,
        sortOrder: s.sortOrder,
        weatherSensitive: s.weatherSensitive,
        requiresApproval: (s as any).requiresApproval ?? false,
        reservable: true,
        isActive: true,
      },
    });
  }

  // Compensation Plans
  const planHostStreetside = await prisma.compensationPlan.create({
    data: { name: "Streetside Host — Flat per Cover", appliesToType: "STREETSIDE_HOST", modelType: "FLAT_PER_SEATED_COVER", flatPerCoverCents: 200, isActive: true },
  });
  const planTaxi = await prisma.compensationPlan.create({
    data: { name: "Taxi Driver — Flat per Party", appliesToType: "TAXI_DRIVER", modelType: "FLAT_PER_SEATED_PARTY", flatPerPartyCents: 500, isActive: true },
  });
  const planConcierge = await prisma.compensationPlan.create({
    data: { name: "Hotel Concierge — Flat per Cover", appliesToType: "HOTEL_CONCIERGE", modelType: "FLAT_PER_SEATED_COVER", flatPerCoverCents: 300, isActive: true },
  });
  const planTourGuide = await prisma.compensationPlan.create({
    data: { name: "Tour Guide — Commission %", appliesToType: "TOUR_GUIDE", modelType: "COMMISSION_ONLY", commissionPercent: 5, isActive: true },
  });

  // Referrers
  const refData = [
    { fullName: "Carlos Mendez",   referrerType: "STREETSIDE_HOST" as const, phone: "+507-6201-9001", referralCode: "CARLOS01", organizationName: null,           compensationPlanId: planHostStreetside.id },
    { fullName: "Ana Torres",      referrerType: "STREETSIDE_HOST" as const, phone: "+507-6201-9002", referralCode: "ANA01",    organizationName: null,           compensationPlanId: planHostStreetside.id },
    { fullName: "Taxi Juan",       referrerType: "TAXI_DRIVER"     as const, phone: "+507-6201-9003", referralCode: "TAXI01",   organizationName: "City Cabs",    compensationPlanId: planTaxi.id },
    { fullName: "Taxi Maria",      referrerType: "TAXI_DRIVER"     as const, phone: "+507-6201-9004", referralCode: "TAXI02",   organizationName: "City Cabs",    compensationPlanId: planTaxi.id },
    { fullName: "Sophie Chen",     referrerType: "HOTEL_CONCIERGE" as const, phone: "+507-6201-9005", referralCode: "SOPC01",   organizationName: "Las Clementinas", compensationPlanId: planConcierge.id },
    { fullName: "Marco Reyes",     referrerType: "HOTEL_CONCIERGE" as const, phone: "+507-6201-9006", referralCode: "MARC01",   organizationName: "American Trade Hotel", compensationPlanId: planConcierge.id },
    { fullName: "Panama City Tours", referrerType: "TOUR_GUIDE"  as const, phone: "+507-6201-9007", referralCode: "TOUR01",   organizationName: "Panama City Tours", compensationPlanId: planTourGuide.id },
  ];

  const referrers: Record<string, { id: string }> = {};
  for (const r of refData) {
    const ref = await prisma.referrer.create({ data: r });
    referrers[r.referralCode] = ref;
  }

  // Referrer User Accounts — demo logins linked to their Referrer records
  const refUserData = [
    { email: "carlos@oku.local",    name: "Carlos Mendez",     code: "CARLOS01" },
    { email: "ana@oku.local",       name: "Ana Torres",        code: "ANA01"    },
    { email: "taxi@oku.local",      name: "Taxi Juan",         code: "TAXI01"   },
    { email: "maria@oku.local",     name: "Taxi Maria",        code: "TAXI02"   },
    { email: "sophie@oku.local",    name: "Sophie Chen",       code: "SOPC01"   },
    { email: "marco.r@oku.local",   name: "Marco Reyes",       code: "MARC01"   },
    { email: "panama@oku.local",    name: "Panama City Tours", code: "TOUR01"   },
  ];
  for (const ru of refUserData) {
    const u = await mkUser(ru.email, ru.name, "REFERRER");
    const refId = referrers[ru.code]?.id;
    if (refId) await prisma.referrer.update({ where: { id: refId }, data: { userId: u.id } });
    await prisma.userProfile.create({ data: { userId: u.id, language: "es", preferredVenue: "OKU", marketingOptIn: false } });
  }

  // Unlinked Referrer Profiles — available in the Personas "Link Profile" dropdown
  // These have no userId so they can be assigned to existing users via the admin panel
  const unlinkedReferrers = [
    { fullName: "Diego Saenz",       referrerType: "STREETSIDE_HOST" as const, phone: "+507-6300-0001", referralCode: "DIEGO01", organizationName: null,                  compensationPlanId: planHostStreetside.id },
    { fullName: "Lucia Paredes",     referrerType: "STREETSIDE_HOST" as const, phone: "+507-6300-0002", referralCode: "LUCIA01", organizationName: null,                  compensationPlanId: planHostStreetside.id },
    { fullName: "Taxi Roberto",      referrerType: "TAXI_DRIVER"     as const, phone: "+507-6300-0003", referralCode: "TAXI03",  organizationName: "Metro Taxis",         compensationPlanId: planTaxi.id },
    { fullName: "Casco Concierge",   referrerType: "HOTEL_CONCIERGE" as const, phone: "+507-6300-0004", referralCode: "CASC01",  organizationName: "Casco Antiguo Hotel", compensationPlanId: planConcierge.id },
    { fullName: "Boquete Explorer",  referrerType: "TOUR_GUIDE"      as const, phone: "+507-6300-0005", referralCode: "BOQU01",  organizationName: "Boquete Adventures",  compensationPlanId: planTourGuide.id },
  ];
  for (const r of unlinkedReferrers) {
    await prisma.referrer.create({ data: r });
  }

  // Governed personal referral identity for every streetside host. They have
  // no RestaurantHostProfile, so provisionHostPersonalReferrer never runs for
  // them; without this their Guest QR carries no `?ref=` code and an anonymous
  // guest who scans it books an unattributed DIRECT reservation that never
  // shows in the host's "Active" feed. This mints a user-owned ReferralActor +
  // ACTIVE ReferralLink whose code the QR emits. Idempotent, and reused at
  // runtime by GET /api/v1/host/me.
  //
  // FK-safe seeding constraint (see .agents/memory/seed-reseed-fk.md):
  // No table truncation is added here. ensureStreetsideReferralIdentity is
  // idempotent via the 7-step dedupe chain and is safe to run on a
  // partially-seeded DB. If a merge_required result is returned the host is
  // logged-and-skipped — the seed never auto-links an actor owned by another user.
  const streetsideHostUsers = await prisma.user.findMany({
    where: { roles: { some: { roleKey: "STREETSIDE_HOST" } } },
    select: { id: true, name: true },
  });
  for (const su of streetsideHostUsers) {
    const result = await ensureStreetsideReferralIdentity(
      prisma,
      su.id,
      su.name ?? "Streetside Host"
    );
    if (!result.ok) {
      // merge_required: an actor for this host exists but is owned by a
      // different user (e.g. created via the operator path). Log and skip —
      // never auto-link an actor owned by another user.
      console.warn(
        `[seed] ensureStreetsideReferralIdentity merge_required for user ${su.id}`,
        {
          candidateActorId: result.candidateActorId,
          matchField: result.matchField,
          reason: result.reason,
          provisioningPath: "seed",
          mutated: false,
        }
      );
    }
  }

  // Sample Guest Profiles + Reservations
  const guestData = [
    { name: "James Whitfield",  email: "j.whitfield@email.com",  phone: "+1-555-0101", concept: "oku",     party: 2, occasion: "Anniversary", zone: "oku",     status: "COMPLETED" as const, referralCode: "SOPC01",  stage: "PATRONIZED" as const, covers: 2 },
    { name: "Isabella Moreno",  email: "i.moreno@gmail.com",     phone: "+507-6100-1", concept: "terrace", party: 4, occasion: null,           zone: "terrace",  status: "SEATED"    as const, referralCode: "ANA01",   stage: "PATRONIZED" as const, covers: 4 },
    { name: "Raj Patel",        email: "raj.p@gmail.com",        phone: "+1-555-0103", concept: "catch",   party: 6, occasion: "Birthday",     zone: "catch",    status: "CONFIRMED" as const, referralCode: "TAXI01",  stage: "ARRIVED"    as const, covers: 6 },
    { name: "Lucia Fernandez",  email: "lucia.f@hotmail.com",    phone: "+507-6100-2", concept: "oku",     party: 2, occasion: null,           zone: "oku",      status: "CONFIRMED" as const, referralCode: "MARC01",  stage: "ARRIVED"    as const, covers: 2 },
    { name: "Thomas Adler",     email: "t.adler@gmail.com",      phone: "+49-555-0105", concept: "terrace", party: 3, occasion: null,           zone: "terrace",  status: "PENDING"   as const, referralCode: "CARLOS01", stage: "REFERRED_UPSTAIRS" as const, covers: 0 },
    { name: "Amara Diop",       email: "amara.d@gmail.com",      phone: "+507-6100-3", concept: "catch",   party: 5, occasion: "Birthday",     zone: "catch",    status: "WAITLISTED" as const, referralCode: "TOUR01", stage: "INITIATED"  as const, covers: 0 },
    { name: "Mei Ling Wang",    email: "mw@gmail.com",           phone: "+86-555-0107", concept: "vip",    party: 8, occasion: "Corporate",    zone: "vip",      status: "REQUEST_ONLY" as const, referralCode: "SOPC01", stage: "INITIATED" as const, covers: 0 },
    { name: "Carlos Villanueva", email: "c.villa@email.com",     phone: "+507-6100-4", concept: "oku",     party: 4, occasion: null,           zone: "oku",      status: "COMPLETED" as const, referralCode: "ANA01",   stage: "PATRONIZED" as const, covers: 4 },
    { name: "Nadia Müller",     email: "nadia.m@gmail.com",      phone: "+49-555-0109", concept: "terrace", party: 2, occasion: null,           zone: "terrace",  status: "NO_SHOW"   as const, referralCode: "TAXI02", stage: "ARRIVED"    as const, covers: 0 },
    { name: "Samuel Osei",      email: "s.osei@email.com",       phone: "+507-6100-5", concept: "catch",   party: 3, occasion: "Anniversary",  zone: "catch",    status: "COMPLETED" as const, referralCode: "CARLOS01", stage: "PATRONIZED" as const, covers: 3 },
    { name: "Elena Popescu",    email: "e.popescu@yahoo.com",    phone: "+40-555-0111", concept: "oku",     party: 2, occasion: null,           zone: "oku",      status: "COMPLETED" as const, referralCode: "MARC01", stage: "PATRONIZED" as const, covers: 2 },
    { name: "Hugo Martínez",    email: "hugo.m@gmail.com",       phone: "+507-6100-6", concept: "terrace", party: 6, occasion: "Birthday",     zone: "terrace",  status: "SEATED"    as const, referralCode: "TOUR01", stage: "PATRONIZED" as const, covers: 6 },
  ];

  const reservations: { id: string }[] = [];
  for (const g of guestData) {
    const code = `OKU${Date.now().toString(36).toUpperCase().slice(-6)}${Math.random().toString(36).slice(2,4).toUpperCase()}`;
    const daysAgo = Math.floor(Math.random() * 30);
    const resDate = new Date();
    resDate.setDate(resDate.getDate() - daysAgo);
    resDate.setHours(19 + Math.floor(Math.random() * 3), 0, 0, 0);

    const guest = await prisma.resGuestProfile.create({
      data: { fullName: g.name, email: g.email, phone: g.phone, preferredConceptKey: g.concept },
    });

    const res = await prisma.reservation.create({
      data: {
        venueId: goldHouse.id,
        zoneId: zones[g.zone].id,
        guestProfileId: guest.id,
        source: "UMBRELLA_SITE" as const,
        status: g.status,
        reservationDate: resDate,
        partySize: g.party,
        conceptRequested: g.concept,
        occasion: g.occasion ?? undefined,
        contactName: g.name,
        contactEmail: g.email,
        contactPhone: g.phone,
        confirmationCode: code,
        estimatedRevenueCents: g.party * 4500,
        actualRevenueCents: g.stage === "PATRONIZED" ? g.party * 4500 : undefined,
      },
    });
    reservations.push(res);

    // Attribution
    const ref = referrers[g.referralCode];
    if (ref) {
      await prisma.reservationAttribution.create({
        data: {
          reservationId: res.id,
          referrerId: ref.id,
          sourceType: "UMBRELLA_SITE" as const,
          commissionEligible: g.stage === "PATRONIZED",
          conversionStage: g.stage,
          coversAttributed: g.covers,
          patronizedAt: g.stage === "PATRONIZED" ? resDate : undefined,
        },
      });
    }

    // Commission for patronized.
    //
    // WRITE CONTRACT (see prisma/schema.prisma → CommissionEntry.referralActorId):
    // when the Referrer has a linked ReferralActor we MUST populate BOTH FKs
    // so every read surface — which resolves the earner via
    // `commissionWhereForEarner` — counts the row exactly once regardless of
    // which FK it pivots on.
    if (g.stage === "PATRONIZED" && ref) {
      const linkedActor = await prisma.referralActor.findUnique({
        where: { legacyReferrerId: ref.id },
        select: { id: true },
      });
      await prisma.commissionEntry.create({
        data: {
          referrerId: ref.id,
          referralActorId: linkedActor?.id ?? null,
          reservationId: res.id,
          amountCents: g.covers * 250,
          covers: g.covers,
          conceptKey: g.concept,
          status: "APPROVED" as const,
        },
      });
    }

    // Handoff for recent pending
    if ((["PENDING", "CONFIRMED"] as string[]).includes(g.status)) {
      await prisma.reservationHandoff.create({
        data: {
          reservationId: res.id,
          sentByRole: "STREETSIDE_HOST",
          sentByLabel: g.referralCode,
          handoffStatus: g.status === "CONFIRMED" ? "ACKNOWLEDGED" : "PENDING",
          waitTimeMinutes: 15,
        },
      });
    }
  }

  // ReservationStatusLog — demo audit trail for completed/seated reservations
  const completedReservations = reservations.slice(0, 5);
  const statusLogData = [
    { toStatus: "PENDING",      label: "System",      note: "Booking submitted via umbrella site" },
    { toStatus: "ACKNOWLEDGED", label: "Rafael N.",   note: "Front desk acknowledged — table assigned" },
    { toStatus: "ARRIVED",      label: "Rafael N.",   note: "Guest arrived — confirmed at door" },
    { toStatus: "SEATED",       label: "Rafael N.",   note: "Party seated" },
    { toStatus: "COMPLETED",    label: "Rafael N.",   note: "Service complete — commission eligible" },
  ];
  for (const res of completedReservations) {
    let prev: Date | null = null;
    for (const log of statusLogData) {
      const ts: Date = prev ? new Date(prev.getTime() + 20 * 60000) : new Date(Date.now() - 2 * 3600000);
      await prisma.reservationStatusLog.create({
        data: {
          reservationId:  res.id,
          toStatus:       log.toStatus,
          changedByLabel: log.label,
          notes:          log.note,
          changedAt:      ts,
        },
      });
      prev = ts;
    }
  }

  // Waitlist entries
  const waitlistData = [
    { name: "Pablo Ruiz",    phone: "+507-6200-7", concept: "terrace", party: 4, zone: "terrace", wait: 20 },
    { name: "Simone Laurent", phone: "+33-555-0202", concept: "catch",  party: 3, zone: "catch",   wait: 35 },
    { name: "Zara Ahmed",    phone: "+971-555-0203", concept: "oku",    party: 2, zone: "oku",     wait: 10 },
  ];
  for (const w of waitlistData) {
    await prisma.resWaitlistEntry.create({
      data: {
        venueId: goldHouse.id,
        zoneId: zones[w.zone].id,
        source: "WALK_IN" as const,
        status: "ACTIVE" as const,
        contactName: w.name,
        contactPhone: w.phone,
        partySize: w.party,
        conceptRequested: w.concept,
        estimatedWaitMinutes: w.wait,
      },
    });
  }

  // ── User Admin Demo Data — new fields: lastLoginAt, internalNotes, tags ─────
  const now2 = new Date();
  const daysBack = (n: number) => new Date(now2.getTime() - n * 86400000);

  await prisma.user.update({ where: { id: infUser.id },  data: { lastLoginAt: daysBack(1), internalNotes: "Top performing influencer. Paris-based. Priority invites for food/fashion events.", tags: ["vip", "paris", "fashion"] } });
  await prisma.user.update({ where: { id: inf2User.id }, data: { lastLoginAt: daysBack(3), internalNotes: "Sarah operates primarily in the London wellness niche. Affiliate only — no exclusivity.", tags: ["wellness", "london"] } });
  await prisma.user.update({ where: { id: inf3User.id }, data: { lastLoginAt: daysBack(7), internalNotes: "Local Panama City creator. High engagement. Potential for OKÜ residency collaboration.", tags: ["local", "creator", "panama"] } });
  await prisma.user.update({ where: { id: att1.id },     data: { lastLoginAt: daysBack(2), internalNotes: "Repeat patron. Anniversary dinner regulars. Always requests terrace window.", tags: ["vip", "repeat-patron"] } });
  await prisma.user.update({ where: { id: att2.id },     data: { lastLoginAt: daysBack(14) } });
  await prisma.user.update({ where: { id: att4.id },     data: { lastLoginAt: daysBack(5), tags: ["corporate"] } });
  await prisma.user.update({ where: { id: partUser.id }, data: { lastLoginAt: daysBack(10) } });
  await prisma.user.update({ where: { id: invUser.id },  data: { lastLoginAt: daysBack(30), internalNotes: "Silent investor. Prefers quarterly email updates. Do not cold-call.", tags: ["investor", "silent"] } });
  await prisma.user.update({ where: { id: admin.id },      data: { lastLoginAt: daysBack(0) } });
  await prisma.user.update({ where: { id: commercial.id }, data: { lastLoginAt: daysBack(1) } });
  await prisma.user.update({ where: { id: att7.id },       data: { lastLoginAt: daysBack(4), tags: ["corporate", "group-booking"] } });
  await prisma.user.update({ where: { id: att8.id },       data: { lastLoginAt: daysBack(9), internalNotes: "Digital nomad — frequents TERRACE weekday lunches.", tags: ["regular", "terrace"] } });
  await prisma.user.update({ where: { id: att9.id },       data: { lastLoginAt: daysBack(12), tags: ["vip", "dietary-restrictions"] } });
  await prisma.user.update({ where: { id: host1User.id },  data: { lastLoginAt: daysBack(0), internalNotes: "Lead front-desk host. OKÜ & Terrace zones primary.", tags: ["front-desk", "oku", "terrace"] } });
  await prisma.user.update({ where: { id: host2User.id },  data: { lastLoginAt: daysBack(1), internalNotes: "CATCH zone specialist. Handles nightside queue.", tags: ["catch", "nightside"] } });
  await prisma.user.update({ where: { id: sideHostUser.id },data: { lastLoginAt: daysBack(2), internalNotes: "Streetside. Operates corner of Calle 1a. High conversion rate.", tags: ["streetside", "casco-viejo"] } });

  // ── UserAuditLog — demo admin action trail ───────────────────────────────
  await prisma.userAuditLog.createMany({ data: [
    { targetUserId: infUser.id,      performedByUserId: admin.id,       action: "ROLE_ASSIGNED",  summary: "Role INFLUENCER assigned",       reason: "New onboarding",             newValue: { roleKey: "INFLUENCER" } },
    { targetUserId: infUser.id,      performedByUserId: admin.id,       action: "STATUS_CHANGED", summary: "Status changed to ACTIVE",       reason: "Email verified",             previousValue: { status: "PENDING" }, newValue: { status: "ACTIVE" } },
    { targetUserId: infUser.id,      performedByUserId: commercial.id,  action: "NOTES_UPDATED",  summary: "Internal notes updated",         reason: null },
    { targetUserId: inf2User.id,     performedByUserId: admin.id,       action: "ROLE_ASSIGNED",  summary: "Role INFLUENCER assigned",       reason: "Onboarded via referral",     newValue: { roleKey: "INFLUENCER" } },
    { targetUserId: inf3User.id,     performedByUserId: commercial.id,  action: "ROLE_ASSIGNED",  summary: "Role INFLUENCER assigned",       reason: "Local creator program",      newValue: { roleKey: "INFLUENCER" } },
    { targetUserId: att1.id,         performedByUserId: admin.id,       action: "USER_UPDATED",   summary: "Profile email updated",          reason: null },
    { targetUserId: invUser.id,      performedByUserId: admin.id,       action: "ROLE_ASSIGNED",  summary: "Role INVESTOR assigned",         reason: "Approved by IR team",        newValue: { roleKey: "INVESTOR" } },
    { targetUserId: invUser.id,      performedByUserId: admin.id,       action: "NOTES_UPDATED",  summary: "Internal notes updated",         reason: null },
    { targetUserId: partUser.id,     performedByUserId: admin.id,       action: "ROLE_ASSIGNED",  summary: "Role PARTNER assigned",          reason: "Partner agreement signed",   newValue: { roleKey: "PARTNER" } },
    { targetUserId: staff1User.id,   performedByUserId: hrAdmin.id,     action: "ROLE_ASSIGNED",  summary: "Role STAFF_OKU assigned",        reason: "New hire — OKÜ FOH",         newValue: { roleKey: "STAFF_OKU" } },
    { targetUserId: staff2User.id,   performedByUserId: hrAdmin.id,     action: "ROLE_ASSIGNED",  summary: "Role STAFF_CATCH assigned",      reason: "New hire — CATCH nightside", newValue: { roleKey: "STAFF_CATCH" } },
    { targetUserId: host1User.id,    performedByUserId: hrAdmin.id,     action: "ROLE_ASSIGNED",  summary: "Role RESTAURANT_HOST assigned",  reason: "Front desk onboarding",      newValue: { roleKey: "RESTAURANT_HOST" } },
    { targetUserId: host2User.id,    performedByUserId: hrAdmin.id,     action: "ROLE_ASSIGNED",  summary: "Role RESTAURANT_HOST assigned",  reason: "Front desk onboarding",      newValue: { roleKey: "RESTAURANT_HOST" } },
    { targetUserId: sideHostUser.id, performedByUserId: hrAdmin.id,     action: "ROLE_ASSIGNED",  summary: "Role STREETSIDE_HOST assigned",  reason: "Streetside program intake",  newValue: { roleKey: "STREETSIDE_HOST" } },
  ]});

  // Analytics seed for experience analytics
  for (const opp of [opp1, opp2, opp3]) {
    const series = await prisma.series.findFirst({ where: { title: { contains: "OKÜ" } } });
    if (series) {
      try {
        await prisma.experienceAnalyticsDaily.create({
          data: {
            seriesId: series.id,
            date: new Date(new Date().setHours(0,0,0,0)),
            pageViews: Math.floor(Math.random() * 400) + 100,
            checkoutStarts: Math.floor(Math.random() * 80) + 20,
            ordersPaid: Math.floor(Math.random() * 40) + 10,
            ticketsSold: Math.floor(Math.random() * 80) + 20,
            grossRevenueCents: (Math.floor(Math.random() * 40) + 10) * 4500,
            waitlistSignups: Math.floor(Math.random() * 20),
            newsletterSignups: Math.floor(Math.random() * 15),
            memberPurchases: Math.floor(Math.random() * 10),
          },
        });
      } catch { /* duplicate date, skip */ }
      break;
    }
  }

  // ── Additional Orders & Tickets (att4-att7) ───────────────────────────────
  // att4 (Isabella Chen — PATRON) buys Design Masterclass GA
  const order7 = await prisma.order.create({
    data: {
      userId: att4.id, seriesId: series1.id, sessionId: s1s2.id,
      status: "PAID", subtotalCents: 13500, feesCents: 675, taxCents: 1134, totalCents: 15309,
      currency: "USD", attributedInfluencerId: influencer.id,
      lineItems: { create: [{ ticketTypeId: tt1mem.id, nameSnapshot: "Member Early Access", itemType: "ticket", qty: 1, unitPriceCents: 13500, totalCents: 13500 }] },
    },
  });
  await prisma.payment.create({ data: { orderId: order7.id, provider: "DEMO", status: "SUCCEEDED", amountCents: 15309, currency: "USD", authNetTransId: "DEMO-" + randCode(10) } });
  const t7 = await prisma.ticket.create({ data: { orderId: order7.id, userId: att4.id, sessionId: s1s2.id, ticketTypeId: tt1mem.id, code: "TIX-" + randCode(8), attendeeName: "Isabella Chen", attendeeEmail: "isabella@chen.local", ticketStatus: "ISSUED" } });

  // att5 (Oliver Nakamura) buys Cocktail Experience GA
  const order8 = await prisma.order.create({
    data: {
      userId: att5.id, seriesId: series2.id, sessionId: s2s2.id,
      status: "PAID", subtotalCents: 8500, feesCents: 425, taxCents: 714, totalCents: 9639,
      currency: "USD",
      lineItems: { create: [{ ticketTypeId: tt2gen.id, nameSnapshot: "Single Session", itemType: "ticket", qty: 1, unitPriceCents: 8500, totalCents: 8500 }] },
    },
  });
  await prisma.payment.create({ data: { orderId: order8.id, provider: "DEMO", status: "SUCCEEDED", amountCents: 9639, currency: "USD", authNetTransId: "DEMO-" + randCode(10) } });
  const t8 = await prisma.ticket.create({ data: { orderId: order8.id, userId: att5.id, sessionId: s2s2.id, ticketTypeId: tt2gen.id, code: "TIX-" + randCode(8), attendeeName: "Oliver Nakamura", attendeeEmail: "oliver@nakamura.local", ticketStatus: "ISSUED" } });

  // att6 (Camille Dubois — FOUNDER) buys Wellness Full Series Pass
  const order9 = await prisma.order.create({
    data: {
      userId: att6.id, seriesId: series4.id, sessionId: s4s2.id,
      status: "PAID", subtotalCents: 18000, feesCents: 900, taxCents: 1512, totalCents: 20412,
      currency: "USD",
      lineItems: { create: [{ ticketTypeId: tt4all.id, nameSnapshot: "Full Series Pass", itemType: "ticket", qty: 1, unitPriceCents: 18000, totalCents: 18000 }] },
    },
  });
  await prisma.payment.create({ data: { orderId: order9.id, provider: "DEMO", status: "SUCCEEDED", amountCents: 20412, currency: "USD", authNetTransId: "DEMO-" + randCode(10) } });
  const t9 = await prisma.ticket.create({ data: { orderId: order9.id, userId: att6.id, sessionId: s4s2.id, ticketTypeId: tt4all.id, code: "TIX-" + randCode(8), attendeeName: "Camille Dubois", attendeeEmail: "camille@dubois.local", ticketStatus: "ISSUED" } });

  // att7 (Rafael Costa) buys Wine Dinner GA
  const order10 = await prisma.order.create({
    data: {
      userId: att7.id, seriesId: series3.id, sessionId: s3s2.id,
      status: "PAID", subtotalCents: 22000, feesCents: 1100, taxCents: 1848, totalCents: 24948,
      currency: "USD",
      lineItems: { create: [{ ticketTypeId: tt3gen.id, nameSnapshot: "Dinner Seat", itemType: "ticket", qty: 1, unitPriceCents: 22000, totalCents: 22000 }] },
    },
  });
  await prisma.payment.create({ data: { orderId: order10.id, provider: "DEMO", status: "SUCCEEDED", amountCents: 24948, currency: "USD", authNetTransId: "DEMO-" + randCode(10) } });
  const t10 = await prisma.ticket.create({ data: { orderId: order10.id, userId: att7.id, sessionId: s3s2.id, ticketTypeId: tt3gen.id, code: "TIX-" + randCode(8), attendeeName: "Rafael Costa", attendeeEmail: "rafael@costa.local", ticketStatus: "ISSUED" } });

  // ── Check-In Logs (raw scanner audit trail) ───────────────────────────────
  // Valid scans
  await prisma.checkInLog.createMany({ data: [
    { ticketId: t1.id,  scannedCode: t1.code,  valid: true,  result: "VALID",              scannedByUserId: staff1User.id, deviceInfo: "iPhone 14 — Safari", createdAt: new Date(s1s1.startsAt.getTime() + 5  * 60000) },
    { ticketId: t7.id,  scannedCode: t7.code,  valid: true,  result: "VALID",              scannedByUserId: staff1User.id, deviceInfo: "iPad Air — Chrome",  createdAt: new Date(s1s2.startsAt.getTime() + 3  * 60000) },
    { ticketId: t8.id,  scannedCode: t8.code,  valid: true,  result: "VALID",              scannedByUserId: staff2User.id, deviceInfo: "Samsung S23 — App", createdAt: new Date(s2s2.startsAt.getTime() + 8  * 60000) },
    { ticketId: t9.id,  scannedCode: t9.code,  valid: true,  result: "VALID",              scannedByUserId: staff1User.id, deviceInfo: "iPhone 14 — Safari", createdAt: new Date(s4s2.startsAt.getTime() + 2  * 60000) },
    { ticketId: t10.id, scannedCode: t10.code, valid: true,  result: "VALID",              scannedByUserId: staff2User.id, deviceInfo: "iPad Air — Chrome",  createdAt: new Date(s3s2.startsAt.getTime() + 15 * 60000) },
    // Duplicate scan (already checked in)
    { ticketId: t1.id,  scannedCode: t1.code,  valid: false, result: "ALREADY_CHECKED_IN", scannedByUserId: staff2User.id, deviceInfo: "iPhone 14 — Safari", createdAt: new Date(s1s1.startsAt.getTime() + 45 * 60000) },
    // Invalid / unknown code
    { ticketId: null,   scannedCode: "TIX-ZZZZZZZZ", valid: false, result: "INVALID", scannedByUserId: staff1User.id, deviceInfo: "iPad Air — Chrome", createdAt: new Date(s1s1.startsAt.getTime() + 12 * 60000) },
    // Expired ticket scan
    { ticketId: t8.id,  scannedCode: t8.code,  valid: false, result: "INVALID",            scannedByUserId: staff1User.id, deviceInfo: "iPhone 14 — Safari", createdAt: new Date(s2s1.startsAt.getTime() + 20 * 60000) },
  ]});

  // ── Attendance Events (detailed per-ticket attendance) ────────────────────
  const now3 = new Date();
  await prisma.attendanceEvent.createMany({ data: [
    {
      ticketId: t1.id, sessionId: s1s1.id, userId: att1.id,
      status: "COMPLETED", arrivalTime: new Date(s1s1.startsAt.getTime() + 5 * 60000),
      seatedTime: new Date(s1s1.startsAt.getTime() + 8 * 60000),
      departureTime: new Date(s1s1.startsAt.getTime() + 130 * 60000), durationMinutes: 125,
      recordedByUserId: staff1User.id, notes: "VIP — escorted to front row",
    },
    {
      ticketId: t7.id, sessionId: s1s2.id, userId: att4.id,
      status: "COMPLETED", arrivalTime: new Date(s1s2.startsAt.getTime() + 3 * 60000),
      seatedTime: new Date(s1s2.startsAt.getTime() + 6 * 60000),
      departureTime: new Date(s1s2.startsAt.getTime() + 115 * 60000), durationMinutes: 112,
      recordedByUserId: staff1User.id,
    },
    {
      ticketId: t8.id, sessionId: s2s2.id, userId: att5.id,
      status: "SEATED", arrivalTime: new Date(s2s2.startsAt.getTime() + 8 * 60000),
      seatedTime: new Date(s2s2.startsAt.getTime() + 12 * 60000),
      recordedByUserId: staff2User.id,
    },
    {
      ticketId: t9.id, sessionId: s4s2.id, userId: att6.id,
      status: "COMPLETED", arrivalTime: new Date(s4s2.startsAt.getTime() + 2 * 60000),
      seatedTime: new Date(s4s2.startsAt.getTime() + 5 * 60000),
      departureTime: new Date(s4s2.startsAt.getTime() + 230 * 60000), durationMinutes: 228,
      recordedByUserId: staff1User.id, notes: "FOUNDER — requested private seating area",
    },
    {
      ticketId: t10.id, sessionId: s3s2.id, userId: att7.id,
      status: "ARRIVED", arrivalTime: new Date(s3s2.startsAt.getTime() + 15 * 60000),
      recordedByUserId: staff2User.id,
    },
  ]});

  // Mark checked-in tickets as CHECKED_IN
  await prisma.ticket.updateMany({
    where: { id: { in: [t1.id, t7.id, t8.id, t9.id, t10.id] } },
    data: { ticketStatus: "CHECKED_IN" },
  });

  // ── Influencer Ledger: full commission history + payout batches ───────────
  // Sophia's additional commission entries (older sales)
  await prisma.ledgerEntry.createMany({ data: [
    { influencerId: influencer.id, type: "COMMISSION_EARNED",   amountCents:  2250, note: "12% commission — Design Masterclass Member Access (Isabella Chen)", createdAt: new Date(now3.getTime() - 12 * 86400000) },
    { influencerId: influencer.id, type: "COMMISSION_EARNED",   amountCents:  3600, note: "12% commission — Wine Dinner Seat (referral attributed)",            createdAt: new Date(now3.getTime() - 25 * 86400000) },
    { influencerId: influencer.id, type: "COMMISSION_EARNED",   amountCents:  1800, note: "12% commission — Design Masterclass GA (external referral)",          createdAt: new Date(now3.getTime() - 38 * 86400000) },
    { influencerId: influencer.id, type: "COMMISSION_EARNED",   amountCents:  5000, note: "12% commission — Wellness Full Series (bulk referral)",               createdAt: new Date(now3.getTime() - 50 * 86400000) },
    { influencerId: influencer.id, type: "COMMISSION_EARNED",   amountCents:  7500, note: "Q1 performance bonus — exceeded referral target",                    createdAt: new Date(now3.getTime() - 60 * 86400000) },
    { influencerId: influencer.id, type: "COMMISSION_REVERSED", amountCents:  1200, note: "Refund reversal — Order #7 partial refund",                          createdAt: new Date(now3.getTime() - 45 * 86400000) },
  ]});

  // Sophia payout batch (Q4 2025, closed)
  const sophiaPayout = await prisma.payoutBatch.create({
    data: {
      status:   "CLOSED",
      from:     new Date(now3.getTime() - 90 * 86400000),
      to:       new Date(now3.getTime() - 30 * 86400000),
      closedAt: new Date(now3.getTime() - 30 * 86400000),
    },
  });
  // Commission paid entry linked to the payout batch
  await prisma.ledgerEntry.create({
    data: {
      influencerId: influencer.id, payoutBatchId: sophiaPayout.id,
      type: "COMMISSION_PAID", amountCents: 18630, currency: "USD",
      note: "Q4 2025 payout disbursed via bank transfer",
      createdAt: new Date(now3.getTime() - 30 * 86400000),
    },
  });

  // Sarah Jenkins — commission history + open payout batch (Q1 2026)
  await prisma.ledgerEntry.createMany({ data: [
    { influencerId: influencer2.id, type: "COMMISSION_EARNED", amountCents: 1200, note: "10% commission — Ibiza Supper Club GA (referral)",     createdAt: new Date(now3.getTime() - 18 * 86400000) },
    { influencerId: influencer2.id, type: "COMMISSION_EARNED", amountCents:  950, note: "10% commission — Cocktail Experience referral",        createdAt: new Date(now3.getTime() - 22 * 86400000) },
    { influencerId: influencer2.id, type: "COMMISSION_EARNED", amountCents: 1800, note: "10% commission — Wellness Series referral",            createdAt: new Date(now3.getTime() - 35 * 86400000) },
    { influencerId: influencer2.id, type: "COMMISSION_EARNED", amountCents: 2500, note: "Launch bonus — first 10 referrals milestone",         createdAt: new Date(now3.getTime() - 40 * 86400000) },
  ]});

  await prisma.payoutBatch.create({
    data: {
      status: "OPEN",
      from:   new Date(now3.getTime() - 60 * 86400000),
      to:     new Date(),
    },
  });

  // Marco Villanueva — Panama-based, commission history (inf3 profile)
  const inf3Profile = await prisma.influencerProfile.findFirst({ where: { handle: "@marcovillanueva" } });
  if (inf3Profile) {
    await prisma.ledgerEntry.createMany({ data: [
      { influencerId: inf3Profile.id, type: "COMMISSION_EARNED", amountCents: 2200, note: "11% commission — Wine Dinner 2-top referral",              createdAt: new Date(now3.getTime() - 14 * 86400000) },
      { influencerId: inf3Profile.id, type: "COMMISSION_EARNED", amountCents: 1650, note: "11% commission — Design Masterclass referral",             createdAt: new Date(now3.getTime() - 28 * 86400000) },
      { influencerId: inf3Profile.id, type: "COMMISSION_EARNED", amountCents: 3300, note: "11% commission — Cocktail Experience 4-pack referral",     createdAt: new Date(now3.getTime() - 42 * 86400000) },
    ]});

    await prisma.payoutBatch.create({
      data: {
        status: "OPEN",
        from:   new Date(now3.getTime() - 45 * 86400000),
        to:     new Date(),
      },
    });
  }

  // ── Today's Reservations — visible in the Host Dashboard immediately ────────
  const todayBase = new Date();
  todayBase.setHours(0, 0, 0, 0);
  function todayAt(h: number, m = 0) {
    const d = new Date(todayBase);
    d.setHours(h, m, 0, 0);
    return d;
  }

  const todayGuests = [
    { name: "Sophie Blanchard",  email: "s.blanchard@email.com",  phone: "+33-6-1001", concept: "OKU",     zone: "oku",     party: 2, occasion: "Anniversary", status: "ARRIVED"   as const, hour: 19, ref: "SOPC01" },
    { name: "Miguel Torres",     email: "m.torres@gmail.com",     phone: "+507-6300-11", concept: "CATCH",  zone: "catch",   party: 5, occasion: "Birthday",    status: "CONFIRMED" as const, hour: 20, ref: "TAXI01" },
    { name: "Priya Kapoor",      email: "priya.k@email.com",      phone: "+91-98100-1",  concept: "TERRACE",zone: "terrace", party: 3, occasion: null,          status: "PENDING"   as const, hour: 18, ref: "CARLOS01" },
    { name: "Ethan Blackwell",   email: "e.black@gmail.com",      phone: "+1-555-3301",  concept: "OKU",    zone: "oku",     party: 4, occasion: null,          status: "PENDING"   as const, hour: 19, ref: "MARC01" },
    { name: "Yuna Park",         email: "yuna.p@email.com",       phone: "+82-10-4400",  concept: "TERRACE",zone: "terrace", party: 2, occasion: "Date night",  status: "CONFIRMED" as const, hour: 20, ref: "ANA01" },
    { name: "Haruto Sato",       email: "h.sato@email.com",       phone: "+81-90-5501",  concept: "OKU",    zone: "oku",     party: 6, occasion: "Corporate",   status: "SEATED"    as const, hour: 19, ref: "TOUR01" },
    { name: "Isabelle Martin",   email: "i.martin@email.com",     phone: "+33-6-2202",   concept: "CATCH",  zone: "catch",   party: 4, occasion: "Birthday",    status: "PENDING"   as const, hour: 21, ref: "TAXI02" },
    { name: "David Okonkwo",     email: "d.okonkwo@email.com",    phone: "+234-80-3303", concept: "OKU",    zone: "vip",     party: 2, occasion: null,          status: "ARRIVED"   as const, hour: 20, ref: "SOPC01" },
  ];

  for (const g of todayGuests) {
    const code = `TODAY${Date.now().toString(36).toUpperCase().slice(-6)}${Math.random().toString(36).slice(2, 4).toUpperCase()}`;
    const ref = referrers[g.ref];
    const res = await prisma.reservation.create({
      data: {
        venueId: goldHouse.id,
        zoneId: zones[g.zone].id,
        source: "UMBRELLA_SITE" as const,
        status: g.status,
        reservationDate: todayAt(g.hour),
        partySize: g.party,
        conceptRequested: g.concept,
        occasion: g.occasion ?? undefined,
        contactName: g.name,
        contactEmail: g.email,
        contactPhone: g.phone,
        confirmationCode: code,
        assignedRestaurantHostId: g.zone === "catch" ? host2Profile.id : host1Profile.id,
        estimatedRevenueCents: g.party * 4500,
      },
    });

    if (ref) {
      await prisma.reservationAttribution.create({
        data: {
          reservationId: res.id,
          referrerId: ref.id,
          sourceType: "UMBRELLA_SITE" as const,
          commissionEligible: g.status === "SEATED",
          conversionStage: g.status === "SEATED" ? "PATRONIZED" : "REFERRED_UPSTAIRS",
          coversAttributed: g.status === "SEATED" ? g.party : 0,
        },
      });
    }

    if ((["PENDING", "CONFIRMED"] as string[]).includes(g.status)) {
      await prisma.reservationHandoff.create({
        data: {
          reservationId: res.id,
          sentByRole: "STREETSIDE_HOST",
          sentByLabel: sideHostUser.id,
          handoffStatus: g.status === "CONFIRMED" ? "ACKNOWLEDGED" : "PENDING",
          waitTimeMinutes: 10,
        },
      });
    }
  }

  // Streetside-submitted booking (visible as mySubmissions for Diego Rivera)
  const sideCode = `SIDE${Date.now().toString(36).toUpperCase().slice(-6)}AB`;
  const sideSub = await prisma.reservation.create({
    data: {
      venueId: goldHouse.id,
      zoneId: zones["terrace"].id,
      source: "STREETSIDE_HOST" as const,
      status: "PENDING" as const,
      reservationDate: todayAt(19, 30),
      partySize: 3,
      conceptRequested: "TERRACE",
      occasion: "None",
      contactName: "Walk-in Group",
      contactEmail: "walkin@oku.local",
      contactPhone: "+507-6000-0099",
      confirmationCode: sideCode,
      estimatedRevenueCents: 3 * 4500,
    },
  });
  await prisma.reservationHandoff.create({
    data: {
      reservationId: sideSub.id,
      sentByRole: "STREETSIDE_HOST",
      sentByLabel: sideHostUser.id,
      handoffStatus: "PENDING",
      waitTimeMinutes: 20,
    },
  });

  // ── EventReferrerAssignment for Rafael N. — shows referral tab in dashboard ─
  await prisma.eventReferrerAssignment.create({
    data: {
      parentInfluencerId: influencer.id,
      createdByInfluencerId: influencer.id,
      assignedUserId: host1User.id,
      assignedHostProfileId: host1Profile.id,
      displayName: "Rafael N. — Host Referral Link",
      referralCode: "RAFNH01",
      referralUrl: `${process.env.NEXTAUTH_URL ?? "https://okugroup.com"}/r/RAFNH01`,
      isCommissionEligible: true,
      commissionMode: "PERCENT_OF_INFLUENCER_COMMISSION" as const,
      commissionShareBps: 500,
      commissionPayer: "OKU",
      scopeType: "SERIES" as const,
      status: "ACTIVE" as const,
    },
  });

  // ── HostChatSession — demo live chat sessions in the host queue ──────────────
  const chat1 = await prisma.hostChatSession.create({
    data: {
      guestName: "Valentina Cruz",
      guestPhone: "+507-6000-1234",
      language: "es",
      status: "WAITING",
      venueId: goldHouse.id,
      hostUserId: host1User.id,
    },
  });
  await prisma.hostChatMessage.createMany({ data: [
    { sessionId: chat1.id, senderRole: "BOT",   content: "¡Hola! ¿En qué le podemos ayudar hoy?" },
    { sessionId: chat1.id, senderRole: "GUEST",  content: "Hola! Quiero hacer una reserva para esta noche, 4 personas." },
    { sessionId: chat1.id, senderRole: "HOST",   content: "Buenas noches Valentina! Tenemos mesa disponible en el área Terraza a las 8pm." },
    { sessionId: chat1.id, senderRole: "GUEST",  content: "Perfecto, la confirmamos. Gracias!" },
  ]});

  const chat2 = await prisma.hostChatSession.create({
    data: {
      guestName: "James Hill",
      guestPhone: "+1-555-9988",
      language: "en",
      status: "WAITING",
      venueId: goldHouse.id,
    },
  });
  await prisma.hostChatMessage.createMany({ data: [
    { sessionId: chat2.id, senderRole: "BOT",   content: "Hello! How can we help you today?" },
    { sessionId: chat2.id, senderRole: "GUEST",  content: "Hi, I have a reservation for 7pm but might be 20 minutes late. Is that okay?" },
  ]});

  const chat3 = await prisma.hostChatSession.create({
    data: {
      guestName: "Marie Dupont",
      guestPhone: "+33-6-7788",
      language: "en",
      status: "OPEN",
      venueId: goldHouse.id,
    },
  });
  await prisma.hostChatMessage.createMany({ data: [
    { sessionId: chat3.id, senderRole: "BOT",   content: "Hello! What language do you prefer?" },
    { sessionId: chat3.id, senderRole: "GUEST",  content: "English please." },
    { sessionId: chat3.id, senderRole: "BOT",   content: "Great! How can we help you today?" },
    { sessionId: chat3.id, senderRole: "GUEST",  content: "I'd like to make a reservation." },
  ]});

  console.log("\n✔ Seed complete — OKÜ Hospitality Group platform fully populated.");
  console.log("\nReferrer Personas (login at /login):");
  console.log("  Streetside Host:       carlos@oku.local         (Carlos Mendez)      REFERRER");
  console.log("  Taxi Driver:           taxi@oku.local           (Taxi Juan)          REFERRER");
  console.log("  Hotel Concierge:       sophie@oku.local         (Sophie Chen)        REFERRER");
  console.log("  Tour Operator:         panama@oku.local         (Panama City Tours)  REFERRER");
  console.log("\nDemo Credentials:");
  console.log("  Superadmin:            admin@oku.local          (Diana Torres)");
  console.log("  Admin Commercial:      commercial@oku.local     (Carlos Mendez)");
  console.log("  Admin IR:              ir@oku.local             (Valentina Reyes)");
  console.log("  Admin HR:              hr@oku.local             (Roberto Castillo)");
  console.log("  Influencer 1:          influencer@oku.local     (Sophia Laurent, Paris)");
  console.log("  Influencer 2:          sarah@oku.local          (Sarah Jenkins, London)");
  console.log("  Influencer 3:          marco@oku.local          (Marco Villanueva, Panama)");
  console.log("  Partner:               partner@oku.local        (Marco Rossi)");
  console.log("  Investor:              investor@oku.local       (James Whitfield)");
  console.log("  Staff OKU:             staff1@oku.local         (Elena Vargas)");
  console.log("  Staff CATCH:           staff2@oku.local         (Luis Padilla)");
  console.log("  Restaurant Host 1:     host1@oku.local          (Rafael Núñez)");
  console.log("  Restaurant Host 2:     host2@oku.local          (Camila Santos)");
  console.log("  Streetside Host:       sidehost@oku.local       (Diego Rivera)");
  console.log("  Attendee (PATRON):     attendee@oku.local       (Mia Rodriguez)     — ACTIVE membership");
  console.log("  Attendee (PATRON):     john@doe.local           (John Doe)           — ACTIVE membership");
  console.log("  Attendee:              jane@smith.local         (Jane Smith)         — no membership");
  console.log("  Attendee (PATRON):     isabella@chen.local      (Isabella Chen)      — ACTIVE membership");
  console.log("  Attendee:              oliver@nakamura.local    (Oliver Nakamura)    — no membership");
  console.log("  Attendee (FOUNDER):    camille@dubois.local     (Camille Dubois)     — ACTIVE FOUNDER");
  console.log("  Attendee:              rafael@costa.local       (Rafael Costa)       — no membership");
  console.log("  Attendee (EXPIRED):    yuki@tanaka.local        (Yuki Tanaka)        — EXPIRED membership");
  console.log("  Attendee (PENDING):    priya@patel.local        (Priya Patel)        — PENDING_APPROVAL");
}

// Payments P5a — Tenant-safe Cybersource default for OKÜ Panama.
// The schema default stays AUTHORIZE_NET so any future tenant-aware refactor
// does not silently force every new tenant to Cybersource. We only flip the
// OKÜ singleton row when (a) it still holds the original AUTHORIZE_NET value
// and (b) no operator has previously changed the active gateway (no
// payment.gateway.active.changed audit row exists). Idempotent on re-runs.
async function ensureCybersourceActiveForPanama() {
  const settings = await prisma.commerceSettings.upsert({
    where: { id: "global" },
    create: { id: "global", activeCheckoutGateway: "CYBERSOURCE" },
    update: {},
  });
  if (settings.activeCheckoutGateway !== "AUTHORIZE_NET") return;
  const operatorOverride = await prisma.auditLog.findFirst({
    where: { action: "payment.gateway.active.changed" },
    select: { id: true },
  });
  if (operatorOverride) return;
  await prisma.commerceSettings.update({
    where: { id: "global" },
    data: { activeCheckoutGateway: "CYBERSOURCE" },
  });
  console.log("  CommerceSettings.activeCheckoutGateway → CYBERSOURCE (OKÜ Panama default)");
}

main()
  .then(() => ensureCybersourceActiveForPanama())
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
