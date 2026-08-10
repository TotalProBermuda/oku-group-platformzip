import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminRoles } from "@/server/auth/adminGuard";

function deriveCategory(roleKeys: string[]): string {
  if (roleKeys.includes("SUPERADMIN") || roleKeys.includes("FB_DIRECTOR")) return "admin";
  if (roleKeys.some(r => r.startsWith("ADMIN_"))) return "admin";
  if (roleKeys.includes("INFLUENCER")) return "influencer";
  if (roleKeys.includes("PARTNER")) return "partner";
  if (roleKeys.includes("INVESTOR")) return "investor";
  if (roleKeys.includes("STAFF_OKU") || roleKeys.includes("STAFF_CATCH")) return "staff";
  if (roleKeys.includes("RESTAURANT_HOST") || roleKeys.includes("RESTAURANT_SUPERVISOR")) return "host";
  if (roleKeys.includes("STREETSIDE_HOST")) return "referrer";
  if (roleKeys.includes("REFERRER")) return "referrer";
  if (roleKeys.includes("ATTENDEE")) return "attendee";
  return "visitor";
}

function mapUserStatus(s: string): string {
  if (s === "ACTIVE") return "ACTIVE";
  if (s === "SUSPENDED" || s === "LOCKED" || s === "BANNED") return "SUSPENDED";
  if (s === "ARCHIVED") return "ARCHIVED";
  if (s === "PENDING") return "PENDING";
  return "ACTIVE";
}

export async function GET(req: NextRequest) {
  try {
    await requireAdminRoles(req, ["SUPERADMIN"]);

    const { searchParams } = new URL(req.url);
    const q                   = searchParams.get("q") ?? "";
    const profileType         = searchParams.get("profileType");
    const category            = searchParams.get("category");
    const status              = searchParams.get("status");
    const hasAccess           = searchParams.get("hasAccess");
    const assigned            = searchParams.get("assigned");
    const compensationEligible = searchParams.get("compensationEligible");
    const page                = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const pageSize            = Math.min(100, parseInt(searchParams.get("pageSize") ?? "50", 10));

    const [users, referrers, entities] = await Promise.all([
      prisma.user.findMany({
        select: {
          id: true, email: true, name: true, imageUrl: true, phone: true,
          status: true, createdAt: true,
          roles: { select: { roleKey: true } },
          influencer: {
            select: {
              id: true, refCode: true, approved: true, handle: true, commissionRateBps: true,
              series: { select: { id: true } },
            },
          },
          partner:    { select: { name: true, approved: true } },
          membership: { select: { tier: true, status: true } },
          referrer:   { select: { id: true, referralCode: true, organizationName: true, referrerType: true } },
          restaurantHost: { select: { id: true } },
        },
        orderBy: { name: "asc" },
      }),
      prisma.referrer.findMany({
        where: { userId: null },
        select: {
          id: true, fullName: true, email: true, phone: true, whatsapp: true,
          organizationName: true, referralCode: true, referrerType: true,
          isActive: true, createdAt: true,
        },
        orderBy: { fullName: "asc" },
      }),
      prisma.entity.findMany({
        where: { linkedUserId: null },
        select: {
          id: true, type: true, displayName: true, logoUrl: true,
          description: true, websiteUrl: true, createdAt: true,
          seriesHosts: { select: { id: true } },
          eventHosts:  { select: { id: true } },
        },
        orderBy: { displayName: "asc" },
      }),
    ]);

    const userProfiles = users.map(u => {
      const roleKeys  = u.roles.map(r => r.roleKey as string);
      const cat       = deriveCategory(roleKeys);
      const seriesCnt = u.influencer?.series?.length ?? 0;
      const compElig  = !!(u.influencer?.approved || u.partner?.approved
        || roleKeys.includes("REFERRER") || roleKeys.includes("STREETSIDE_HOST"));

      return {
        id: `user_${u.id}`,
        sourceType: "USER" as const,
        sourceId: u.id,
        profileType: "PERSON" as const,
        displayName: u.name ?? u.email,
        email: u.email,
        phone: u.phone ?? null,
        avatarUrl: u.imageUrl ?? null,
        logoUrl: null as string | null,
        primaryCategory: cat,
        categories: [cat],
        roles: roleKeys,
        status: mapUserStatus(u.status),
        hasAccess: true,
        compensationEligible: compElig,
        publicVisible: true,
        assignableToSeries: cat === "influencer" || cat === "partner",
        organizationName: u.referrer?.organizationName ?? null,
        referralCode: u.referrer?.referralCode ?? null,
        companyParent: u.referrer?.organizationName ?? null,
        createdAt: u.createdAt.toISOString(),
        membershipTier: u.membership?.tier ?? null,
        membershipStatus: u.membership?.status ?? null,
        influencerRefCode: u.influencer?.refCode ?? null,
        influencerHandle: u.influencer?.handle ?? null,
        _count: { accountLinks: 1, seriesAssignments: seriesCnt, sessionAssignments: 0, childRelationships: 0 },
        accountLinks: [{
          id: `acc_${u.id}`,
          relationshipType: "OWNER",
          isPrimary: true,
          user: { id: u.id, email: u.email, status: u.status, name: u.name ?? undefined },
        }],
        parentRelationships: [] as { relationshipType: string; parentProfile: { id: string; displayName: string; profileType: string } }[],
      };
    });

    const referrerProfiles = referrers.map(r => {
      const isCompany = !!(r.organizationName && (
        r.referrerType === "TOUR_GUIDE" || r.referrerType === "HOTEL_CONCIERGE" || r.referrerType === "PARTNER"
      ));
      return {
        id: `ref_${r.id}`,
        sourceType: "REFERRER" as const,
        sourceId: r.id,
        profileType: (isCompany ? "COMPANY" : "PERSON") as "PERSON" | "COMPANY",
        displayName: r.fullName,
        email: r.email ?? null,
        phone: r.phone ?? r.whatsapp ?? null,
        avatarUrl: null as string | null,
        logoUrl: null as string | null,
        primaryCategory: "referrer",
        categories: ["referrer"],
        roles: ["REFERRER"],
        status: r.isActive ? "ACTIVE" : "INACTIVE",
        hasAccess: false,
        compensationEligible: true,
        publicVisible: false,
        assignableToSeries: false,
        organizationName: r.organizationName ?? null,
        referralCode: r.referralCode,
        companyParent: r.organizationName ?? null,
        createdAt: r.createdAt.toISOString(),
        membershipTier: null,
        membershipStatus: null,
        influencerRefCode: null,
        influencerHandle: null,
        _count: { accountLinks: 0, seriesAssignments: 0, sessionAssignments: 0, childRelationships: 0 },
        accountLinks: [] as { id: string; relationshipType: string; isPrimary: boolean; user: { id: string; email: string; status: string; name?: string } }[],
        // parentRelationships intentionally left empty here. Previously we
        // synthesized a fake parent profile from free-text `organizationName`
        // (e.g. id: "org_<referrerId>"), which produced ghost organizations
        // that were not backed by any FK and could not be safely consumed
        // downstream. Real parent linkage now flows from
        // ReferralAssignment.parentEntityId → Entity, which is what the
        // Referral Organization Resolver review queue produces. The
        // `companyParent` string is still surfaced above for display only.
        parentRelationships: [] as { relationshipType: string; parentProfile: { id: string; displayName: string; profileType: string } }[],
        referrerType: r.referrerType as string,
      };
    });

    const entityProfiles = entities.map(e => {
      const seriesCnt = e.seriesHosts.length + e.eventHosts.length;
      return {
        id: `ent_${e.id}`,
        sourceType: "ENTITY" as const,
        sourceId: e.id,
        profileType: e.type as "PERSON" | "COMPANY",
        displayName: e.displayName,
        email: null as string | null,
        phone: null as string | null,
        avatarUrl: null as string | null,
        logoUrl: e.logoUrl ?? null,
        primaryCategory: "entity",
        categories: ["entity"],
        roles: [] as string[],
        status: "ACTIVE",
        hasAccess: false,
        compensationEligible: false,
        publicVisible: true,
        assignableToSeries: true,
        organizationName: null as string | null,
        referralCode: null as string | null,
        companyParent: null as string | null,
        createdAt: e.createdAt.toISOString(),
        membershipTier: null,
        membershipStatus: null,
        influencerRefCode: null,
        influencerHandle: null,
        _count: { accountLinks: 0, seriesAssignments: seriesCnt, sessionAssignments: 0, childRelationships: 0 },
        accountLinks: [] as { id: string; relationshipType: string; isPrimary: boolean; user: { id: string; email: string; status: string; name?: string } }[],
        parentRelationships: [] as { relationshipType: string; parentProfile: { id: string; displayName: string; profileType: string } }[],
      };
    });

    let all = [...userProfiles, ...referrerProfiles, ...entityProfiles];

    const ql = q.toLowerCase();
    if (ql) {
      all = all.filter(p =>
        p.displayName.toLowerCase().includes(ql) ||
        p.email?.toLowerCase().includes(ql) ||
        p.organizationName?.toLowerCase().includes(ql) ||
        p.referralCode?.toLowerCase().includes(ql)
      );
    }
    if (profileType)          all = all.filter(p => p.profileType === profileType);
    if (category)             all = all.filter(p => p.primaryCategory === category);
    if (status)               all = all.filter(p => p.status === status);
    if (hasAccess === "true") all = all.filter(p => p.hasAccess);
    if (hasAccess === "false") all = all.filter(p => !p.hasAccess);
    if (compensationEligible === "true")  all = all.filter(p => p.compensationEligible);
    if (compensationEligible === "false") all = all.filter(p => !p.compensationEligible);
    if (assigned === "true")  all = all.filter(p => p._count.seriesAssignments > 0);
    if (assigned === "false") all = all.filter(p => p._count.seriesAssignments === 0);

    all.sort((a, b) => a.displayName.localeCompare(b.displayName));

    const summary = {
      totalCount:     all.length,
      peopleCount:    all.filter(p => p.profileType === "PERSON").length,
      companiesCount: all.filter(p => p.profileType === "COMPANY").length,
      withAccessCount: all.filter(p => p.hasAccess).length,
      hostCount:      all.filter(p => p.primaryCategory === "host").length,
      referrerCount:  all.filter(p => p.primaryCategory === "referrer").length,
    };

    const total    = all.length;
    const skip     = (page - 1) * pageSize;
    const profiles = all.slice(skip, skip + pageSize);

    return NextResponse.json({ profiles, total, page, pageSize, pageCount: Math.ceil(total / pageSize), summary });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { session } = await requireAdminRoles(req, ["SUPERADMIN"]);
    const body = await req.json();
    const { profileType, displayName, legalName, slug, primaryCategory, categories,
      bio, shortDescription, email, phone, websiteUrl, instagramUrl, twitterUrl,
      avatarUrl, logoUrl, coverImageUrl, publicVisible, compensationEligible,
      assignableToSeries, assignableToSessions, status, metadata } = body;
    if (!profileType || !displayName) {
      return NextResponse.json({ error: "profileType and displayName are required" }, { status: 400 });
    }
    const dbUser = session?.user?.email
      ? await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } })
      : null;
    const profile = await prisma.profile.create({
      data: {
        profileType, displayName, legalName: legalName || null, slug: slug || null,
        primaryCategory: primaryCategory || null, categories: categories ?? [],
        bio: bio || null, shortDescription: shortDescription || null,
        email: email || null, phone: phone || null,
        websiteUrl: websiteUrl || null, instagramUrl: instagramUrl || null, twitterUrl: twitterUrl || null,
        avatarUrl: avatarUrl || null, logoUrl: logoUrl || null, coverImageUrl: coverImageUrl || null,
        publicVisible: publicVisible ?? false, compensationEligible: compensationEligible ?? false,
        assignableToSeries: assignableToSeries ?? true, assignableToSessions: assignableToSessions ?? true,
        status: status ?? "ACTIVE", metadata: metadata ?? {},
        createdByUserId: dbUser?.id ?? null,
      },
      select: { id: true, displayName: true, profileType: true, status: true, primaryCategory: true },
    });
    return NextResponse.json({ profile }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
