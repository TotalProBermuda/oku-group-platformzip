import type { MenuSection as MenuSectionType } from "@/data/venues/menus";
import { getLocalizedText } from "@/i18n/getLocalizedText";
import type { Locale } from "@/types/i18n";
import MenuItemRow from "./MenuItemRow";

type Props = { section: MenuSectionType; accent: string; translatedTitle?: string; locale?: Locale };

export default function MenuSection({ section, accent, translatedTitle, locale = "en" }: Props) {
  const description = section.description ? getLocalizedText(section.description, locale) : undefined;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 16, paddingBottom: 10, borderBottom: `2px solid ${accent}` }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: accent }}>
          {translatedTitle ?? getLocalizedText(section.title, locale)}
        </div>
        {description && (
          <div style={{ fontSize: 11, color: "#9a9088", fontStyle: "italic" }}>{description}</div>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {section.items.map(item => (
          <MenuItemRow key={item.id} item={item} accent={accent} locale={locale} />
        ))}
      </div>
    </div>
  );
}
