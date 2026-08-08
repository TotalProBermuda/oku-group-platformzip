import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

const ENGAGEMENT_LABELS: Record<string, string> = {
  FULL_TIME:   "Full-time",
  PART_TIME:   "Part-time",
  SEASONAL:    "Seasonal",
  CONTRACT:    "Contract",
  CONSULTANT:  "Consultant",
  FREELANCE:   "Freelance",
  TALENT:      "Talent",
  INTERN:      "Intern",
  TEMPORARY:   "Temporary",
};

export default async function OpportunityPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ applied?: string }>;
}) {
  const { slug } = await params;
  const { applied } = await searchParams;

  const opp = await prisma.opportunity.findUnique({
    where: { slug },
    include: {
      formTemplate: { select: { id: true, version: true, name: true } },
    },
  });

  if (!opp || opp.status !== "PUBLISHED") notFound();

  const responsibilities = opp.responsibilities as string[] | null;
  const requirements     = opp.requirements as string[] | null;

  return (
    <main>
      <section style={{ background: "var(--color-bg)", borderBottom: "1px solid var(--color-border)", padding: "64px 24px 48px" }}>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <Link href="/careers" style={{ fontSize: 13, color: "var(--color-text-muted)", display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 24, textDecoration: "none" }}>
            ← All Positions
          </Link>

          {applied === "1" && (
            <div
              style={{
                background: "#f0fdf4",
                border: "1px solid #bbf7d0",
                borderRadius: 10,
                padding: "16px 20px",
                marginBottom: 24,
                color: "#15803d",
                fontSize: 14,
              }}
            >
              ✓ Your application has been submitted. We'll be in touch soon.
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
            {opp.department && <span className="badge badge-neutral">{opp.department}</span>}
            <span className="badge badge-neutral">{ENGAGEMENT_LABELS[opp.engagementType] ?? opp.engagementType}</span>
            {opp.brandKey && <span className="badge badge-neutral">{opp.brandKey}</span>}
            {opp.locationKey && <span className="badge badge-neutral">{opp.locationKey}</span>}
          </div>

          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "clamp(30px, 4vw, 44px)", fontWeight: 400, letterSpacing: "-0.02em", color: "var(--color-text)", margin: "0 0 24px" }}>
            {opp.title}
          </h1>

          <Link href={`/careers/${opp.slug}/apply`} className="btn btn-primary" style={{ fontSize: 15, padding: "12px 28px" }}>
            Apply Now →
          </Link>
        </div>
      </section>

      <section style={{ maxWidth: 800, margin: "0 auto", padding: "48px 24px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
          {opp.description && (
            <div>
              <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 20, fontWeight: 500, marginBottom: 12 }}>
                About the Role
              </h2>
              <p style={{ fontSize: 15, lineHeight: 1.7, color: "var(--color-text-muted)", margin: 0 }}>
                {opp.description}
              </p>
            </div>
          )}

          {responsibilities && responsibilities.length > 0 && (
            <div>
              <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 20, fontWeight: 500, marginBottom: 12 }}>
                Responsibilities
              </h2>
              <ul style={{ paddingLeft: 20, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                {responsibilities.map((r, i) => (
                  <li key={i} style={{ fontSize: 15, lineHeight: 1.6, color: "var(--color-text-muted)" }}>{r}</li>
                ))}
              </ul>
            </div>
          )}

          {requirements && requirements.length > 0 && (
            <div>
              <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 20, fontWeight: 500, marginBottom: 12 }}>
                Requirements
              </h2>
              <ul style={{ paddingLeft: 20, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                {requirements.map((r, i) => (
                  <li key={i} style={{ fontSize: 15, lineHeight: 1.6, color: "var(--color-text-muted)" }}>{r}</li>
                ))}
              </ul>
            </div>
          )}

          {opp.compensationMin || opp.compensationMax ? (
            <div className="card" style={{ padding: 24, background: "var(--color-bg-secondary, #f8f5f3)" }}>
              <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 18, fontWeight: 500, marginBottom: 8 }}>
                Compensation
              </h2>
              <div style={{ fontSize: 15, color: "var(--color-text-muted)" }}>
                {opp.compensationType?.replaceAll("_", " ")}
                {opp.compensationMin && opp.compensationMax
                  ? `: ${opp.currency ?? "USD"} ${opp.compensationMin.toLocaleString()} – ${opp.compensationMax.toLocaleString()}`
                  : opp.compensationMin
                  ? `: from ${opp.currency ?? "USD"} ${opp.compensationMin.toLocaleString()}`
                  : ""}
              </div>
            </div>
          ) : null}

          <div style={{ paddingTop: 16, borderTop: "1px solid var(--color-border)" }}>
            <Link href={`/careers/${opp.slug}/apply`} className="btn btn-primary" style={{ fontSize: 15, padding: "12px 28px" }}>
              Apply for this Position →
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
