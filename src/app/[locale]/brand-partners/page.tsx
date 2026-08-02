import { getTranslations } from "@/i18n/getTranslations";
import { prisma } from "@/lib/prisma";
import Link from "next/link";

const CAT_ICONS: Record<string, string> = {
  TITLE: "👑", BEVERAGE: "🍷", SPIRITS: "🥃", CULINARY: "🍽️",
  LUXURY: "💎", WELLNESS: "🌿", REAL_ESTATE: "🏛️", MEDIA: "📸",
  EXPERIENCE: "✨", OTHER: "📦",
};

const CAT_LABELS: Record<string, string> = {
  TITLE: "Title Sponsor", BEVERAGE: "Beverage Partner", SPIRITS: "Spirits Partner",
  CULINARY: "Culinary Partner", LUXURY: "Luxury Partner", WELLNESS: "Wellness Partner",
  REAL_ESTATE: "Real Estate Partner", MEDIA: "Media Partner",
  EXPERIENCE: "Experience Partner", OTHER: "Partner",
};

export default async function BrandPartnersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations(locale);

  const slots = await prisma.sponsorshipSlot.findMany({
    where: { isPublished: true, status: "OPEN" },
    include: { series: { select: { id: true, title: true, slug: true } } },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  });

  const byCategory = slots.reduce<Record<string, typeof slots>>((acc, slot) => {
    if (!acc[slot.category]) acc[slot.category] = [];
    acc[slot.category].push(slot);
    return acc;
  }, {});

  return (
    <div>
      {/* Hero */}
      <section style={{ background: "#1a1614", color: "white", padding: "100px 24px 80px", textAlign: "center" }}>
        <div style={{ maxWidth: 680, margin: "0 auto" }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.2em", color: "#c41e3a", textTransform: "uppercase", marginBottom: 20 }}>
            Brand Partnerships
          </div>
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: 52, fontWeight: 400, lineHeight: 1.1, margin: "0 0 24px", letterSpacing: "-1px" }}>
            Partner with OKÜ
          </h1>
          <p style={{ fontSize: 18, lineHeight: 1.7, color: "#c9bfb5", margin: "0 0 36px" }}>
            Exclusive sponsorship opportunities across premium dining experiences, cultural series, and curated member events. Built for brands that understand the value of context.
          </p>
          <a href="#apply" className="btn btn-primary" style={{ fontSize: 16, padding: "14px 36px", display: "inline-block", textDecoration: "none" }}>
            Explore Opportunities
          </a>
        </div>
      </section>

      {/* Why OKÜ */}
      <section style={{ background: "#f8f5f3", padding: "80px 24px" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto" }}>
          <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 34, fontWeight: 400, color: "#1a1614", textAlign: "center", marginBottom: 16 }}>
            Why Brand Partners Choose OKÜ
          </h2>
          <p style={{ textAlign: "center", color: "#7c7168", fontSize: 16, marginBottom: 56, maxWidth: 580, margin: "0 auto 56px" }}>
            Our audience is not mass-market. It's curated, high-trust, and highly engaged.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 24 }}>
            {[
              { icon: "🎯", title: "Curated Audience", desc: "Every attendee is vetted. Membership-gated experiences attract engaged professionals, tastemakers, and decision-makers." },
              { icon: "🏛️", title: "Premium Context", desc: "Your brand sits at the table — literally. Intimate dining, cultural programming, and founder-level access." },
              { icon: "🤝", title: "Selective Placement", desc: "We limit sponsors per experience. Your brand never competes with noise — it owns the moment." },
              { icon: "📊", title: "Measurable Outcomes", desc: "Impression tracking, engagement reporting, and attribution data for every placement and activation." },
              { icon: "🌍", title: "Multi-City Presence", desc: "Series across Miami, New York, and Ibiza. One partnership, multiple high-value markets." },
              { icon: "✨", title: "Cultural Alignment", desc: "Food, design, wellness, music. Partner within the vertical that reflects your brand's values." },
            ].map((item) => (
              <div key={item.title} style={{ background: "white", borderRadius: 12, padding: "28px 24px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
                <div style={{ fontSize: 28, marginBottom: 14 }}>{item.icon}</div>
                <div style={{ fontWeight: 700, fontSize: 16, color: "#1a1614", marginBottom: 8 }}>{item.title}</div>
                <p style={{ color: "#6b7280", fontSize: 14, lineHeight: 1.65, margin: 0 }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Available slots */}
      {slots.length > 0 && (
        <section id="apply" style={{ padding: "80px 24px", background: "white" }}>
          <div style={{ maxWidth: 1000, margin: "0 auto" }}>
            <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 34, fontWeight: 400, color: "#1a1614", marginBottom: 16, textAlign: "center" }}>
              Current Opportunities
            </h2>
            <p style={{ color: "#7c7168", fontSize: 16, textAlign: "center", marginBottom: 56, maxWidth: 540, margin: "0 auto 56px" }}>
              Each slot is exclusive. Once filled, it's closed. Inquire early.
            </p>

            {Object.entries(byCategory).map(([cat, catSlots]) => (
              <div key={cat} style={{ marginBottom: 48 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
                  <span style={{ fontSize: 22 }}>{CAT_ICONS[cat] ?? "📦"}</span>
                  <h3 style={{ fontFamily: "var(--font-heading)", fontSize: 20, fontWeight: 400, color: "#1a1614", margin: 0 }}>
                    {CAT_LABELS[cat] ?? cat}
                  </h3>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
                  {catSlots.map((slot) => (
                    <div key={slot.id} style={{ background: "#f8f5f3", borderRadius: 12, padding: "24px", border: "1px solid #e5e0d8" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                        <div style={{ fontWeight: 700, fontSize: 16, color: "#1a1614", flex: 1 }}>{slot.title}</div>
                        {slot.isExclusive && (
                          <span style={{ fontSize: 10, fontWeight: 700, background: "#1a1614", color: "#f8f5f3", padding: "3px 8px", borderRadius: 999, textTransform: "uppercase", letterSpacing: "0.08em", flexShrink: 0 }}>
                            Exclusive
                          </span>
                        )}
                      </div>
                      {slot.series && (
                        <div style={{ fontSize: 12, color: "#c41e3a", fontWeight: 600, marginBottom: 8 }}>
                          {slot.series.title}
                        </div>
                      )}
                      {slot.description && (
                        <p style={{ fontSize: 14, color: "#6b7280", lineHeight: 1.6, margin: "0 0 16px" }}>
                          {slot.description}
                        </p>
                      )}
                      {slot.audienceProfile && (
                        <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 16 }}>
                          <span style={{ fontWeight: 600, color: "#6b7280" }}>Audience: </span>{slot.audienceProfile}
                        </div>
                      )}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                        {slot.askPriceCents ? (
                          <div style={{ fontSize: 18, fontWeight: 800, color: "#1a1614" }}>
                            From ${(slot.askPriceCents / 100).toLocaleString()}
                          </div>
                        ) : (
                          <div style={{ fontSize: 13, color: "#9ca3af" }}>Price on inquiry</div>
                        )}
                        <a
                          href={`/brand-partners/apply?slot=${slot.id}&slotTitle=${encodeURIComponent(slot.title)}`}
                          style={{ fontSize: 13, fontWeight: 700, color: "white", background: "#c41e3a", padding: "8px 20px", borderRadius: 8, textDecoration: "none", display: "inline-block" }}
                        >
                          Inquire →
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* CTA / Apply form link */}
      <section style={{ background: "#1a1614", color: "white", padding: "80px 24px", textAlign: "center" }}>
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 36, fontWeight: 400, margin: "0 0 16px", color: "white" }}>
            Don't see the right fit?
          </h2>
          <p style={{ color: "#c9bfb5", fontSize: 16, lineHeight: 1.7, margin: "0 0 32px" }}>
            We build custom partnership packages for brands that align with OKÜ's values. Reach out and we'll design something together.
          </p>
          <a href="/brand-partners/apply" style={{ display: "inline-block", background: "#c41e3a", color: "white", padding: "14px 36px", borderRadius: 10, fontWeight: 700, fontSize: 16, textDecoration: "none" }}>
            Submit a Brand Inquiry →
          </a>
        </div>
      </section>
    </div>
  );
}
