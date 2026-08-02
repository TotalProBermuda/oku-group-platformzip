import Link from "next/link";
import { notFound } from "next/navigation";
import MenuView from "@/components/menu/MenuView";
import { getFoodMenuByVenueDb, getDrinksMenuByVenueDb } from "@/server/menus/menuService";
import { getTranslations } from "@/i18n/getTranslations";
import { isValidLocale } from "@/i18n/config";
import { localePath } from "@/i18n/utils";
import type { Locale } from "@/types/i18n";
import type { Metadata } from "next";
import { SUPPORTED_LOCALES } from "@/types/i18n";

const VALID_SLUGS = ["oku", "catch", "terrace"] as const;
type SlugType = (typeof VALID_SLUGS)[number];

const STATIC_DATA: Record<SlugType, {
  logoHero: string; logoLight: string; logoDark: string; logoNeedsWhiteBox: boolean;
  heroPhoto?: string;
  gallery?: { src: string; alt: string; pos: string }[];
  sushiBarPhotos?: { src: string; alt: string }[];
  accent: string; accentLight: string; accentMid: string;
  phone: string; email: string; address: string;
  hours: { day: string; time: string }[];
  others: { slug: string; name: string; tagKey: string }[];
  menu: { category: string; items: { name: string; desc: string; price: string }[] }[];
}> = {
  oku: {
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
    sushiBarPhotos: [
      { src: "/images/oku/dsc08709.jpg", alt: "OKÜ sushi bar counter with illuminated display case" },
      { src: "/images/oku/dsc08710.jpg", alt: "Octopus, tuna and nigiri in the OKÜ sushi display" },
    ],
    accent: "#1a1614", accentLight: "#f5f2ef", accentMid: "rgba(26,22,20,0.85)",
    phone: "+507 6000 0001", email: "reservations@okugroup.com",
    address: "Gold House, Casco Viejo, Panama City",
    hours: [
      { day: "Tuesday – Thursday", time: "7:00 pm – 11:00 pm" },
      { day: "Friday – Saturday", time: "7:00 pm – 11:30 pm" },
      { day: "Sunday", time: "7:00 pm – 10:30 pm" },
    ],
    others: [
      { slug: "catch",   name: "CATCH",   tagKey: "catch.tag" },
      { slug: "terrace", name: "TERRACE", tagKey: "terrace.tag" },
    ],
    menu: [
      { category: "To Begin", items: [
        { name: "Burrata del Giorno",  desc: "Heirloom tomato, basil oil, aged balsamic, grilled sourdough", price: "$18" },
        { name: "Seared Scallops",     desc: "Pea purée, crispy pancetta, lemon foam, micro herbs",          price: "$24" },
        { name: "Yellowfin Tataki",    desc: "Sesame crust, ponzu, pickled daikon, avocado",                 price: "$22" },
        { name: "Charred Leek Velouté",desc: "Crème fraîche, hazelnut oil, chives",                          price: "$14" },
      ]},
      { category: "Mains", items: [
        { name: "Slow-Roasted Lamb Shoulder", desc: "Merguez spices, chickpea purée, harissa, preserved lemon yoghurt", price: "$48" },
        { name: "Pan-Seared Sea Bass",        desc: "Bouillabaisse broth, fennel confit, saffron aïoli, Niçoise vegetables", price: "$44" },
        { name: "Tagliolini al Limone",       desc: "House-made pasta, Amalfi lemon, 24-month Parmigiano, Calabrian chilli", price: "$32" },
        { name: "Duck Breast Rossini",        desc: "Foie gras, Périgueux sauce, fig compote, potato gratin", price: "$52" },
      ]},
      { category: "To Finish", items: [
        { name: "Valrhona Chocolate Fondant", desc: "Tahini ice cream, caramelised hazelnut, sea salt", price: "$16" },
        { name: "Cheese Selection",           desc: "Three artisan cheeses, membrillo, honeycomb, walnut bread", price: "$22" },
        { name: "Citrus Tart",                desc: "Yuzu curd, Italian meringue, bergamot sorbet", price: "$14" },
      ]},
    ],
  },
  catch: {
    logoHero: "/images/logo-catch.webp",
    logoLight: "/images/logo-catch.webp",
    logoDark: "/images/logo-catch.webp",
    logoNeedsWhiteBox: false,
    accent: "#1e3a5f", accentLight: "#f0f4f8", accentMid: "rgba(30,58,95,0.88)",
    phone: "+507 6000 0002", email: "catch@okugroup.com",
    address: "Gold House, Casco Viejo, Panama City",
    hours: [
      { day: "Thursday",         time: "8:00 pm – 1:00 am" },
      { day: "Friday – Saturday",time: "8:00 pm – 2:00 am" },
    ],
    others: [
      { slug: "oku",     name: "OKÜ",     tagKey: "oku.tag" },
      { slug: "terrace", name: "TERRACE", tagKey: "terrace.tag" },
    ],
    menu: [
      { category: "Sharing Plates", items: [
        { name: "Jerk Chicken Skewers", desc: "Scotch bonnet glaze, mango chutney, lime crema, toasted sesame", price: "$18" },
        { name: "Coconut Shrimp",       desc: "Spiced coconut batter, tamarind dip, pickled pineapple", price: "$20" },
        { name: "Tostones & Guacamole", desc: "Twice-fried plantain, chunky guacamole, chipotle mayo, pico de gallo", price: "$12" },
        { name: "Salt Fish Fritters",   desc: "Cornmeal crust, scotch bonnet aioli, escabeche slaw", price: "$16" },
      ]},
      { category: "Main Plates", items: [
        { name: "Lobster Rice",      desc: "Whole Caribbean lobster, saffron bomba rice, sofrito, crispy capers", price: "$54" },
        { name: "Oxtail Croquettes",desc: "Slow-braised oxtail, panko crust, aji amarillo emulsion, micro coriander", price: "$26" },
        { name: "Whole Mahi Mahi",  desc: "Wood-fired, coconut broth, fried plantain, sofrito negro, lime", price: "$46" },
        { name: "Ropa Vieja Tacos", desc: "Hand-pulled beef, pickled red onion, queso fresco, salsa verde (3 pcs)", price: "$24" },
      ]},
      { category: "Cocktails", items: [
        { name: "CATCH Rum Punch",     desc: "House blend rum, passion fruit, lime, Angostura, ginger beer", price: "$14" },
        { name: "Spiced Old Fashioned",desc: "Aged rum, cinnamon syrup, orange bitters, smoked cherry", price: "$16" },
        { name: "Coconut Paloma",      desc: "Tequila, coconut water, fresh grapefruit, chilli salt rim", price: "$15" },
      ]},
    ],
  },
  terrace: {
    logoHero: "/images/logo-terrace-cream.png",
    logoLight: "/images/logo-terrace-cream.png",
    logoDark: "/images/logo-terrace-green.png",
    logoNeedsWhiteBox: false,
    accent: "#2d4a1e", accentLight: "#f2f5f0", accentMid: "rgba(45,74,30,0.88)",
    phone: "+507 6000 0003", email: "terrace@okugroup.com",
    address: "Gold House (Rooftop), Casco Viejo, Panama City",
    hours: [
      { day: "Wednesday – Thursday", time: "6:00 pm – midnight" },
      { day: "Friday – Saturday",    time: "6:00 pm – 1:00 am" },
      { day: "Sunday",               time: "6:00 pm – 11:00 pm" },
    ],
    others: [
      { slug: "oku",   name: "OKÜ",   tagKey: "oku.tag" },
      { slug: "catch", name: "CATCH", tagKey: "catch.tag" },
    ],
    menu: [
      { category: "Ceviches & Cold", items: [
        { name: "Ceviche Clásico", desc: "Fresh corvina, leche de tigre, red onion, sweet potato, choclo", price: "$18" },
        { name: "Aguachile Negro", desc: "Prawn, charred jalapeño, cucumber, black sesame, avocado crema", price: "$20" },
        { name: "Tuna Causa",      desc: "Yellow potato cake, yellowfin tuna, avocado, huancaína sauce", price: "$22" },
      ]},
      { category: "From the Grill", items: [
        { name: "Beef Anticuchos",     desc: "Heart of palm skewers, chimichurri, roasted corn, huacatay oil", price: "$24" },
        { name: "Churrasco Platter",   desc: "200g prime strip, chimichurri rojo, charred onion, patatas bravas", price: "$48" },
        { name: "Roasted Octopus",     desc: "Romesco, smoked paprika oil, chickpea, preserved lemon, micro cress", price: "$36" },
        { name: "Flatbread del Terrace",desc: "Wood-fired, mozzarella, chorizo, roasted peppers, honey", price: "$20" },
      ]},
      { category: "Cocktails", items: [
        { name: "Pisco Sour",      desc: "Barsol pisco, fresh lime, egg white, Angostura bitters", price: "$14" },
        { name: "Mezcal Negroni",  desc: "Vida mezcal, Campari, sweet vermouth, orange", price: "$16" },
        { name: "Terrace Sunset",  desc: "Rum, mango, passion fruit, lime, basil, sparkling wine", price: "$15" },
      ]},
    ],
  },
};

const STATIC_MENU_CATEGORY_LABELS: Record<string, Record<Locale, string>> = {
  "To Begin":       { en: "To Begin",       es: "Para Comenzar",    pt: "Para Começar"      },
  "Mains":          { en: "Mains",          es: "Principales",      pt: "Pratos Principais" },
  "To Finish":      { en: "To Finish",      es: "Para Terminar",    pt: "Para Finalizar"    },
  "Sharing Plates": { en: "Sharing Plates", es: "Para Compartir",   pt: "Pratos para Compartir" },
  "Main Plates":    { en: "Main Plates",    es: "Platos Principales", pt: "Pratos Principais"},
  "Cocktails":      { en: "Cocktails",      es: "Cócteles",         pt: "Coquetéis"         },
  "Ceviches & Cold":{ en: "Ceviches & Cold",es: "Ceviches y Frío",  pt: "Ceviches e Frios"  },
  "From the Grill": { en: "From the Grill", es: "De la Parrilla",   pt: "Da Grelha"         },
};

export async function generateStaticParams() {
  return SUPPORTED_LOCALES.flatMap((locale) =>
    VALID_SLUGS.map((slug) => ({ locale, slug }))
  );
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await params;
  const safeLocale = isValidLocale(locale) ? locale as Locale : "en";
  const t = await getTranslations(safeLocale, ["seo"]);
  const seo = t.seo as Record<string, string>;
  const key = `${slug}Title`;
  return {
    title: seo[key] || seo.restaurantsTitle,
    description: seo[`${slug}Description`] || seo.restaurantsDescription,
  };
}

export default async function LocaleRestaurantSlugPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  if (!VALID_SLUGS.includes(slug as SlugType)) notFound();
  const safeSlug = slug as SlugType;
  const safeLocale = isValidLocale(locale) ? locale as Locale : "en";

  const [t] = await Promise.all([
    getTranslations(safeLocale, ["venues", "common"]),
  ]);

  const v = t.venues as Record<string, unknown>;
  const common = t.common as Record<string, string>;
  const vd = (v[safeSlug] as Record<string, unknown>) || {};
  const sd = STATIC_DATA[safeSlug];

  const foodMenu = await getFoodMenuByVenueDb(safeSlug);
  const drinksMenu = await getDrinksMenuByVenueDb(safeSlug);

  const sectionLabel: React.CSSProperties = {
    fontSize: 10, fontWeight: 700, letterSpacing: "0.2em",
    textTransform: "uppercase", color: "#7d7269", marginBottom: 24,
    display: "block",
  };

  const heroLine1 = vd.heroLine1 as string || "";
  const heroLine2 = vd.heroLine2 as string || "";
  const heroLine3 = vd.heroLine3 as string || "";
  const tagline = vd.tagline as string || "";
  const aboutParas = (vd.about as string[]) || [];

  return (
    <div style={{ background: "#faf8f6", minHeight: "100vh", fontFamily: "var(--font-sans)" }}>

      {/* ── HERO ─────────────────────────────────────────────────────────────── */}
      <div style={{ position: "relative", height: "100svh", minHeight: 600, background: sd.accent, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {sd.heroPhoto && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={sd.heroPhoto} alt={vd.name as string || safeSlug} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 40%", zIndex: 0 }} />
        )}
        <div style={{ position: "absolute", inset: 0, background: sd.heroPhoto
          ? "linear-gradient(to bottom, rgba(10,8,6,0.55) 0%, rgba(10,8,6,0.3) 40%, rgba(10,8,6,0.72) 100%)"
          : `linear-gradient(135deg, ${sd.accent} 0%, ${sd.accent}cc 40%, transparent 100%)`,
          zIndex: 1 }} />

        <div style={{ position: "relative", zIndex: 10, padding: "24px 48px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Link href={localePath(safeLocale, "/restaurants")} style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "rgba(255,255,255,0.5)", fontSize: 12, letterSpacing: "0.1em", fontWeight: 600, textTransform: "uppercase" }}>
            <span style={{ fontSize: 16 }}>←</span> {v.backToGroup as string || "OKÜ Hospitality Group"}
          </Link>
          <Link href={localePath(safeLocale, `/reservations?concept=${safeSlug}`)} style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)", color: "#fff", borderRadius: 8, padding: "9px 20px", fontSize: 12, fontWeight: 700, textDecoration: "none", letterSpacing: "0.06em" }}>
            {v.scroll as string || "Reserve"}
          </Link>
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "40px 48px 72px", position: "relative", zIndex: 10 }}>
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", flex: 1 }}>
            {sd.logoNeedsWhiteBox ? (
              <div style={{ background: "#fff", borderRadius: 16, padding: "20px 32px", display: "inline-flex", alignItems: "center", justifyContent: "center", boxShadow: "0 8px 40px rgba(0,0,0,0.3)" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={sd.logoHero} alt={safeSlug} style={{ height: 80, width: "auto", objectFit: "contain" }} />
              </div>
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={sd.logoHero} alt={safeSlug} style={{ height: 120, width: "auto", objectFit: "contain", filter: "drop-shadow(0 4px 24px rgba(0,0,0,0.5))" }} />
            )}
          </div>
          <div>
            <div style={{ fontSize: 10, letterSpacing: "0.22em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)", marginBottom: 20 }}>{tagline}</div>
            <div style={{ fontFamily: "var(--font-heading)", color: "#fff", lineHeight: 0.92, letterSpacing: "-0.04em" }}>
              <div style={{ fontSize: "clamp(40px, 7vw, 88px)" }}>{heroLine1}</div>
              {heroLine2 && <div style={{ fontSize: "clamp(40px, 7vw, 88px)" }}>{heroLine2}</div>}
              {heroLine3 && <div style={{ fontSize: "clamp(24px, 4vw, 48px)", opacity: 0.55, marginTop: 8 }}>{heroLine3}</div>}
            </div>
          </div>
          <div style={{ position: "absolute", right: 48, bottom: 72, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <div style={{ width: 1, height: 60, background: "rgba(255,255,255,0.2)" }} />
            <div style={{ fontSize: 9, letterSpacing: "0.15em", textTransform: "uppercase", color: "rgba(255,255,255,0.3)", writingMode: "vertical-rl" }}>
              {v.scroll as string || "Scroll"}
            </div>
          </div>
        </div>
      </div>

      {/* ── ABOUT ────────────────────────────────────────────────────────────── */}
      <div style={{ background: "#fff", padding: "96px 48px" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto", display: "grid", gridTemplateColumns: "200px 1fr", gap: "0 80px", alignItems: "start" }}>
          <div>
            <span style={sectionLabel}>{v.about as string}</span>
            <div style={{ background: sd.accent, borderRadius: 12, padding: "16px", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 8 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={sd.logoLight} alt={safeSlug} style={{ height: 64, width: "auto", objectFit: "contain" }} />
            </div>
            <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                { label: v.cuisine as string,  value: vd.cuisine as string },
                { label: v.covers as string,   value: `${safeSlug === "oku" ? 27 : safeSlug === "catch" ? 24 : 42} ${v.seats as string}` },
                { label: v.hours as string,    value: sd.hours[0].time },
                { label: v.dress as string,    value: vd.dresscode as string },
              ].map(item => (
                <div key={item.label}>
                  <div style={{ fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "#7d7269", marginBottom: 2 }}>{item.label}</div>
                  <div style={{ fontSize: 12, color: "#1f1a17", fontWeight: 500 }}>{item.value}</div>
                </div>
              ))}
            </div>
          </div>
          <div>
            {aboutParas.map((para, i) => (
              <p key={i} style={{ fontSize: i === 0 ? 20 : 15, lineHeight: i === 0 ? 1.65 : 1.8, color: i === 0 ? "#1f1a17" : "#4a3f39", marginBottom: 24, marginTop: 0, fontWeight: i === 0 ? 400 : 300 }}>
                {para}
              </p>
            ))}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 8, alignItems: "center" }}>
              <Link href={localePath(safeLocale, `/reservations?concept=${safeSlug}`)} style={{ display: "inline-flex", alignItems: "center", gap: 10, background: sd.accent, color: "#fff", borderRadius: 10, padding: "13px 24px", fontSize: 13, fontWeight: 700, textDecoration: "none", letterSpacing: "0.02em" }}>
                {v.reserveArrow as string}
              </Link>
              <a href="#menu" style={{ display: "inline-flex", alignItems: "center", gap: 10, background: "#1f1a17", color: "#fff", borderRadius: 10, padding: "13px 24px", fontSize: 13, fontWeight: 700, textDecoration: "none", letterSpacing: "0.02em" }}>
                {v.theMenu as string}
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* ── GALLERY ──────────────────────────────────────────────────────────── */}
      <div style={{ background: sd.accentLight, padding: "0" }}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gridTemplateRows: "300px 300px", gap: 3 }}>
          {(() => {
            const cells = [
              { row: "1 / 3", col: "1 / 2" }, { row: "1 / 2", col: "2 / 3" },
              { row: "1 / 2", col: "3 / 4" }, { row: "2 / 3", col: "2 / 3" },
              { row: "2 / 3", col: "3 / 4" },
            ];
            return cells.map((cell, i) => {
              const photo = sd.gallery?.[i];
              return (
                <div key={i} style={{ gridRow: cell.row, gridColumn: cell.col, background: sd.accent, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden" }}>
                  {photo ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={photo.src} alt={photo.alt} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: photo.pos ?? "center" }} />
                  ) : (
                    <>
                      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(circle at ${i % 2 === 0 ? "30% 70%" : "70% 30%"}, ${sd.accent}88, ${sd.accent})` }} />
                      <div style={{ position: "relative", zIndex: 1, fontFamily: "var(--font-heading)", fontSize: i === 0 ? 64 : 32, color: "rgba(255,255,255,0.08)", letterSpacing: "-0.04em" }}>
                        {safeSlug.toUpperCase()}
                      </div>
                    </>
                  )}
                </div>
              );
            });
          })()}
        </div>
        <div style={{ padding: "28px 48px", background: sd.accent }}>
          <div style={{ maxWidth: 1000, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
              {safeSlug === "oku" ? "OKÜ" : safeSlug.toUpperCase()} · Gold House · Casco Viejo
            </span>
            {sd.gallery && (
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", fontStyle: "italic" }}>
                {v.photography as string}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── SUSHI BAR FEATURE (OKÜ only) ─────────────────────────────────────── */}
      {safeSlug === "oku" && sd.sushiBarPhotos && (
        <div style={{ background: "#0e0c0a", padding: "96px 48px" }}>
          <div style={{ maxWidth: 1000, margin: "0 auto" }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(255,255,255,0.25)", marginBottom: 24, display: "block" }}>
              {v.theKitchen as string}
            </span>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "48px 64px", alignItems: "center" }}>
              <div>
                <div style={{ fontFamily: "var(--font-heading)", fontSize: "clamp(28px, 4vw, 44px)", color: "#fff", letterSpacing: "-0.03em", lineHeight: 1.1, marginBottom: 24 }}>
                  {(vd as Record<string, string>).sushiBarHeading}
                </div>
                <p style={{ fontSize: 15, color: "rgba(255,255,255,0.5)", lineHeight: 1.8, margin: 0 }}>
                  {(vd as Record<string, string>).sushiBarBody}
                </p>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {sd.sushiBarPhotos.map((photo, i) => (
                  <div key={i} style={{ aspectRatio: "3/4", overflow: "hidden", borderRadius: 8, position: "relative" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photo.src} alt={photo.alt} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center" }} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── SIGNATURE COCKTAILS (OKÜ only) ───────────────────────────────────── */}
      {safeSlug === "oku" && (
        <div style={{ background: "#09070a", padding: "96px 48px" }}>
          <div style={{ maxWidth: 1200, margin: "0 auto" }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(255,255,255,0.25)", marginBottom: 24, display: "block" }}>
              {v.atTheBar as string}
            </span>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "48px 80px", alignItems: "start" }}>
              <div>
                <div style={{ fontFamily: "var(--font-heading)", fontSize: "clamp(28px, 4vw, 44px)", color: "#fff", letterSpacing: "-0.03em", lineHeight: 1.1, marginBottom: 24 }}>
                  {((vd as Record<string, string>).cocktailHeading || "").split("\n").map((line, i) => (
                    <span key={i}>{line}{i === 0 ? <br /> : null}</span>
                  ))}
                </div>
                <p style={{ fontSize: 15, color: "rgba(255,255,255,0.5)", lineHeight: 1.8, margin: "0 0 40px" }}>
                  {(vd as Record<string, string>).cocktailBody}
                </p>
                <div style={{ aspectRatio: "16/9", overflow: "hidden", borderRadius: 8, position: "relative" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/images/oku/optimized/cocktail-rocks-overhead.jpg" alt="Overhead view of OKÜ signature rocks cocktail" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center" }} />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                <div style={{ aspectRatio: "2/3", overflow: "hidden", borderRadius: 8, position: "relative" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/images/oku/optimized/cocktail-floral-06.jpg" alt="OKÜ Botanica cocktail" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 20%" }} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ flex: 1, overflow: "hidden", borderRadius: 8, position: "relative" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/images/oku/optimized/cocktail-coupe-01.jpg" alt="OKÜ golden coupe" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 30%" }} />
                  </div>
                  <div style={{ flex: 1, overflow: "hidden", borderRadius: 8, position: "relative" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/images/oku/optimized/cocktail-green-02.jpg" alt="OKÜ Midori Sésame" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 25%" }} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── THE SPACE (OKÜ only) ──────────────────────────────────────────────── */}
      {safeSlug === "oku" && (
        <div style={{ background: "#0a0908" }}>
          <div style={{ position: "relative", height: 520, overflow: "hidden" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/oku/optimized/interior-sushi-bar-04.jpg" alt="OKÜ full dining room" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 35%" }} />
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(10,9,8,0.2) 0%, rgba(10,9,8,0.08) 35%, rgba(10,9,8,0.88) 100%)" }} />
            <div style={{ position: "absolute", bottom: 48, left: 48, right: 48 }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(255,255,255,0.3)", marginBottom: 16, display: "block" }}>
                {v.theSpace as string}
              </span>
              <div style={{ fontFamily: "var(--font-heading)", fontSize: "clamp(28px, 5vw, 56px)", color: "#fff", letterSpacing: "-0.04em", lineHeight: 1.05 }}>
                {((vd as Record<string, string>).spaceHeading || "").split("\n").map((line, i) => (
                  <span key={i}>{line}{i === 0 ? <br /> : null}</span>
                ))}
              </div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 3 }}>
            {[
              { src: "/images/oku/optimized/interior-koi-wall-03.jpg", alt: "The koi wall", pos: "center 40%" },
              { src: "/images/oku/optimized/interior-sushi-bar-01.jpg", alt: "OKÜ sushi counter", pos: "center 30%" },
              { src: "/images/oku/optimized/interior-sushi-bar-03.jpg", alt: "OKÜ full dining room", pos: "center 25%" },
            ].map((photo, i) => (
              <div key={i} style={{ aspectRatio: "3/4", position: "relative", overflow: "hidden" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.src} alt={photo.alt} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: photo.pos }} />
              </div>
            ))}
          </div>
          <div style={{ padding: "40px 48px", display: "flex", justifyContent: "center" }}>
            <p style={{ fontSize: 15, color: "rgba(255,255,255,0.45)", lineHeight: 1.8, maxWidth: 560, textAlign: "center", margin: 0 }}>
              {(vd as Record<string, string>).spaceBody}
            </p>
          </div>
        </div>
      )}

      {/* ── MENU ─────────────────────────────────────────────────────────────── */}
      <div id="menu" style={{ background: "#faf8f6", padding: "96px 48px", scrollMarginTop: 80 }}>
        <div style={{ maxWidth: 1000, margin: "0 auto" }}>
          <span style={sectionLabel}>{v.theMenu as string}</span>
          {foodMenu ? (
            <MenuView
              venueSlug={safeSlug as "oku" | "catch" | "terrace"}
              locale={safeLocale}
              variant="page"
              accent={sd.accent}
              accentLight={sd.accentLight}
              background="transparent"
              drinksLabel={v.drinkMenu as string}
              foodMenu={foodMenu}
              drinksMenu={drinksMenu}
            />
          ) : (
            <div style={{ display: "grid", gap: 32 }}>
              {sd.menu.map((cat) => (
                <div key={cat.category}>
                  <div style={{ fontFamily: "var(--font-heading)", fontSize: 20, color: sd.accent, letterSpacing: "-0.02em", marginBottom: 16, paddingBottom: 12, borderBottom: `1px solid ${sd.accentLight}` }}>{STATIC_MENU_CATEGORY_LABELS[cat.category]?.[safeLocale] ?? cat.category}</div>
                  <div style={{ display: "grid", gap: 14 }}>
                    {cat.items.map((item) => (
                      <div key={item.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 16 }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 600, color: "#1f1a17", marginBottom: 3 }}>{item.name}</div>
                          <div style={{ fontSize: 12, color: "#7d7269", lineHeight: 1.6 }}>{item.desc}</div>
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: sd.accent, flexShrink: 0 }}>{item.price}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── RESERVE ──────────────────────────────────────────────────────────── */}
      <div style={{ background: sd.accent, padding: "96px 48px", textAlign: "center" }}>
        <div style={{ maxWidth: 600, margin: "0 auto" }}>
          <div style={{ fontFamily: "var(--font-heading)", fontSize: "clamp(32px, 5vw, 52px)", color: "#fff", letterSpacing: "-0.03em", marginBottom: 20 }}>
            {common.reserveTable}
          </div>
          <p style={{ fontSize: 15, color: "rgba(255,255,255,0.55)", lineHeight: 1.8, marginBottom: 40 }}>
            {tagline}
          </p>
          <Link href={localePath(safeLocale, `/reservations?concept=${safeSlug}`)} style={{ display: "inline-block", background: "#fff", color: sd.accent, borderRadius: 12, padding: "16px 40px", fontSize: 14, fontWeight: 700, textDecoration: "none", letterSpacing: "0.02em" }}>
            {v.reserveArrow as string}
          </Link>
        </div>
      </div>

      {/* ── OTHER VENUES ─────────────────────────────────────────────────────── */}
      <div style={{ padding: "64px 48px", background: "#fff" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto" }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "#7d7269", marginBottom: 32 }}>
            {v.ourRestaurants as string}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {sd.others.map((other) => {
              const otherData = (v[other.slug] as Record<string, string>) || {};
              return (
                <Link key={other.slug} href={localePath(safeLocale, `/restaurants/${other.slug}`)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "24px", border: "1.5px solid #e8e2dd", borderRadius: 16, textDecoration: "none", background: "#faf8f6" }}>
                  <div>
                    <div style={{ fontFamily: "var(--font-heading)", fontSize: 24, color: "#1f1a17", letterSpacing: "-0.02em" }}>{other.name}</div>
                    <div style={{ fontSize: 11, color: "#7d7269", marginTop: 4, letterSpacing: "0.06em", textTransform: "uppercase" }}>{otherData.tag || other.tagKey}</div>
                  </div>
                  <div style={{ fontSize: 20, color: "#c8c0b8" }}>→</div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
