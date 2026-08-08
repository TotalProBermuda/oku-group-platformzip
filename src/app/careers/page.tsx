import Link from "next/link";
import { prisma } from "@/lib/prisma";
import CareerJobCard from "@/components/hiring/CareerJobCard";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string>> };

const ENGAGEMENT_LABELS: Record<string, string> = {
  FULL_TIME:  "Full-time",
  PART_TIME:  "Part-time",
  SEASONAL:   "Seasonal",
  CONTRACT:   "Contract",
  CONSULTANT: "Consultant",
  FREELANCE:  "Freelance",
};

export default async function CareersPage({ searchParams }: Props) {
  const sp = await searchParams;

  const baseWhere = { status: "PUBLISHED" as const, visibility: "PUBLIC" as const };
  const where: typeof baseWhere & { department?: string; engagementType?: string } = { ...baseWhere };
  if (sp.dept) where.department = sp.dept;
  if (sp.type) where.engagementType = sp.type;

  const [opportunities, allOpps] = await Promise.all([
    prisma.opportunity.findMany({ where, orderBy: { createdAt: "desc" } }),
    prisma.opportunity.findMany({
      where: baseWhere,
      select: { department: true, engagementType: true },
    }),
  ]);

  const departments = [...new Set(allOpps.map((o) => o.department).filter(Boolean))] as string[];
  const types       = [...new Set(allOpps.map((o) => o.engagementType))];

  const hasFilters = !!(sp.dept || sp.type);

  return (
    <main>
      {/* Hero */}
      <section style={{ background: "var(--color-bg)", borderBottom: "1px solid var(--color-border)", padding: "72px 24px 56px" }}>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--color-crimson)", marginBottom: 12 }}>
            Join Our Team
          </div>
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "clamp(36px, 5vw, 56px)", fontWeight: 400, letterSpacing: "-0.02em", color: "var(--color-text)", margin: "0 0 16px" }}>
            Careers at OKÜ Hospitality Group
          </h1>
          <p style={{ fontSize: 16, lineHeight: 1.65, color: "var(--color-text-muted)", maxWidth: 520, margin: 0 }}>
            We build exceptional hospitality experiences. Join one of our brands and help us create moments that matter.
          </p>
        </div>
      </section>

      <section style={{ maxWidth: 960, margin: "0 auto", padding: "40px 24px 64px" }}>

        {/* Filter pills */}
        {(departments.length > 0 || types.length > 0) && (
          <div style={{ marginBottom: 32 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <FilterPill href="/careers" active={!hasFilters} label="All Roles" />

              {departments.map((dept) => (
                <FilterPill
                  key={dept}
                  href={`/careers?dept=${encodeURIComponent(dept)}${sp.type ? `&type=${sp.type}` : ""}`}
                  active={sp.dept === dept}
                  label={dept}
                />
              ))}

              {departments.length > 0 && types.length > 0 && (
                <span style={{ color: "var(--color-border)", margin: "0 2px" }}>|</span>
              )}

              {types.map((t) => (
                <FilterPill
                  key={t}
                  href={`/careers?type=${t}${sp.dept ? `&dept=${encodeURIComponent(sp.dept)}` : ""}`}
                  active={sp.type === t}
                  label={ENGAGEMENT_LABELS[t] ?? t}
                />
              ))}

              {hasFilters && (
                <Link href="/careers" style={{ fontSize: 12, color: "var(--color-crimson)", fontWeight: 600, textDecoration: "none", marginLeft: 4 }}>
                  × Clear
                </Link>
              )}
            </div>

            {hasFilters && (
              <p style={{ fontSize: 13, color: "var(--color-text-muted)", marginTop: 10, marginBottom: 0 }}>
                {opportunities.length} {opportunities.length === 1 ? "role" : "roles"} matching your filter
              </p>
            )}
          </div>
        )}

        {/* Listings */}
        {opportunities.length === 0 ? (
          <div style={{ textAlign: "center", padding: "64px 24px", color: "var(--color-text-muted)" }}>
            <div style={{ fontFamily: "var(--font-heading)", fontSize: 22, marginBottom: 8, color: "var(--color-text)" }}>
              No open positions{hasFilters ? " matching this filter" : " right now"}
            </div>
            <p style={{ fontSize: 14, margin: "0 0 20px" }}>
              {hasFilters ? "Try a different filter — " : "Check back soon — "}we post new opportunities regularly.
            </p>
            {hasFilters && (
              <Link href="/careers" className="btn btn-ghost" style={{ fontSize: 13 }}>
                View all roles
              </Link>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {opportunities.map((opp) => (
              <CareerJobCard key={opp.id} opp={opp} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function FilterPill({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      style={{
        fontSize: 12,
        fontWeight: active ? 700 : 500,
        padding: "5px 14px",
        borderRadius: 20,
        border: `1px solid ${active ? "var(--color-crimson)" : "var(--color-border)"}`,
        background: active ? "var(--color-crimson)" : "transparent",
        color: active ? "#fff" : "var(--color-text-muted)",
        textDecoration: "none",
        whiteSpace: "nowrap" as const,
        transition: "all 0.12s",
      }}
    >
      {label}
    </Link>
  );
}
