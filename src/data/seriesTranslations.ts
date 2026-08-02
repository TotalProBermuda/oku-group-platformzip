import type { Locale } from "@/types/i18n";

type SeriesContent = {
  title: string;
  subtitle?: string;
  description: string;
};

type SessionContent = {
  title: string;
};

export const SERIES_TRANSLATIONS: Record<string, Record<Locale, SeriesContent>> = {
  "interior-design-masterclass": {
    en: {
      title: "Interior Design Masterclass",
      subtitle: "A 3-session deep-dive into luxury interior design",
      description: "Join renowned designer Sophia Laurent for an exclusive 3-session masterclass on modern interior design. Learn the principles of luxury minimalism, colour theory for hospitality spaces, and hands-on styling with curated materials.",
    },
    es: {
      title: "Masterclass de Diseño de Interiores",
      subtitle: "Una inmersión de 3 sesiones en el diseño interior de lujo",
      description: "Acompañe a la reconocida diseñadora Sophia Laurent en una exclusiva masterclass de 3 sesiones sobre diseño de interiores moderno. Aprenda los principios del minimalismo de lujo, la teoría del color para espacios de hospitalidad y el estilismo práctico con materiales curados.",
    },
    pt: {
      title: "Masterclass de Design de Interiores",
      subtitle: "Uma imersão de 3 sessões no design de interiores de luxo",
      description: "Junte-se à renomada designer Sophia Laurent para uma masterclass exclusiva de 3 sessões sobre design de interiores moderno. Aprenda os princípios do minimalismo de luxo, teoria das cores para espaços de hospitalidade e estilismo prático com materiais curados.",
    },
  },
  "catch-cocktail-series": {
    en: {
      title: "CATCH Cocktail Series",
      description: "An immersive cocktail crafting series at CATCH. Each session covers a different spirit category — gin & botanicals, whiskey expressions, and zero-proof cocktails — with tasting flights and take-home recipe cards.",
    },
    es: {
      title: "Serie de Cócteles en CATCH",
      description: "Una serie inmersiva de coctelería en CATCH. Cada sesión aborda una categoría diferente de destilado — gin y botánicos, expresiones de whisky y cócteles sin alcohol — con rondas de degustación y recetas para llevar a casa.",
    },
    pt: {
      title: "Série de Coquetéis no CATCH",
      description: "Uma série imersiva de coquetelaria no CATCH. Cada sessão cobre uma categoria diferente de destilado — gim e botânicos, expressões de whisky e coquetéis sem álcool — com degustações e receitas para levar para casa.",
    },
  },
  "rossi-wine-dinner": {
    en: {
      title: "Rossi Wine & Dinner Pairing",
      description: "Partner Marco Rossi presents an elegant wine dinner series featuring curated pairings from his family vineyard in Tuscany. A five-course menu by our Executive Chef is complemented by hand-selected vintages and a guided tasting from Marco himself.",
    },
    es: {
      title: "Rossi: Maridaje de Vino y Cena",
      description: "El socio Marco Rossi presenta una elegante serie de cenas maridadas con vinos de su viñedo familiar en la Toscana. Un menú de cinco tiempos de nuestro Chef Ejecutivo se complementa con cepas seleccionadas a mano y una cata guiada por el propio Marco.",
    },
    pt: {
      title: "Rossi: Harmonização de Vinho e Jantar",
      description: "O parceiro Marco Rossi apresenta uma elegante série de jantares harmonizados com vinhos de seu vinhedo familiar na Toscana. Um menu de cinco pratos do nosso Chef Executivo é complementado por vinhos selecionados e uma degustação guiada pelo próprio Marco.",
    },
  },
  "oku-wellness-retreat": {
    en: {
      title: "OKU Wellness Retreat",
      description: "A holistic wellness series blending mindfulness, nutrition, and movement. Sessions include guided meditation by candlelight, plant-based cooking demonstrations, and energising yoga flows on our garden terrace.",
    },
    es: {
      title: "Retiro de Bienestar OKÜ",
      description: "Una serie holística de bienestar que combina atención plena, nutrición y movimiento. Las sesiones incluyen meditación guiada a la luz de velas, demostraciones de cocina a base de plantas y clases de yoga energizantes en nuestra terraza del jardín.",
    },
    pt: {
      title: "Retiro de Bem-Estar OKÜ",
      description: "Uma série holística de bem-estar que combina atenção plena, nutrição e movimento. As sessões incluem meditação guiada à luz de velas, demonstrações de culinária à base de plantas e aulas de yoga energizantes em nosso terraço do jardim.",
    },
  },
  "sarah-ibiza-supper-club": {
    en: {
      title: "Sarah Jenkins: Ibiza Supper Club",
      description: "Travel & food creator Sarah Jenkins curates a night inspired by Ibiza's legendary dining scene — shared plates, natural wines, and music from a rotating DJ residency. Limited to 40 guests per session.",
    },
    es: {
      title: "Sarah Jenkins: Ibiza Supper Club",
      description: "La creadora de viajes y gastronomía Sarah Jenkins es la curadora de una noche inspirada en la legendaria escena gastronómica de Ibiza — platos compartidos, vinos naturales y música de una residencia de DJ rotativa. Limitado a 40 invitados por sesión.",
    },
    pt: {
      title: "Sarah Jenkins: Clube de Ceia de Ibiza",
      description: "A criadora de viagens e gastronomia Sarah Jenkins é a curadora de uma noite inspirada na lendária cena gastronômica de Ibiza — pratos compartilhados, vinhos naturais e música de uma residência de DJ rotativa. Limitado a 40 convidados por sessão.",
    },
  },
};

export const SESSION_TRANSLATIONS: Record<string, Record<Locale, SessionContent>> = {
  "Session 1: Foundations of Luxury Design": {
    en: { title: "Session 1: Foundations of Luxury Design" },
    es: { title: "Sesión 1: Fundamentos del Diseño de Lujo" },
    pt: { title: "Sessão 1: Fundamentos do Design de Luxo" },
  },
  "Session 2: Colour & Texture Workshop": {
    en: { title: "Session 2: Colour & Texture Workshop" },
    es: { title: "Sesión 2: Taller de Color y Textura" },
    pt: { title: "Sessão 2: Oficina de Cor e Textura" },
  },
  "Session 3: Styling & Presentation": {
    en: { title: "Session 3: Styling & Presentation" },
    es: { title: "Sesión 3: Estilismo y Presentación" },
    pt: { title: "Sessão 3: Estilismo e Apresentação" },
  },
  "Gin & Botanical Tasting": {
    en: { title: "Gin & Botanical Tasting" },
    es: { title: "Cata de Gin y Botánicos" },
    pt: { title: "Degustação de Gin e Botânicos" },
  },
  "Whiskey & Barrel Expressions": {
    en: { title: "Whiskey & Barrel Expressions" },
    es: { title: "Expresiones de Whisky y Barril" },
    pt: { title: "Expressões de Whisky e Barril" },
  },
  "Zero-Proof: The Art of NA Cocktails": {
    en: { title: "Zero-Proof: The Art of NA Cocktails" },
    es: { title: "Sin Alcohol: El Arte de los Cócteles" },
    pt: { title: "Sem Álcool: A Arte dos Coquetéis" },
  },
  "Tuscan Reds Evening": {
    en: { title: "Tuscan Reds Evening" },
    es: { title: "Noche de Tintos de la Toscana" },
    pt: { title: "Noite de Tintos da Toscana" },
  },
  "Super Tuscans & White Night": {
    en: { title: "Super Tuscans & White Night" },
    es: { title: "Super Toscanos y Noche de Blancos" },
    pt: { title: "Super Tuscans e Noite de Brancos" },
  },
  "Morning Meditation & Plant Brunch": {
    en: { title: "Morning Meditation & Plant Brunch" },
    es: { title: "Meditación Matinal y Brunch Vegetal" },
    pt: { title: "Meditação Matinal e Brunch Vegano" },
  },
  "Yoga Flow & Cooking Demo": {
    en: { title: "Yoga Flow & Cooking Demo" },
    es: { title: "Yoga Flow y Demostración de Cocina" },
    pt: { title: "Yoga Flow e Demonstração de Culinária" },
  },
  "Breathwork & Nourish Workshop": {
    en: { title: "Breathwork & Nourish Workshop" },
    es: { title: "Taller de Respiración y Nutrición" },
    pt: { title: "Oficina de Respiração e Nutrição" },
  },
  "Ibiza Supper Club — Night One": {
    en: { title: "Ibiza Supper Club — Night One" },
    es: { title: "Club de Cena de Ibiza — Noche Uno" },
    pt: { title: "Clube de Jantar de Ibiza — Noite Um" },
  },
};

export const TICKET_TYPE_TRANSLATIONS: Record<string, Record<Locale, string>> = {
  "Day Pass": {
    en: "Day Pass",
    es: "Pase de un día",
    pt: "Passe Diário",
  },
  "Full Series Pass": {
    en: "Full Series Pass",
    es: "Pase de Serie Completa",
    pt: "Passe de Série Completo",
  },
  "General Admission": {
    en: "General Admission",
    es: "Entrada General",
    pt: "Admissão Geral",
  },
  "Member Early Access": {
    en: "Member Early Access",
    es: "Acceso Anticipado para Miembros",
    pt: "Acesso Antecipado para Membros",
  },
  "Member Seat (10% off)": {
    en: "Member Seat (10% off)",
    es: "Asiento de Miembro (10% dto.)",
    pt: "Assento de Membro (10% desc.)",
  },
  "Premium (incl. Bottle)": {
    en: "Premium (incl. Bottle)",
    es: "Premium (incl. Botella)",
    pt: "Premium (incl. Garrafa)",
  },
  "Single Session": {
    en: "Single Session",
    es: "Sesión Individual",
    pt: "Sessão Individual",
  },
  "VIP Experience": {
    en: "VIP Experience",
    es: "Experiencia VIP",
    pt: "Experiência VIP",
  },
  "Dinner Seat": {
    en: "Dinner Seat",
    es: "Asiento de Cena",
    pt: "Assento de Jantar",
  },
};

export function getSeriesContent(slug: string, locale: Locale) {
  return SERIES_TRANSLATIONS[slug]?.[locale] ?? SERIES_TRANSLATIONS[slug]?.["en"] ?? null;
}

export function getSessionTitle(originalTitle: string, locale: Locale): string {
  return SESSION_TRANSLATIONS[originalTitle]?.[locale]?.title ?? originalTitle;
}

export function getTicketTypeName(name: string, locale: Locale): string {
  return TICKET_TYPE_TRANSLATIONS[name]?.[locale] ?? name;
}
