import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

type Props = { params: Promise<{ slug: string }> };

export default async function ApplicationSuccessPage({ params }: Props) {
  const { slug } = await params;

  const opp = await prisma.opportunity.findUnique({
    where: { slug },
    select: { title: true, department: true, locationKey: true, brandKey: true, status: true },
  });

  if (!opp || opp.status !== "PUBLISHED") notFound();

  return (
    <main style={{ minHeight: "80vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 24px" }}>
      <div style={{ maxWidth: 560, width: "100%", textAlign: "center" }}>

        {/* Success icon */}
        <div style={{
          width: 72, height: 72, borderRadius: "50%",
          background: "#e6f4ed", display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 28px", fontSize: 32,
        }}>
          ✓
        </div>

        {/* Heading */}
        <h1 style={{
          fontFamily: "var(--font-heading)", fontSize: "clamp(28px, 4vw, 40px)",
          fontWeight: 400, letterSpacing: "-0.02em", color: "var(--color-text)",
          margin: "0 0 16px",
        }}>
          Application Submitted
        </h1>

        <p style={{ fontSize: 16, lineHeight: 1.65, color: "var(--color-text-muted)", margin: "0 0 8px" }}>
          Thank you for applying for <strong style={{ color: "var(--color-text)", fontWeight: 600 }}>{opp.title}</strong>.
        </p>

        <p style={{ fontSize: 15, lineHeight: 1.65, color: "var(--color-text-muted)", margin: "0 0 36px" }}>
          Our team reviews applications carefully. If your profile is a strong match, we'll reach out within a few business days to discuss next steps.
        </p>

        {/* Details chip */}
        <div style={{
          display: "inline-flex", gap: 8, flexWrap: "wrap", justifyContent: "center",
          marginBottom: 40, padding: "12px 20px",
          background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 10,
        }}>
          {opp.department && (
            <span style={{ fontSize: 12, color: "var(--color-text-muted)", fontWeight: 500 }}>{opp.department}</span>
          )}
          {opp.locationKey && (
            <>
              <span style={{ color: "var(--color-border)" }}>·</span>
              <span style={{ fontSize: 12, color: "var(--color-text-muted)", fontWeight: 500 }}>{opp.locationKey}</span>
            </>
          )}
          {opp.brandKey && (
            <>
              <span style={{ color: "var(--color-border)" }}>·</span>
              <span style={{ fontSize: 12, color: "var(--color-text-muted)", fontWeight: 500 }}>{opp.brandKey}</span>
            </>
          )}
        </div>

        {/* What to expect */}
        <div style={{
          textAlign: "left", background: "var(--color-bg)",
          border: "1px solid var(--color-border)", borderRadius: 12,
          padding: "24px 28px", marginBottom: 36,
        }}>
          <h3 style={{ fontFamily: "var(--font-heading)", fontSize: 15, fontWeight: 600, marginBottom: 16, marginTop: 0, color: "var(--color-text)" }}>
            What happens next
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[
              { step: "1", label: "Application review", desc: "Your application will be reviewed by our HR team." },
              { step: "2", label: "Initial screening", desc: "Shortlisted candidates will be contacted for an initial conversation." },
              { step: "3", label: "Interview", desc: "Final candidates meet the team in person or via video call." },
            ].map(({ step, label, desc }) => (
              <div key={step} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                <div style={{
                  width: 24, height: 24, borderRadius: "50%", flexShrink: 0,
                  background: "var(--color-crimson)", color: "#fff",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 700,
                }}>
                  {step}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text)", marginBottom: 2 }}>{label}</div>
                  <div style={{ fontSize: 13, color: "var(--color-text-muted)", lineHeight: 1.5 }}>{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CTAs */}
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/careers" className="btn btn-primary" style={{ fontSize: 14, padding: "10px 24px" }}>
            View More Positions
          </Link>
          <Link href="/" className="btn btn-ghost" style={{ fontSize: 14, padding: "10px 24px" }}>
            Back to Home
          </Link>
        </div>
      </div>
    </main>
  );
}
