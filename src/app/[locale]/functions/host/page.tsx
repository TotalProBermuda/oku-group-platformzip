import Link from "next/link";
import { localePath } from "@/i18n/utils";

const content = {
  en: { title: "Host Your Event Here", intro: "Tell us about your gathering and our team will help you plan the next step.", details: "Share your preferred date, guest count, venue, and the kind of experience you have in mind. Availability and event details are confirmed by our team.", email: "Email the events team", back: "Back to functions", note: "For the Private Dining Room, please note that it seats up to 8 guests." },
  es: { title: "Organiza tu evento aquí", intro: "Cuéntanos sobre tu reunión y nuestro equipo te ayudará a planificar el siguiente paso.", details: "Indica la fecha deseada, el número de invitados, el espacio y el tipo de experiencia que buscas. Nuestro equipo confirmará disponibilidad y detalles.", email: "Escribir al equipo de eventos", back: "Volver a funciones", note: "El salón privado tiene capacidad para hasta 8 personas." },
  pt: { title: "Realize seu evento aqui", intro: "Conte-nos sobre seu encontro e nossa equipe ajudará a planejar os próximos passos.", details: "Informe a data desejada, o número de convidados, o espaço e a experiência que procura. Nossa equipe confirmará disponibilidade e detalhes.", email: "Enviar e-mail para eventos", back: "Voltar para eventos", note: "A sala de jantar privada acomoda até 8 pessoas." },
} as const;

export default async function HostEventPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = raw in content ? raw as keyof typeof content : "en";
  const t = content[locale];
  const subject = encodeURIComponent("OKÜ Hospitality Group — Function inquiry");
  const body = encodeURIComponent("Preferred date:\nGuest count:\nPreferred venue:\nType of event:\nAdditional details:");
  return (
    <div style={{ minHeight: "70vh", background: "#f7f4f1", padding: "clamp(48px, 8vw, 100px) 24px" }}>
      <div style={{ maxWidth: 840, margin: "0 auto", background: "#fff", border: "1px solid #e8dfd7", borderRadius: 24, padding: "clamp(28px, 6vw, 64px)", boxShadow: "0 18px 55px rgba(30,20,16,.08)" }}>
        <Link href={localePath(locale, "/functions")} style={{ color: "#857970", textDecoration: "none" }}>← {t.back}</Link>
        <p style={{ color: "#b51f3a", fontSize: 12, letterSpacing: ".16em", fontWeight: 700, textTransform: "uppercase", marginTop: 38 }}>OKÜ Hospitality Group</p>
        <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "clamp(40px, 6vw, 64px)", fontWeight: 400, lineHeight: 1.05, margin: "12px 0 18px" }}>{t.title}</h1>
        <p style={{ fontSize: 20, lineHeight: 1.6 }}>{t.intro}</p>
        <p style={{ color: "#70655f", lineHeight: 1.8 }}>{t.details}</p>
        <div style={{ margin: "28px 0", borderLeft: "3px solid #c9a76a", padding: "12px 18px", background: "#faf8f5", color: "#514841" }}>{t.note}</div>
        <a className="btn btn-primary" href={`mailto:reservations@okugroup.com?subject=${subject}&body=${body}`}>{t.email} →</a>
      </div>
    </div>
  );
}
