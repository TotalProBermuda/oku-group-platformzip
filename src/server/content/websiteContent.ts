import { prisma } from "@/lib/prisma";
import type { Locale } from "@/types/i18n";

export const WEBSITE_LOCALES = ["en", "es", "pt"] as const;
export const WEBSITE_VENUES = ["oku", "catch", "terrace"] as const;
export type WebsiteVenue = (typeof WEBSITE_VENUES)[number];

type VenueCopy = {
  headline: string;
  tag: string;
  tagline: string;
  description: string;
  heroLine1: string;
  heroLine2: string;
  heroLine3: string;
  about: string[];
};

export type WebsiteContent = {
  hours: Array<{ days: Record<Locale, string>; time: string }>;
  venues: Record<WebsiteVenue, Record<Locale, VenueCopy>>;
};

export const WEBSITE_CONTENT_DEFAULTS: WebsiteContent = {
  hours: [
    { days: { en: "Monday – Thursday", es: "Lunes – Jueves", pt: "Segunda – Quinta" }, time: "5:00 pm – 12:00 am" },
    { days: { en: "Friday – Sunday", es: "Viernes – Domingo", pt: "Sexta – Domingo" }, time: "2:00 pm – 12:00 am" },
  ],
  venues: {
    oku: {
      en: { headline: "The Signature Dining Room", tag: "Restaurant", tagline: "Thoughtful food, warm hospitality, and a setting designed for time together.", description: "OKÜ is the signature restaurant at Gold House in Casco Viejo, bringing together considered cooking, attentive service, and an intimate dining room.", heroLine1: "Thoughtful food.", heroLine2: "Warm hospitality.", heroLine3: "Casco Viejo.", about: ["OKÜ is centred on the experience of sharing a well-prepared meal in a distinctive Casco Viejo setting.", "The dining room, sushi counter, kitchen, and bar work as one restaurant experience—from the first welcome through the final course."] },
      es: { headline: "El Restaurante Principal", tag: "Restaurante", tagline: "Cocina cuidada, hospitalidad cálida y un espacio para compartir.", description: "OKÜ es el restaurante principal de Gold House en Casco Viejo, con cocina cuidada, servicio atento y un comedor íntimo.", heroLine1: "Cocina cuidada.", heroLine2: "Hospitalidad cálida.", heroLine3: "Casco Viejo.", about: ["OKÜ se centra en compartir una comida bien preparada en un espacio distintivo de Casco Viejo.", "El comedor, la barra de sushi, la cocina y el bar forman una sola experiencia, desde la bienvenida hasta el último plato."] },
      pt: { headline: "O Restaurante Principal", tag: "Restaurante", tagline: "Comida cuidadosa, hospitalidade acolhedora e um espaço para estar juntos.", description: "OKÜ é o restaurante principal do Gold House em Casco Viejo, reunindo cozinha cuidadosa, serviço atencioso e um salão íntimo.", heroLine1: "Comida cuidadosa.", heroLine2: "Hospitalidade acolhedora.", heroLine3: "Casco Viejo.", about: ["OKÜ é centrado na experiência de compartilhar uma refeição bem preparada em um espaço marcante de Casco Viejo.", "O salão, o balcão de sushi, a cozinha e o bar formam uma única experiência, da chegada ao último prato."] },
    },
    catch: {
      en: { headline: "Relaxed Social Dining", tag: "Restaurant", tagline: "A lively restaurant setting for shared plates, drinks, and conversation.", description: "CATCH is a social restaurant at Gold House with a relaxed atmosphere, a menu made for sharing, and a welcoming space for groups and gatherings.", heroLine1: "Gather.", heroLine2: "Share.", heroLine3: "Stay awhile.", about: ["CATCH is designed around shared tables, generous plates, and easy conversation.", "The room brings food, drinks, and music together without losing sight of the restaurant experience at its centre."] },
      es: { headline: "Restaurante Social y Relajado", tag: "Restaurante", tagline: "Un espacio animado para compartir platos, bebidas y conversación.", description: "CATCH es un restaurante social en Gold House, con un ambiente relajado, un menú para compartir y un espacio acogedor para grupos y encuentros.", heroLine1: "Encuéntrense.", heroLine2: "Compartan.", heroLine3: "Sin prisa.", about: ["CATCH está pensado para mesas compartidas, platos generosos y conversación sin prisa.", "El espacio reúne comida, bebidas y música sin perder de vista la experiencia del restaurante."] },
      pt: { headline: "Restaurante Social e Descontraído", tag: "Restaurante", tagline: "Um ambiente animado para compartilhar pratos, bebidas e conversa.", description: "CATCH é um restaurante social no Gold House, com ambiente descontraído, menu para compartilhar e um espaço acolhedor para grupos e encontros.", heroLine1: "Encontrem-se.", heroLine2: "Compartilhem.", heroLine3: "Sem pressa.", about: ["CATCH foi pensado para mesas compartilhadas, pratos generosos e conversa tranquila.", "O espaço reúne comida, bebidas e música sem perder de vista a experiência do restaurante."] },
    },
    terrace: {
      en: { headline: "Open-Air Rooftop Restaurant", tag: "Rooftop Restaurant", tagline: "Food, drinks, and open-air dining above Casco Viejo.", description: "TERRACE is the rooftop restaurant at Gold House—an open-air setting for lunch, dinner, drinks, and gatherings overlooking Casco Viejo.", heroLine1: "Open air.", heroLine2: "Good food.", heroLine3: "Casco Viejo.", about: ["TERRACE brings the restaurant experience outdoors, with an open-air setting above Gold House.", "It is a flexible place for an afternoon meal, dinner, drinks, and time together as the city changes around it."] },
      es: { headline: "Restaurante en Terraza al Aire Libre", tag: "Restaurante en Terraza", tagline: "Comida, bebidas y mesas al aire libre sobre Casco Viejo.", description: "TERRACE es el restaurante en la azotea de Gold House: un espacio al aire libre para almuerzos, cenas, bebidas y encuentros con vistas a Casco Viejo.", heroLine1: "Al aire libre.", heroLine2: "Buena comida.", heroLine3: "Casco Viejo.", about: ["TERRACE lleva la experiencia del restaurante al aire libre, sobre Gold House.", "Es un espacio flexible para almorzar, cenar, tomar algo y compartir mientras cambia la ciudad a su alrededor."] },
      pt: { headline: "Restaurante ao Ar Livre no Terraço", tag: "Restaurante no Terraço", tagline: "Comida, bebidas e mesas ao ar livre sobre Casco Viejo.", description: "TERRACE é o restaurante no terraço do Gold House, um espaço ao ar livre para almoço, jantar, bebidas e encontros com vista para Casco Viejo.", heroLine1: "Ao ar livre.", heroLine2: "Boa comida.", heroLine3: "Casco Viejo.", about: ["TERRACE leva a experiência do restaurante para o ar livre, acima do Gold House.", "É um espaço flexível para almoço, jantar, bebidas e tempo juntos enquanto a cidade muda ao redor."] },
    },
  },
};

function validStoredContent(value: unknown): value is WebsiteContent {
  if (!value || typeof value !== "object") return false;
  const content = value as Partial<WebsiteContent>;
  return Array.isArray(content.hours) && Boolean(content.venues);
}

export async function getWebsiteContent(): Promise<WebsiteContent> {
  try {
    const row = await prisma.commerceSettings.findUnique({ where: { id: "global" }, select: { websiteContent: true } });
    return validStoredContent(row?.websiteContent) ? row.websiteContent : WEBSITE_CONTENT_DEFAULTS;
  } catch {
    // Keeps public pages available during the deployment in which the new
    // column is being applied, and on local databases not yet migrated.
    return WEBSITE_CONTENT_DEFAULTS;
  }
}

export function venueCopy(content: WebsiteContent, venue: WebsiteVenue, locale: Locale) {
  return content.venues[venue]?.[locale] ?? content.venues[venue].en;
}

export function hoursSummary(content: WebsiteContent, locale: Locale) {
  return content.hours.map((entry) => `${entry.days[locale]} · ${entry.time}`).join("  |  ");
}
