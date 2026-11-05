import Link from "next/link";
import { localePath } from "@/i18n/utils";

const content = {
  en: { title: "Catering Menu", intro: "On The Terrace, guests can order from both OKÜ Asian Fusion and CATCH Caribbean Fusion menus.", oku: "OKÜ · Asian Fusion", catch: "CATCH · Caribbean Fusion", view: "Explore menu", back: "Back to functions", note: "Menu availability and service details are confirmed with your event proposal." },
  es: { title: "Menú de catering", intro: "En The Terrace, los invitados pueden pedir de los menús de OKÜ Asian Fusion y CATCH Caribbean Fusion.", oku: "OKÜ · Fusión asiática", catch: "CATCH · Fusión caribeña", view: "Explorar menú", back: "Volver a funciones", note: "La disponibilidad del menú y los detalles del servicio se confirman con la propuesta del evento." },
  pt: { title: "Menu de catering", intro: "No The Terrace, os convidados podem pedir dos menus do OKÜ Asian Fusion e do CATCH Caribbean Fusion.", oku: "OKÜ · Fusão asiática", catch: "CATCH · Fusão caribenha", view: "Ver menu", back: "Voltar para eventos", note: "A disponibilidade do menu e os detalhes do serviço são confirmados com a proposta do evento." },
} as const;

export default async function CateringMenuPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = raw in content ? raw as keyof typeof content : "en";
  const t = content[locale];
  return (
    <div style={{ minHeight: "70vh", background: "#f7f4f1", padding: "clamp(48px, 8vw, 100px) 24px" }}>
      <div style={{ maxWidth: 1000, margin: "0 auto" }}>
        <Link href={localePath(locale, "/functions")} style={{ color: "#857970", textDecoration: "none" }}>← {t.back}</Link>
        <p style={{ color: "#b51f3a", fontSize: 12, letterSpacing: ".16em", fontWeight: 700, textTransform: "uppercase", marginTop: 38 }}>OKÜ Hospitality Group</p>
        <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "clamp(40px, 6vw, 64px)", fontWeight: 400, margin: "12px 0" }}>{t.title}</h1>
        <p style={{ maxWidth: 740, color: "#70655f", fontSize: 18, lineHeight: 1.7 }}>{t.intro}</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))", gap: 20, marginTop: 34 }}>
          {[
            { title: t.oku, href: "/restaurants/oku#menu", image: "/images/oku/dsc08712.jpg", alt: "OKÜ sushi station" },
            { title: t.catch, href: "/restaurants/catch#menu", image: "/images/catch/grill.jpg", alt: "CATCH Caribbean-inspired menu" },
          ].map((item) => (
            <Link key={item.title} href={localePath(locale, item.href)} style={{ minHeight: 280, display: "flex", flexDirection: "column", justifyContent: "end", padding: 26, borderRadius: 20, background: `linear-gradient(0deg, rgba(20,15,12,.82), rgba(20,15,12,.05)), url('${item.image}') center/cover`, textDecoration: "none", color: "white" }}>
              <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 32, fontWeight: 400, margin: "0 0 14px" }}>{item.title}</h2>
              <span style={{ fontWeight: 700 }}>{t.view} →</span>
            </Link>
          ))}
        </div>
        <p style={{ color: "#70655f", marginTop: 24 }}>{t.note}</p>
      </div>
    </div>
  );
}
