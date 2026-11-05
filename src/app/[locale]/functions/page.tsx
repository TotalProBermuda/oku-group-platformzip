import Image from "next/image";
import Link from "next/link";
import { localePath } from "@/i18n/utils";

const copy = {
  en: {
    eyebrow: "GATHER HERE",
    title: "Make room for a memorable occasion.",
    intro: "Host a private dinner, celebration, wedding reception, or brand gathering at OKÜ Hospitality Group in Casco Viejo.",
    host: "Host Your Event Here",
    catering: "Catering Menu",
    explore: "Explore event spaces",
    spaces: "Four ways to make it yours",
    venues: [
      ["OKÜ", "Asian Fusion", "/restaurants/oku"],
      ["CATCH", "Caribbean Fusion", "/restaurants/catch"],
      ["The Terrace", "An open-air setting for gatherings", "/restaurants/terrace"],
      ["The Private Dining Room", "A separate, intimate room for up to 8 guests", "/restaurants/oku"],
    ],
    inquiry: "Tell us what you’re planning",
    inquiryText: "Share your date, guest count, and the kind of gathering you have in mind. Our team can help you explore the right space and menu.",
    contact: "Start a function inquiry",
    occasions: ["Wedding receptions", "Engagement celebrations", "Birthday gatherings", "Corporate events", "Brand launches", "Private dinners"],
  },
  es: {
    eyebrow: "REÚNANSE AQUÍ",
    title: "Un espacio para celebrar momentos memorables.",
    intro: "Organiza una cena privada, celebración, recepción de boda o evento de marca en OKÜ Hospitality Group, en Casco Viejo.",
    host: "Organiza tu evento aquí",
    catering: "Menú de catering",
    explore: "Explora nuestros espacios",
    spaces: "Cuatro espacios para hacerlo tuyo",
    venues: [
      ["OKÜ", "Fusión asiática", "/restaurants/oku"],
      ["CATCH", "Fusión caribeña", "/restaurants/catch"],
      ["The Terrace", "Un espacio al aire libre para reuniones", "/restaurants/terrace"],
      ["Salón privado", "Un espacio íntimo e independiente para hasta 8 personas", "/restaurants/oku"],
    ],
    inquiry: "Cuéntanos qué estás planeando",
    inquiryText: "Compártenos la fecha, el número de invitados y el tipo de evento. Nuestro equipo puede ayudarte a elegir el espacio y menú adecuados.",
    contact: "Iniciar una consulta",
    occasions: ["Recepciones de boda", "Celebraciones de compromiso", "Cumpleaños", "Eventos corporativos", "Lanzamientos de marca", "Cenas privadas"],
  },
  pt: {
    eyebrow: "CELEBRE AQUI",
    title: "Um espaço para momentos inesquecíveis.",
    intro: "Organize um jantar privado, celebração, recepção de casamento ou evento de marca no OKÜ Hospitality Group, em Casco Viejo.",
    host: "Realize seu evento aqui",
    catering: "Menu de catering",
    explore: "Conheça nossos espaços",
    spaces: "Quatro espaços para celebrar",
    venues: [
      ["OKÜ", "Fusão asiática", "/restaurants/oku"],
      ["CATCH", "Fusão caribenha", "/restaurants/catch"],
      ["The Terrace", "Um ambiente ao ar livre para encontros", "/restaurants/terrace"],
      ["Sala de jantar privada", "Um espaço intimista e separado para até 8 pessoas", "/restaurants/oku"],
    ],
    inquiry: "Conte-nos o que está planejando",
    inquiryText: "Informe a data, o número de convidados e o tipo de evento. Nossa equipe pode ajudar a encontrar o espaço e o menu certos.",
    contact: "Iniciar uma consulta",
    occasions: ["Recepções de casamento", "Celebrações de noivado", "Aniversários", "Eventos corporativos", "Lançamentos de marca", "Jantares privados"],
  },
} as const;

const photos = [
  { src: "/images/terrace/functions/wedding-reception.webp", alt: "Wedding reception at an OKÜ Hospitality Group venue" },
  { src: "/images/terrace/functions/corporate-dinner.webp", alt: "Guests sharing dinner at an OKÜ event" },
  { src: "/images/terrace/functions/product-launch.webp", alt: "A product launch hosted at an OKÜ venue" },
  { src: "/images/terrace/functions/brand-activation.webp", alt: "Guests enjoying an OKÜ brand event" },
];

export default async function FunctionsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale = rawLocale in copy ? rawLocale as keyof typeof copy : "en";
  const t = copy[locale];

  return (
    <div style={{ background: "#f7f4f1", color: "#201a17" }}>
      <section style={{ position: "relative", minHeight: "min(72vh, 720px)", display: "flex", alignItems: "end", overflow: "hidden", color: "white", background: "#211916" }}>
        <Image src="/images/terrace/functions/product-launch.webp" alt="A private event at The Terrace" fill priority sizes="100vw" style={{ objectFit: "cover", objectPosition: "center 48%", opacity: 0.62 }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, rgba(20,14,12,.80), rgba(20,14,12,.08)), linear-gradient(0deg, rgba(20,14,12,.72), transparent 75%)" }} />
        <div style={{ position: "relative", width: "min(1200px, 100%)", margin: "0 auto", padding: "clamp(56px, 10vw, 132px) 24px 72px" }}>
          <p style={{ letterSpacing: ".18em", textTransform: "uppercase", fontSize: 12, fontWeight: 700, color: "#e0bd80" }}>{t.eyebrow}</p>
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "clamp(42px, 7vw, 82px)", lineHeight: 1.02, fontWeight: 400, maxWidth: 850, margin: "16px 0" }}>{t.title}</h1>
          <p style={{ maxWidth: 680, fontSize: "clamp(16px, 2vw, 20px)", lineHeight: 1.7, color: "rgba(255,255,255,.86)" }}>{t.intro}</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 30 }}>
            <Link href={localePath(locale, "/functions/host")} className="btn btn-primary">{t.host} →</Link>
            <Link href={localePath(locale, "/functions/catering")} className="btn" style={{ border: "1px solid rgba(255,255,255,.65)", color: "white", background: "rgba(255,255,255,.08)" }}>{t.catering}</Link>
          </div>
        </div>
      </section>

      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "72px 24px 28px" }}>
        <p style={{ color: "#b51f3a", fontWeight: 700, fontSize: 12, letterSpacing: ".16em", textTransform: "uppercase" }}>{t.explore}</p>
        <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: 400, fontSize: "clamp(32px, 4vw, 48px)", margin: "10px 0 28px" }}>{t.spaces}</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 250px), 1fr))", gap: 16 }}>
          {t.venues.map(([name, detail, href], i) => (
            <Link key={name} href={localePath(locale, href)} style={{ position: "relative", minHeight: 270, borderRadius: 18, overflow: "hidden", color: "white", textDecoration: "none", background: "#332823" }}>
              <Image src={photos[i].src} alt={photos[i].alt} fill sizes="(max-width: 700px) 100vw, 25vw" style={{ objectFit: "cover", transition: "transform .4s ease" }} />
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(0deg, rgba(18,13,11,.84), transparent 75%)" }} />
              <div style={{ position: "absolute", inset: "auto 20px 20px" }}>
                <h3 style={{ fontFamily: "var(--font-heading)", fontSize: 26, fontWeight: 400, margin: "0 0 6px" }}>{name}</h3>
                <p style={{ margin: 0, color: "rgba(255,255,255,.82)", lineHeight: 1.5 }}>{detail}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "56px 24px 84px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: 36, alignItems: "center" }}>
        <div>
          <p style={{ color: "#b51f3a", fontWeight: 700, fontSize: 12, letterSpacing: ".16em", textTransform: "uppercase" }}>{t.inquiry}</p>
          <p style={{ fontSize: 17, lineHeight: 1.8, color: "#70655f" }}>{t.inquiryText}</p>
          <Link href={localePath(locale, "/functions/host")} className="btn btn-primary" style={{ display: "inline-flex", marginTop: 10 }}>{t.contact} →</Link>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {t.occasions.map((occasion) => <span key={occasion} style={{ border: "1px solid #dfd6ce", borderRadius: 999, padding: "11px 16px", background: "#fff", color: "#514841" }}>{occasion}</span>)}
        </div>
      </section>
    </div>
  );
}
