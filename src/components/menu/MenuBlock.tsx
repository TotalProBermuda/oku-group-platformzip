import type { VenueMenu } from "@/data/venues/menus";
import { getSectionTitle, getMenuTitle, getMenuTypeLabel, MENU_FOOTER_NOTE } from "@/data/menuTranslations";
import { getLocalizedText } from "@/i18n/getLocalizedText";
import type { Locale } from "@/types/i18n";
import MenuSection from "./MenuSection";

type Props = { menu: VenueMenu; accent: string; accentLight: string; locale?: Locale };

export default function MenuBlock({ menu, accent, accentLight, locale = "en" }: Props) {
  const isFood = menu.menuType === "food";
  const cols = isFood && menu.sections.length > 4 ? 2 : 1;
  const typeLabel = getMenuTypeLabel(menu.menuType, locale);
  const menuTitle = getMenuTitle(menu.menuTitle, locale);
  const intro = menu.intro ? getLocalizedText(menu.intro, locale) : undefined;

  return (
    <div style={{ marginBottom: 72 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 12 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "#7d7269" }}>
          {typeLabel}
        </div>
        <div style={{ flex: 1, height: 1, background: "#e8e2dd" }} />
      </div>

      <div style={{ fontFamily: "var(--font-heading)", fontSize: "clamp(26px, 4vw, 40px)", color: "#1f1a17", letterSpacing: "-0.03em", marginBottom: intro ? 12 : 36, lineHeight: 1.05 }}>
        {menuTitle}
      </div>

      {intro && (
        <div style={{ fontSize: 14, color: "#7d7269", lineHeight: 1.7, maxWidth: 640, marginBottom: 40, fontStyle: "italic" }}>
          {intro}
        </div>
      )}

      <div style={{
        display: "grid",
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gap: "40px 64px",
      }}>
        {menu.sections.map(section => (
          <MenuSection
            key={section.id}
            section={section}
            accent={accent}
            locale={locale}
            translatedTitle={getSectionTitle(section.id, locale, section.title)}
          />
        ))}
      </div>

      <div style={{ marginTop: 32, padding: "14px 20px", background: accentLight, border: `1px solid ${accent}18`, borderRadius: 10, fontSize: 11, color: "#7d7269", fontStyle: "italic" }}>
        {MENU_FOOTER_NOTE[locale]}
      </div>
    </div>
  );
}
