import type { Locale, LocalizedText } from "@/types/i18n";

function resolveLocalizedText(value: string | LocalizedText, locale: Locale): string {
  if (typeof value === "string") return value;
  return value[locale] || value.en || "";
}

export const MENU_SECTION_TITLES: Record<string, Record<Locale, string>> = {
  "catch-starters":        { en: "Starters",         es: "Entrantes",        pt: "Entradas"         },
  "catch-pastas":          { en: "Pastas",            es: "Pastas",           pt: "Massas"           },
  "catch-meats":           { en: "Meats",             es: "Carnes",           pt: "Carnes"           },
  "catch-fish-seafood":    { en: "Fish & Seafood",    es: "Pescados y Mariscos", pt: "Peixes e Frutos do Mar" },
  "catch-burgers":         { en: "Burgers",           es: "Hamburguesas",     pt: "Hambúrgueres"     },
  "catch-sides":           { en: "Sides",             es: "Acompañamientos",  pt: "Acompanhamentos"  },
  "catch-vegetarians":     { en: "Vegetarians",       es: "Vegetarianos",     pt: "Vegetarianos"     },
  "catch-desserts":        { en: "Desserts",          es: "Postres",          pt: "Sobremesas"       },
  "catch-cocktails":       { en: "Cocktails",         es: "Cócteles",         pt: "Coquetéis"        },
  "catch-spirits":         { en: "Spirits",           es: "Licores",          pt: "Destilados"       },
  "catch-wines":           { en: "Wines",             es: "Vinos",            pt: "Vinhos"           },
  "catch-beers":           { en: "Beers",             es: "Cervezas",         pt: "Cervejas"         },
  "catch-non-alcoholic":   { en: "Non-Alcoholic",     es: "Sin Alcohol",      pt: "Sem Álcool"       },
  "oku-to-begin":          { en: "To Begin",          es: "Para Comenzar",    pt: "Para Começar"     },
  "oku-mains":             { en: "Mains",             es: "Principales",      pt: "Pratos Principais"},
  "oku-to-finish":         { en: "To Finish",         es: "Para Terminar",    pt: "Para Finalizar"   },
  "oku-sushi":             { en: "Sushi & Omakase",   es: "Sushi y Omakase",  pt: "Sushi e Omakase"  },
  "oku-cocktails":         { en: "Cocktails",         es: "Cócteles",         pt: "Coquetéis"        },
  "oku-wines":             { en: "Wine Selection",    es: "Selección de Vinos", pt: "Seleção de Vinhos" },
  "oku-spirits":           { en: "Spirits",           es: "Licores",          pt: "Destilados"       },
  "terrace-ceviches":      { en: "Ceviches & Cold",   es: "Ceviches y Frío",  pt: "Ceviches e Frios" },
  "terrace-grill":         { en: "From the Grill",    es: "De la Parrilla",   pt: "Da Grelha"        },
  "terrace-cocktails":     { en: "Cocktails",         es: "Cócteles",         pt: "Coquetéis"        },
  "terrace-wines":         { en: "Wines",             es: "Vinos",            pt: "Vinhos"           },
};

export const MENU_TITLES: Record<string, Record<Locale, string>> = {
  "CATCH MENU":    { en: "CATCH MENU",    es: "MENÚ CATCH",    pt: "CARDÁPIO CATCH"   },
  "OKÜ MENU":      { en: "OKÜ MENU",      es: "MENÚ OKÜ",      pt: "CARDÁPIO OKÜ"     },
  "TERRACE MENU":  { en: "TERRACE MENU",  es: "MENÚ TERRAZA",  pt: "CARDÁPIO TERRAÇO" },
  "CATCH BAR":     { en: "CATCH BAR",     es: "BARRA CATCH",   pt: "BAR CATCH"        },
  "OKÜ BAR":       { en: "OKÜ BAR",       es: "BARRA OKÜ",     pt: "BAR OKÜ"          },
  "TERRACE BAR":   { en: "TERRACE BAR",   es: "BARRA TERRAZA", pt: "BAR TERRAÇO"      },
};

export const MENU_TYPE_LABELS: Record<string, Record<Locale, string>> = {
  food:   { en: "Food",   es: "Comida",  pt: "Comida"   },
  drinks: { en: "Drinks", es: "Bebidas", pt: "Bebidas"  },
};

export const MENU_FOOTER_NOTE: Record<Locale, string> = {
  en: "Prices in USD. Menu items are subject to availability. Dietary requirements can be accommodated — please inform your host.",
  es: "Precios en USD. Los platos están sujetos a disponibilidad. Podemos adaptarnos a requisitos dietéticos — informe a su anfitrión.",
  pt: "Preços em USD. Os itens do cardápio estão sujeitos à disponibilidade. Requisitos alimentares podem ser acomodados — informe seu anfitrião.",
};

export function getSectionTitle(sectionId: string, locale: Locale, fallback: string | LocalizedText): string {
  const resolvedFallback = resolveLocalizedText(fallback, locale);
  return MENU_SECTION_TITLES[sectionId]?.[locale] ?? resolvedFallback;
}

export function getMenuTitle(title: string | LocalizedText, locale: Locale): string {
  const resolvedTitle = resolveLocalizedText(title, locale);
  return MENU_TITLES[resolvedTitle]?.[locale] ?? resolvedTitle;
}

export function getMenuTypeLabel(type: "food" | "drinks", locale: Locale): string {
  return MENU_TYPE_LABELS[type]?.[locale] ?? type;
}
