import { getMenusForSeries } from "@/server/menus/menuService";
import type { Locale } from "@/types/i18n";

function pickLocalized(value: any, locale: Locale): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value[locale] || value.en || Object.values(value).find(Boolean) || "";
}

const HEADINGS: Record<Locale, { sectionTitle: string; food: string; drinks: string }> = {
  en: { sectionTitle: "Menu",  food: "Food",     drinks: "Drinks"   },
  es: { sectionTitle: "Menú",  food: "Comida",   drinks: "Bebidas"  },
  pt: { sectionTitle: "Menu",  food: "Comida",   drinks: "Bebidas"  },
};

export default async function EventMenusSection({
  seriesId,
  locale,
}: { seriesId: string; locale: Locale }) {
  const menus = await getMenusForSeries(seriesId);
  if (menus.length === 0) return null;

  const labels = HEADINGS[locale] ?? HEADINGS.en;

  return (
    <section style={{ marginBottom: 48 }}>
      <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 26, fontWeight: 400, color: "#1a1614", marginBottom: 16 }}>
        {labels.sectionTitle}
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        {menus.map((menu: any) => {
          const intro = pickLocalized(menu.intro, locale);
          // shapeMenu normalizes menuType to lowercase ("food" | "drinks").
          const typeLabel = String(menu.menuType).toLowerCase() === "drinks" ? labels.drinks : labels.food;
          return (
            <div key={menu.id ?? menu.title} style={{ background: "white", border: "1px solid #e5e0d8", borderRadius: 14, padding: "24px 28px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#9a8f85", marginBottom: 6 }}>
                {typeLabel}
              </div>
              <h3 style={{ fontFamily: "var(--font-heading)", fontSize: 22, fontWeight: 400, color: "#1a1614", marginBottom: 4 }}>
                {pickLocalized(menu.title ?? menu.menuTitle, locale)}
              </h3>
              {intro && <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 18, lineHeight: 1.6 }}>{intro}</p>}

              {menu.pdfUrl && (
                <a
                  href={menu.pdfUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{ display: "inline-block", marginBottom: 16, fontSize: 13, color: "#c41e3a", fontWeight: 600 }}
                >
                  {locale === "es" ? "Ver PDF" : locale === "pt" ? "Ver PDF" : "View PDF"} ↗
                </a>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                {(menu.sections ?? []).map((section: any, sIdx: number) => (
                  <div key={section.id ?? sIdx}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#1a1614", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
                      {pickLocalized(section.title, locale)}
                    </div>
                    {pickLocalized(section.subtitle, locale) && (
                      <div style={{ fontSize: 12, color: "#9a8f85", marginBottom: 8, fontStyle: "italic" }}>
                        {pickLocalized(section.subtitle, locale)}
                      </div>
                    )}
                    {pickLocalized(section.description, locale) && (
                      <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 10, lineHeight: 1.5 }}>
                        {pickLocalized(section.description, locale)}
                      </p>
                    )}
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {(section.items ?? []).filter((it: any) => it.isAvailable !== false).map((item: any, iIdx: number) => (
                        <div key={item.id ?? iIdx} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16, paddingBottom: 8, borderBottom: "1px dotted #ece6df" }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1614" }}>
                              {pickLocalized(item.name, locale)}
                            </div>
                            {pickLocalized(item.description, locale) && (
                              <div style={{ fontSize: 12, color: "#7d7269", marginTop: 2, lineHeight: 1.4 }}>
                                {pickLocalized(item.description, locale)}
                              </div>
                            )}
                            {Array.isArray(item.dietary) && item.dietary.length > 0 && (
                              <div style={{ fontSize: 10, color: "#9a8f85", marginTop: 4, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                                {item.dietary.join(" · ")}
                              </div>
                            )}
                          </div>
                          {item.price != null && (
                            <div style={{ fontSize: 14, fontWeight: 700, color: "#1a1614", flexShrink: 0 }}>
                              {typeof item.price === "number" ? `$${(item.price / 100).toFixed(2)}` : item.price}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
