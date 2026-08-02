import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const series = await prisma.series.findMany({ take: 5, select: { id: true, title: true } });
  const s1 = series[0];
  const s2 = series[1];

  type SlotInput = {
    scopeType: "SERIES" | "EVENT" | "PRIVATE_DINING" | "CURATED_TABLE";
    title: string;
    category: "TITLE"|"BEVERAGE"|"SPIRITS"|"CULINARY"|"LUXURY"|"WELLNESS"|"REAL_ESTATE"|"MEDIA"|"EXPERIENCE"|"OTHER";
    seriesId?: string | null;
    description?: string;
    audienceProfile?: string;
    exclusivityNote?: string;
    isExclusive: boolean;
    maxSponsors: number;
    askPriceCents?: number;
    floorPriceCents?: number;
    isPublished: boolean;
    status: "OPEN"|"FILLED"|"SUSPENDED";
    benefits?: string[];
    deliverables?: string[];
    sortOrder: number;
  };

  const slots: SlotInput[] = [
    {
      scopeType: "SERIES",
      title: "Title Sponsor",
      category: "TITLE",
      seriesId: s1?.id ?? null,
      description: "The premier brand position. Your name alongside OKÜ in all communications, event assets, and digital presence.",
      audienceProfile: "Urban professionals 28–45, high disposable income, early adopters in food, culture, and design.",
      exclusivityNote: "Only one Title Sponsor per series. Fully exclusive.",
      isExclusive: true,
      maxSponsors: 1,
      askPriceCents: 1500000,
      floorPriceCents: 1000000,
      isPublished: true,
      status: "OPEN",
      benefits: ["Naming rights to the series","Logo on all event materials","Pre-event private dinner for brand team","Featured story in member newsletter","Social story takeover on event night"],
      deliverables: ["High-res logo + brand guidelines 4 weeks before","Approval of all co-branded assets","Post-event analytics report"],
      sortOrder: 0,
    },
    {
      scopeType: "SERIES",
      title: "Wine Partner",
      category: "BEVERAGE",
      seriesId: s1?.id ?? null,
      description: "Curate and present wines across all sessions. Your selections paired with our menus, with brand storytelling at each pour.",
      audienceProfile: "Wine-engaged professionals, collectors, culinary enthusiasts.",
      exclusivityNote: "One wine partner per series. No competing beverage brands.",
      isExclusive: true,
      maxSponsors: 1,
      askPriceCents: 750000,
      floorPriceCents: 500000,
      isPublished: true,
      status: "OPEN",
      benefits: ["Wine poured and branded throughout the series","Menu callout with origin story","Inclusion in pre-event member communications","Branded glassware option available"],
      deliverables: ["4 cases of wine per session","Label and tasting notes 2 weeks prior"],
      sortOrder: 1,
    },
    {
      scopeType: "SERIES",
      title: "Spirits Partner",
      category: "SPIRITS",
      seriesId: s2?.id ?? null,
      description: "Welcome cocktail and bar presence across the event series. Own the opening moment and the atmosphere of arrival.",
      audienceProfile: "Nightlife and culture crowd 25–40, premium spirits consumers.",
      isExclusive: true,
      maxSponsors: 1,
      askPriceCents: 600000,
      floorPriceCents: 400000,
      isPublished: true,
      status: "OPEN",
      benefits: ["Welcome cocktail named and branded","Back bar signage","Social story at event open","Branded cocktail menu card"],
      deliverables: ["2 cases spirits per session","Cocktail recipe approved by OKÜ bar team"],
      sortOrder: 2,
    },
    {
      scopeType: "SERIES",
      title: "Wellness Partner",
      category: "WELLNESS",
      description: "Gift bag placement, welcome card, and digital presence across member communications.",
      audienceProfile: "Health-conscious professionals, spa and wellness consumers, yoga and fitness demographics.",
      isExclusive: false,
      maxSponsors: 2,
      askPriceCents: 350000,
      floorPriceCents: 250000,
      isPublished: true,
      status: "OPEN",
      benefits: ["Product placement in guest welcome kit","Feature in member newsletter","Instagram story mention on event day"],
      deliverables: ["Product samples for all attendees delivered 1 week prior"],
      sortOrder: 3,
    },
    {
      scopeType: "SERIES",
      title: "Cultural Media Partner",
      category: "MEDIA",
      description: "Content partnership across the series. Co-create editorial, receive professional photography, and publish across both audiences.",
      audienceProfile: "Cultural consumers, editorial readers, social media enthusiasts 22–38.",
      isExclusive: true,
      maxSponsors: 1,
      askPriceCents: 500000,
      floorPriceCents: 300000,
      isPublished: true,
      status: "OPEN",
      benefits: ["Co-produced editorial feature","Professional photo set from event","Shared content calendar","Listed as Media Partner on event page"],
      deliverables: ["Minimum 2 published features per series","Full photo rights"],
      sortOrder: 4,
    },
    {
      scopeType: "EVENT",
      title: "Founder Table Real Estate Partner",
      category: "REAL_ESTATE",
      description: "Sponsorship of a private founder dinner. Intimate table of 12 with OKÜ Founder Members. Ideal for relationship-driven real estate firms.",
      audienceProfile: "HNW founders, investors, and executives. Average household wealth $2M+.",
      isExclusive: true,
      maxSponsors: 1,
      askPriceCents: 2500000,
      floorPriceCents: 1800000,
      isPublished: true,
      status: "OPEN",
      benefits: ["Two seats at the founder table","Introductory remarks to group","Branded menu card","Post-event attendee summary"],
      deliverables: ["Brand deck approved by OKÜ team","No direct sales pitch at the event"],
      sortOrder: 5,
    },
    {
      scopeType: "SERIES",
      title: "Luxury Gifting Partner",
      category: "LUXURY",
      description: "Exclusive gifting presence at our most-attended experiences. Products presented as premium gifts to all attendees.",
      audienceProfile: "HNW individuals, gift buyers, luxury lifestyle consumers.",
      isExclusive: true,
      maxSponsors: 1,
      askPriceCents: 800000,
      floorPriceCents: 600000,
      isPublished: false,
      status: "OPEN",
      benefits: ["Gift product in every attendee bag","In-room display at dining experience","Social mention on event night","Member newsletter feature"],
      deliverables: ["Products delivered 1 week before event","Custom OKÜ gift wrapping optional"],
      sortOrder: 6,
    },
  ];

  let count = 0;
  for (const slot of slots) {
    const { benefits, deliverables, ...rest } = slot;
    await prisma.sponsorshipSlot.create({
      data: { ...rest, benefits: benefits ?? null, deliverables: deliverables ?? null },
    });
    count++;
    console.log(`  ✓ ${slot.title}`);
  }

  console.log(`\nSeeded ${count} sponsorship slots.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
