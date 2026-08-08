import Link from "next/link";
import { notFound } from "next/navigation";
import MenuBlock from "@/components/menu/MenuBlock";
import { getFoodMenuByVenueDb, getDrinksMenuByVenueDb } from "@/server/menus/menuService";

// ─── Restaurant Data ──────────────────────────────────────────────────────────

const RESTAURANTS = {
  oku: {
    name: "OKÜ",
    tagline: "Fine Dining · Gold House",
    heroLine1: "Intimate.",
    heroLine2: "Deliberate.",
    heroLine3: "27 covers.",
    logoHero: "/images/logo-oku-white-mark.png",
    logoLight: "/images/logo-oku-brand.png",
    logoDark: "/images/logo-oku-white-mark.png",
    logoNeedsWhiteBox: false,
    heroPhoto: "/images/oku/dsc08707.jpg",
    gallery: [
      { src: "/images/oku/dsc08708.jpg", alt: "OKÜ dining room — full view with ambient lighting", pos: "center 30%" },
      { src: "/images/oku/dsc08700.jpg", alt: "Intimate table set for two at OKÜ", pos: "center center" },
      { src: "/images/oku/dsc08697.jpg", alt: "Signature pendant lights against iridescent blue fish-scale wall", pos: "center 60%" },
      { src: "/images/oku/optimized/cocktail-floral-06.jpg", alt: "OKÜ Botanica cocktail — white foam coupe with edible violet, dehydrated citrus", pos: "center 25%" },
      { src: "/images/oku/dsc08712.jpg", alt: "Fresh tuna and salmon sashimi in OKÜ sushi display", pos: "center center" },
    ],
    sushiBarFeature: {
      heading: "The Sushi Counter",
      body: "At the heart of OKÜ sits an intimate sushi counter. Each day the chefs prepare fresh cuts from whole fish selected by our suppliers — tuna, salmon, octopus — displayed in the illuminated case for guests to see before they order.",
      photos: [
        { src: "/images/oku/dsc08709.jpg", alt: "OKÜ sushi bar counter with illuminated display case" },
        { src: "/images/oku/dsc08710.jpg", alt: "Octopus, tuna and nigiri in the OKÜ sushi display" },
      ],
    },
    about: [
      "Named after the group it anchors, OKÜ is a study in restraint. Crisp white linen, hand-blown glassware, and a kitchen that believes simplicity is the highest form of sophistication.",
      "The menu changes with the season — drawing from producers across the Mediterranean. Iberian cured meats, Sicilian citrus, Aegean olive oils — composed into tasting menus that feel inevitable rather than constructed.",
      "The dining room holds 27. The lighting is always exactly right.",
    ],
    address: "Gold House, Casco Viejo, Panama City",
    phone: "+507 6000 0001",
    email: "reservations@okugroup.com",
    hours: [
      { day: "Tuesday – Thursday", time: "7:00 pm – 11:00 pm" },
      { day: "Friday – Saturday", time: "7:00 pm – 11:30 pm" },
      { day: "Sunday", time: "7:00 pm – 10:30 pm" },
    ],
    accent: "#1a1614",
    accentLight: "#f5f2ef",
    accentMid: "rgba(26,22,20,0.85)",
    tag: "Fine Dining",
    dresscode: "Smart casual to formal",
    menu: [
      {
        category: "To Begin",
        items: [
          { name: "Burrata del Giorno", desc: "Heirloom tomato, basil oil, aged balsamic, grilled sourdough", price: "$18" },
          { name: "Seared Scallops", desc: "Pea purée, crispy pancetta, lemon foam, micro herbs", price: "$24" },
          { name: "Yellowfin Tataki", desc: "Sesame crust, ponzu, pickled daikon, avocado", price: "$22" },
          { name: "Charred Leek Velouté", desc: "Crème fraîche, hazelnut oil, chives", price: "$14" },
        ],
      },
      {
        category: "Mains",
        items: [
          { name: "Slow-Roasted Lamb Shoulder", desc: "Merguez spices, chickpea purée, harissa, preserved lemon yoghurt", price: "$48" },
          { name: "Pan-Seared Sea Bass", desc: "Bouillabaisse broth, fennel confit, saffron aïoli, Niçoise vegetables", price: "$44" },
          { name: "Tagliolini al Limone", desc: "House-made pasta, Amalfi lemon, 24-month Parmigiano, Calabrian chilli", price: "$32" },
          { name: "Duck Breast Rossini", desc: "Foie gras, Périgueux sauce, fig compote, potato gratin", price: "$52" },
        ],
      },
      {
        category: "To Finish",
        items: [
          { name: "Valrhona Chocolate Fondant", desc: "Tahini ice cream, caramelised hazelnut, sea salt", price: "$16" },
          { name: "Cheese Selection", desc: "Three artisan cheeses, membrillo, honeycomb, walnut bread", price: "$22" },
          { name: "Citrus Tart", desc: "Yuzu curd, Italian meringue, bergamot sorbet", price: "$14" },
        ],
      },
    ],
    others: [
      { slug: "catch", name: "CATCH", tag: "Caribbean Nightlife" },
      { slug: "terrace", name: "TERRACE", tag: "Open-Air Rooftop" },
    ],
  },

  catch: {
    name: "CATCH",
    tagline: "Caribbean Dining · Gold House",
    heroLine1: "The night",
    heroLine2: "starts here.",
    heroLine3: "",
    logoHero: "/images/logo-catch.webp",
    logoLight: "/images/logo-catch.webp",
    logoDark: "/images/logo-catch.webp",
    logoNeedsWhiteBox: false,
    about: [
      "CATCH was built for the hours after 9. For tables that linger, for rounds that become three, for the moment a dinner becomes a night.",
      "The menu is designed for sharing — Caribbean-inspired plates that arrive in waves, each one an excuse to stay a little longer. The DJ booth rotates every Thursday through Saturday with local and international talent.",
      "Rattan fixtures, exposed concrete, warm lighting. A space that's simultaneously casual and magnetic.",
    ],
    address: "Gold House, Casco Viejo, Panama City",
    phone: "+507 6000 0002",
    email: "catch@okugroup.com",
    hours: [
      { day: "Thursday", time: "8:00 pm – 1:00 am" },
      { day: "Friday – Saturday", time: "8:00 pm – 2:00 am" },
    ],
    accent: "#1e3a5f",
    accentLight: "#f0f4f8",
    accentMid: "rgba(30,58,95,0.88)",
    tag: "Nightlife Dining",
    dresscode: "Smart casual",
    menu: [
      {
        category: "Sharing Plates",
        items: [
          { name: "Jerk Chicken Skewers", desc: "Scotch bonnet glaze, mango chutney, lime crema, toasted sesame", price: "$18" },
          { name: "Coconut Shrimp", desc: "Spiced coconut batter, tamarind dip, pickled pineapple", price: "$20" },
          { name: "Tostones & Guacamole", desc: "Twice-fried plantain, chunky guacamole, chipotle mayo, pico de gallo", price: "$12" },
          { name: "Salt Fish Fritters", desc: "Cornmeal crust, scotch bonnet aioli, escabeche slaw", price: "$16" },
        ],
      },
      {
        category: "Main Plates",
        items: [
          { name: "Lobster Rice", desc: "Whole Caribbean lobster, saffron bomba rice, sofrito, crispy capers", price: "$54" },
          { name: "Oxtail Croquettes", desc: "Slow-braised oxtail, panko crust, aji amarillo emulsion, micro coriander", price: "$26" },
          { name: "Whole Mahi Mahi", desc: "Wood-fired, coconut broth, fried plantain, sofrito negro, lime", price: "$46" },
          { name: "Ropa Vieja Tacos", desc: "Hand-pulled beef, pickled red onion, queso fresco, salsa verde (3 pcs)", price: "$24" },
        ],
      },
      {
        category: "Cocktails",
        items: [
          { name: "CATCH Rum Punch", desc: "House blend rum, passion fruit, lime, Angostura, ginger beer", price: "$14" },
          { name: "Spiced Old Fashioned", desc: "Aged rum, cinnamon syrup, orange bitters, smoked cherry", price: "$16" },
          { name: "Coconut Paloma", desc: "Tequila, coconut water, fresh grapefruit, chilli salt rim", price: "$15" },
        ],
      },
    ],
    others: [
      { slug: "oku", name: "OKÜ", tag: "Fine Dining" },
      { slug: "terrace", name: "TERRACE", tag: "Open-Air Rooftop" },
    ],
  },

  terrace: {
    name: "TERRACE",
    tagline: "Rooftop Dining · Gold House",
    heroLine1: "The city",
    heroLine2: "at your feet.",
    heroLine3: "",
    logoHero: "/images/logo-terrace-cream.png",
    logoLight: "/images/logo-terrace-cream.png",
    logoDark: "/images/logo-terrace-green.png",
    logoNeedsWhiteBox: false,
    about: [
      "The Terrace sits on the roof of Gold House and opens every evening to the Panama sky. Hand-painted Moroccan tile runs underfoot. Wrought-iron lanterns line the perimeter. Bougainvillea climbs the south wall.",
      "The kitchen sends out Pan-American sharing plates — ceviches, anticuchos, wood-fired flatbreads — designed to be eaten slowly, over conversation, as the city transitions from day to night below.",
      "At 42 covers, it is our largest space, and also our most beloved.",
    ],
    address: "Gold House (Rooftop), Casco Viejo, Panama City",
    phone: "+507 6000 0003",
    email: "terrace@okugroup.com",
    hours: [
      { day: "Wednesday – Thursday", time: "6:00 pm – midnight" },
      { day: "Friday – Saturday", time: "6:00 pm – 1:00 am" },
      { day: "Sunday", time: "6:00 pm – 11:00 pm" },
    ],
    accent: "#2d4a1e",
    accentLight: "#f2f5f0",
    accentMid: "rgba(45,74,30,0.88)",
    tag: "Rooftop",
    dresscode: "Casual to smart casual",
    menu: [
      {
        category: "Ceviches & Cold",
        items: [
          { name: "Ceviche Clásico", desc: "Fresh corvina, leche de tigre, red onion, sweet potato, choclo", price: "$18" },
          { name: "Aguachile Negro", desc: "Prawn, charred jalapeño, cucumber, black sesame, avocado crema", price: "$20" },
          { name: "Tuna Causa", desc: "Yellow potato cake, yellowfin tuna, avocado, huancaína sauce", price: "$22" },
        ],
      },
      {
        category: "From the Grill",
        items: [
          { name: "Beef Anticuchos", desc: "Heart of palm skewers, chimichurri, roasted corn, huacatay oil", price: "$24" },
          { name: "Churrasco Platter", desc: "200g prime strip, chimichurri rojo, charred onion, patatas bravas", price: "$48" },
          { name: "Roasted Octopus", desc: "Romesco, smoked paprika oil, chickpea, preserved lemon, micro cress", price: "$36" },
          { name: "Flatbread del Terrace", desc: "Wood-fired, mozzarella, chorizo, roasted peppers, honey", price: "$20" },
        ],
      },
      {
        category: "Cocktails",
        items: [
          { name: "Pisco Sour", desc: "Barsol pisco, fresh lime, egg white, Angostura bitters", price: "$14" },
          { name: "Mezcal Negroni", desc: "Vida mezcal, Campari, sweet vermouth, orange", price: "$16" },
          { name: "Terrace Sunset", desc: "Rum, mango, passion fruit, lime, basil, sparkling wine", price: "$15" },
        ],
      },
    ],
    others: [
      { slug: "oku", name: "OKÜ", tag: "Fine Dining" },
      { slug: "catch", name: "CATCH", tag: "Caribbean Nightlife" },
    ],
  },
} as const;

type Slug = keyof typeof RESTAURANTS;

export async function generateStaticParams() {
  return (Object.keys(RESTAURANTS) as Slug[]).map(slug => ({ slug }));
}

export default async function RestaurantPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!(slug in RESTAURANTS)) notFound();
  const r = RESTAURANTS[slug as Slug];

  const foodMenu = (slug === "oku" || slug === "catch" || slug === "terrace")
    ? await getFoodMenuByVenueDb(slug as "oku" | "catch" | "terrace")
    : null;
  const drinksMenu = (slug === "oku" || slug === "catch" || slug === "terrace")
    ? await getDrinksMenuByVenueDb(slug as "oku" | "catch" | "terrace")
    : null;

  const sectionLabel: React.CSSProperties = {
    fontSize: 10, fontWeight: 700, letterSpacing: "0.2em",
    textTransform: "uppercase", color: "#7d7269", marginBottom: 24,
    display: "block",
  };

  return (
    <div style={{ background: "#faf8f6", minHeight: "100vh", fontFamily: "var(--font-sans)" }}>

      {/* ── HERO ─────────────────────────────────────────────────────────────── */}
      <div style={{ position: "relative", height: "100svh", minHeight: 600, background: r.accent, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Real photo background (OKÜ) */}
        {"heroPhoto" in r && r.heroPhoto && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={r.heroPhoto}
            alt={r.name}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 40%", zIndex: 0 }}
          />
        )}

        {/* Atmospheric overlay */}
        <div style={{ position: "absolute", inset: 0, background: "heroPhoto" in r && r.heroPhoto
          ? `linear-gradient(to bottom, rgba(10,8,6,0.55) 0%, rgba(10,8,6,0.3) 40%, rgba(10,8,6,0.72) 100%)`
          : `linear-gradient(135deg, ${r.accent} 0%, ${r.accent}cc 40%, transparent 100%)`,
          zIndex: 1 }} />
        {"heroPhoto" in r && r.heroPhoto ? null : (
          <div style={{ position: "absolute", inset: 0, opacity: 0.12, backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")", zIndex: 0 }} />
        )}

        {/* Back to group */}
        <div style={{ position: "relative", zIndex: 10, padding: "24px 48px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Link href="/restaurants" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "rgba(255,255,255,0.5)", fontSize: 12, letterSpacing: "0.1em", fontWeight: 600, textTransform: "uppercase" }}>
            <span style={{ fontSize: 16 }}>←</span> OKÜ Hospitality Group
          </Link>
          <Link href={`/reservations?concept=${slug}`} style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)", color: "#fff", borderRadius: 8, padding: "9px 20px", fontSize: 12, fontWeight: 700, textDecoration: "none", letterSpacing: "0.06em" }}>
            Reserve
          </Link>
        </div>

        {/* Hero content */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "40px 48px 72px", position: "relative", zIndex: 10 }}>

          {/* Logo — top centre */}
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", flex: 1 }}>
            {r.logoNeedsWhiteBox ? (
              <div style={{ background: "#fff", borderRadius: 16, padding: "20px 32px", display: "inline-flex", alignItems: "center", justifyContent: "center", boxShadow: "0 8px 40px rgba(0,0,0,0.3)" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.logoHero} alt={r.name} style={{ height: 80, width: "auto", objectFit: "contain" }} />
              </div>
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={r.logoHero} alt={r.name} style={{ height: 120, width: "auto", objectFit: "contain", filter: "drop-shadow(0 4px 24px rgba(0,0,0,0.5))" }} />
            )}
          </div>

          {/* Emotive headline — bottom left */}
          <div>
            <div style={{ fontSize: 10, letterSpacing: "0.22em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)", marginBottom: 20 }}>
              {r.tagline}
            </div>
            <div style={{ fontFamily: "var(--font-heading)", color: "#fff", lineHeight: 0.92, letterSpacing: "-0.04em" }}>
              <div style={{ fontSize: "clamp(40px, 7vw, 88px)" }}>{r.heroLine1}</div>
              {r.heroLine2 && <div style={{ fontSize: "clamp(40px, 7vw, 88px)" }}>{r.heroLine2}</div>}
              {r.heroLine3 && <div style={{ fontSize: "clamp(24px, 4vw, 48px)", opacity: 0.55, marginTop: 8 }}>{r.heroLine3}</div>}
            </div>
          </div>

          {/* Scroll indicator */}
          <div style={{ position: "absolute", right: 48, bottom: 72, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <div style={{ width: 1, height: 60, background: "rgba(255,255,255,0.2)" }} />
            <div style={{ fontSize: 9, letterSpacing: "0.15em", textTransform: "uppercase", color: "rgba(255,255,255,0.3)", writingMode: "vertical-rl" }}>Scroll</div>
          </div>
        </div>
      </div>

      {/* ── ABOUT ────────────────────────────────────────────────────────────── */}
      <div style={{ background: "#fff", padding: "96px 48px" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto", display: "grid", gridTemplateColumns: "200px 1fr", gap: "0 80px", alignItems: "start" }}>
          <div>
            <span style={sectionLabel}>About</span>
            {r.logoNeedsWhiteBox ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={r.logoDark} alt={r.name} style={{ width: "100%", maxWidth: 160, height: "auto", objectFit: "contain", marginBottom: 8 }} />
            ) : (
              <div style={{ background: r.accent, borderRadius: 12, padding: "16px", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 8 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.logoLight} alt={r.name} style={{ height: 64, width: "auto", objectFit: "contain" }} />
              </div>
            )}
            <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                { label: "Cuisine", value: slug === "oku" ? "Modern Mediterranean" : slug === "catch" ? "Caribbean sharing plates" : "Pan-American sharing plates" },
                { label: "Covers", value: slug === "oku" ? "27 seats" : slug === "catch" ? "24 seats" : "42 seats" },
                { label: "Hours", value: r.hours[0].time },
                { label: "Dress", value: r.dresscode },
              ].map(item => (
                <div key={item.label}>
                  <div style={{ fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "#7d7269", marginBottom: 2 }}>{item.label}</div>
                  <div style={{ fontSize: 12, color: "#1f1a17", fontWeight: 500 }}>{item.value}</div>
                </div>
              ))}
            </div>
          </div>
          <div>
            {r.about.map((para, i) => (
              <p key={i} style={{ fontSize: i === 0 ? 20 : 15, lineHeight: i === 0 ? 1.65 : 1.8, color: i === 0 ? "#1f1a17" : "#4a3f39", marginBottom: 24, marginTop: 0, fontWeight: i === 0 ? 400 : 300 }}>
                {para}
              </p>
            ))}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 8, alignItems: "center" }}>
              <Link href={`/reservations?concept=${slug}`} style={{ display: "inline-flex", alignItems: "center", gap: 10, background: r.accent, color: "#fff", borderRadius: 10, padding: "13px 24px", fontSize: 13, fontWeight: 700, textDecoration: "none", letterSpacing: "0.02em" }}>
                Reserve a Table →
              </Link>
              <a href="#menu" style={{ display: "inline-flex", alignItems: "center", gap: 10, background: "#1f1a17", color: "#fff", borderRadius: 10, padding: "13px 24px", fontSize: 13, fontWeight: 700, textDecoration: "none", letterSpacing: "0.02em" }}>
                Menu
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* ── ATMOSPHERE / GALLERY ─────────────────────────────────────────────── */}
      <div style={{ background: r.accentLight, padding: "0" }}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gridTemplateRows: "300px 300px", gap: 3 }}>
          {(() => {
            const cells = [
              { row: "1 / 3", col: "1 / 2" },
              { row: "1 / 2", col: "2 / 3" },
              { row: "1 / 2", col: "3 / 4" },
              { row: "2 / 3", col: "2 / 3" },
              { row: "2 / 3", col: "3 / 4" },
            ];
            const hasGallery = "gallery" in r && Array.isArray(r.gallery) && r.gallery.length > 0;
            return cells.map((cell, i) => {
              const photo = hasGallery ? (r as { gallery: { src: string; alt: string }[] }).gallery[i] : null;
              return (
                <div key={i} style={{ gridRow: cell.row, gridColumn: cell.col, background: r.accent, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden" }}>
                  {photo ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={photo.src}
                      alt={photo.alt}
                      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: (photo as { pos?: string }).pos ?? "center" }}
                    />
                  ) : (
                    <>
                      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(circle at ${i % 2 === 0 ? "30% 70%" : "70% 30%"}, ${r.accent}88, ${r.accent})` }} />
                      <div style={{ position: "relative", zIndex: 1, fontFamily: "var(--font-heading)", fontSize: i === 0 ? 64 : 32, color: "rgba(255,255,255,0.08)", letterSpacing: "-0.04em" }}>
                        {r.name}
                      </div>
                    </>
                  )}
                </div>
              );
            });
          })()}
        </div>
        <div style={{ padding: "28px 48px", background: r.accent }}>
          <div style={{ maxWidth: 1000, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
              {r.name} · Gold House · Casco Viejo
            </span>
            {"gallery" in r && r.gallery ? (
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", fontStyle: "italic" }}>
                Photography © OKÜ Hospitality Group
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {/* ── SUSHI BAR FEATURE (OKÜ only) ─────────────────────────────────────── */}
      {"sushiBarFeature" in r && r.sushiBarFeature && (() => {
        const feature = r.sushiBarFeature as {
          heading: string;
          body: string;
          photos: { src: string; alt: string }[];
        };
        return (
          <div style={{ background: "#0e0c0a", padding: "96px 48px" }}>
            <div style={{ maxWidth: 1000, margin: "0 auto" }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(255,255,255,0.25)", marginBottom: 24, display: "block" }}>
                The Kitchen
              </span>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "48px 64px", alignItems: "center" }}>
                <div>
                  <div style={{ fontFamily: "var(--font-heading)", fontSize: "clamp(28px, 4vw, 44px)", color: "#fff", letterSpacing: "-0.03em", lineHeight: 1.1, marginBottom: 24 }}>
                    {feature.heading}
                  </div>
                  <p style={{ fontSize: 15, color: "rgba(255,255,255,0.5)", lineHeight: 1.8, margin: 0 }}>
                    {feature.body}
                  </p>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  {feature.photos.map((photo, i) => (
                    <div key={i} style={{ aspectRatio: "3/4", overflow: "hidden", borderRadius: 8, position: "relative" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photo.src}
                        alt={photo.alt}
                        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center" }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── SIGNATURE COCKTAILS (OKÜ only) ──────────────────────────────────── */}
      {slug === "oku" && (
        <div style={{ background: "#09070a", padding: "96px 48px" }}>
          <div style={{ maxWidth: 1200, margin: "0 auto" }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(255,255,255,0.25)", marginBottom: 24, display: "block" }}>
              At the Bar
            </span>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "48px 80px", alignItems: "start" }}>
              <div>
                <div style={{ fontFamily: "var(--font-heading)", fontSize: "clamp(28px, 4vw, 44px)", color: "#fff", letterSpacing: "-0.03em", lineHeight: 1.1, marginBottom: 24 }}>
                  Crafted<br />with intention.
                </div>
                <p style={{ fontSize: 15, color: "rgba(255,255,255,0.5)", lineHeight: 1.8, margin: "0 0 40px" }}>
                  Each cocktail on the OKÜ list is a small thesis — built around a single idea. A Japanese umami element expressed through sesame and yuzu. A botanical study in foam and edible flowers. A spirit-forward evening drink that reveals itself slowly over ice.
                </p>
                <div style={{ aspectRatio: "16/9", overflow: "hidden", borderRadius: 8, position: "relative" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/images/oku/optimized/cocktail-rocks-overhead.jpg"
                    alt="Overhead view of OKÜ signature rocks cocktail — sphere ice, citrus peel, dark amber spirit"
                    style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center" }}
                  />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                <div style={{ aspectRatio: "2/3", overflow: "hidden", borderRadius: 8, position: "relative" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/images/oku/optimized/cocktail-floral-06.jpg"
                    alt="OKÜ Botanica — white foam coupe with edible violet and dehydrated citrus"
                    style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 20%" }}
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ flex: 1, overflow: "hidden", borderRadius: 8, position: "relative" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/images/oku/optimized/cocktail-coupe-01.jpg"
                      alt="OKÜ spirit-forward coupe — golden amber with lemon twist on marble coaster"
                      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 30%" }}
                    />
                  </div>
                  <div style={{ flex: 1, overflow: "hidden", borderRadius: 8, position: "relative" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/images/oku/optimized/cocktail-green-02.jpg"
                      alt="OKÜ Midori Sésame — green yuzu coupe with black sesame and fresh mint"
                      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 25%" }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── THE SPACE (OKÜ only) ─────────────────────────────────────────────── */}
      {slug === "oku" && (
        <div style={{ background: "#0a0908" }}>
          <div style={{ position: "relative", height: 520, overflow: "hidden" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/oku/optimized/interior-sushi-bar-04.jpg"
              alt="OKÜ full dining room — sushi counter left, koi wall centre, fish-scale wall right"
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 35%" }}
            />
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(10,9,8,0.2) 0%, rgba(10,9,8,0.08) 35%, rgba(10,9,8,0.88) 100%)" }} />
            <div style={{ position: "absolute", bottom: 48, left: 48, right: 48 }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(255,255,255,0.3)", marginBottom: 16, display: "block" }}>
                The Space
              </span>
              <div style={{ fontFamily: "var(--font-heading)", fontSize: "clamp(32px, 5vw, 56px)", color: "#fff", letterSpacing: "-0.03em", lineHeight: 1.05 }}>
                Three walls.<br />One story.
              </div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 3 }}>
            {[
              { src: "/images/oku/optimized/interior-koi-wall-03.jpg", alt: "The koi wall — amber glass-block panel with hand-painted koi fish, illuminated from behind", pos: "center 40%" },
              { src: "/images/oku/optimized/interior-sushi-bar-01.jpg", alt: "OKÜ sushi counter with fresh catch display, koi wall backdrop", pos: "center 30%" },
              { src: "/images/oku/optimized/interior-sushi-bar-03.jpg", alt: "OKÜ full dining room — sushi bar left, koi wall centre, fish-scale wall right", pos: "center 25%" },
            ].map((photo, i) => (
              <div key={i} style={{ aspectRatio: "3/4", position: "relative", overflow: "hidden" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.src}
                  alt={photo.alt}
                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: photo.pos }}
                />
              </div>
            ))}
          </div>
          <div style={{ padding: "20px 48px 28px", background: "#0a0908" }}>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.2)", margin: 0, fontStyle: "italic", maxWidth: 700 }}>
              The marble sushi counter. The hand-painted koi wall in amber glass block. The iridescent fish-scale tile that defines OKÜ. Three signature elements — one unmistakable room.
            </p>
          </div>
        </div>
      )}

      {/* ── MENU ─────────────────────────────────────────────────────────────── */}
      <div id="menu" style={{ background: "#faf8f6", padding: "96px 48px", scrollMarginTop: 80 }}>
        <div style={{ maxWidth: 1000, margin: "0 auto" }}>
          <span style={sectionLabel}>Our Menu</span>

          {(slug === "oku" || slug === "catch") ? (
            <>
              {foodMenu && <MenuBlock menu={foodMenu} accent={r.accent} accentLight={r.accentLight} />}
              {drinksMenu && <MenuBlock menu={drinksMenu} accent={r.accent} accentLight={r.accentLight} />}
            </>
          ) : (
            <>
              <div style={{ fontFamily: "var(--font-heading)", fontSize: "clamp(32px, 5vw, 52px)", color: "#1f1a17", letterSpacing: "-0.03em", marginBottom: 56 }}>
                Seasonal selections
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 48 }}>
                {r.menu.map(section => (
                  <div key={section.category}>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: r.accent, marginBottom: 24, paddingBottom: 12, borderBottom: `1px solid ${r.accent}22` }}>
                      {section.category}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                      {section.items.map(item => (
                        <div key={item.name}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5 }}>
                            <div style={{ fontWeight: 600, fontSize: 14, color: "#1f1a17" }}>{item.name}</div>
                            <div style={{ fontSize: 13, color: "#7d7269", fontWeight: 500, flexShrink: 0, marginLeft: 16 }}>{item.price}</div>
                          </div>
                          <div style={{ fontSize: 12, color: "#7d7269", lineHeight: 1.5 }}>{item.desc}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 48, padding: "20px 24px", background: "#fff", border: "1px solid #e8e2dd", borderRadius: 12, fontSize: 12, color: "#7d7269", fontStyle: "italic" }}>
                Menu items are seasonal and subject to change. Dietary requirements can be accommodated — please inform your host at the time of booking.
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── RESERVE ──────────────────────────────────────────────────────────── */}
      <div style={{ background: r.accent, padding: "96px 48px" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 60, alignItems: "center" }}>
          <div>
            <span style={{ ...sectionLabel, color: "rgba(255,255,255,0.4)" }}>Book a Table</span>
            <div style={{ fontFamily: "var(--font-heading)", fontSize: "clamp(36px, 5vw, 56px)", color: "#fff", letterSpacing: "-0.03em", lineHeight: 1.05, marginBottom: 24 }}>
              Join us at {r.name}
            </div>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.55)", lineHeight: 1.7, margin: "0 0 36px" }}>
              Reservations are recommended and can be made online. Walk-ins are welcome subject to availability.
            </p>
            <Link href={`/reservations?concept=${slug}`} style={{ display: "inline-block", background: "#fff", color: r.accent, borderRadius: 12, padding: "15px 32px", fontSize: 14, fontWeight: 800, textDecoration: "none", letterSpacing: "0.02em" }}>
              Reserve a Table →
            </Link>
          </div>

          <div>
            <div style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 16, padding: "32px 36px" }}>
              <div style={{ fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(255,255,255,0.35)", marginBottom: 20 }}>Contact & Hours</div>
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 13, color: "#fff", fontWeight: 500, marginBottom: 4 }}>{r.address}</div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginBottom: 2 }}>{r.phone}</div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>{r.email}</div>
              </div>
              <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 20 }}>
                <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.35)", marginBottom: 14 }}>Opening Hours</div>
                {r.hours.map(h => (
                  <div key={h.day} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "rgba(255,255,255,0.6)", marginBottom: 8 }}>
                    <span>{h.day}</span>
                    <span style={{ color: "rgba(255,255,255,0.9)", fontWeight: 500 }}>{h.time}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── OTHER RESTAURANTS ────────────────────────────────────────────────── */}
      <div style={{ background: "#1a1614", padding: "64px 48px" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto" }}>
          <div style={{ fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(255,255,255,0.3)", marginBottom: 32 }}>
            Visit Our Other Establishments
          </div>
          <div style={{ display: "flex", gap: 16 }}>
            {r.others.map(other => (
              <Link key={other.slug} href={`/restaurants/${other.slug}`} style={{ flex: 1, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "24px 28px", textDecoration: "none", display: "flex", justifyContent: "space-between", alignItems: "center", transition: "background 0.15s" }}>
                <div>
                  <div style={{ fontFamily: "var(--font-heading)", fontSize: 28, color: "#fff", letterSpacing: "-0.03em", lineHeight: 1, marginBottom: 6 }}>{other.name}</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.1em" }}>{other.tag}</div>
                </div>
                <span style={{ fontSize: 20, color: "rgba(255,255,255,0.25)" }}>→</span>
              </Link>
            ))}
            <Link href="/restaurants" style={{ flex: 1, border: "1px dashed rgba(255,255,255,0.15)", borderRadius: 12, padding: "24px 28px", textDecoration: "none", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", fontWeight: 600, marginBottom: 4 }}>All Restaurants</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", textTransform: "uppercase", letterSpacing: "0.1em" }}>OKÜ Hospitality Group</div>
              </div>
              <span style={{ fontSize: 20, color: "rgba(255,255,255,0.2)" }}>↗</span>
            </Link>
          </div>
        </div>
      </div>

    </div>
  );
}
