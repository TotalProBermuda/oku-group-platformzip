import type { MenuItem } from "@/data/venues/menus";
import type { Locale } from "@/types/i18n";
import { getLocalizedText } from "@/i18n/getLocalizedText";
import type { LocalizedText } from "@/types/i18n";

type Props = { item: MenuItem; accent: string; locale?: Locale };

function resolveText(value: string | LocalizedText | undefined, locale: Locale): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  return getLocalizedText(value, locale);
}

export default function MenuItemRow({ item, accent, locale = "en" }: Props) {
  const name = resolveText(item.name, locale);
  const description = item.description ? resolveText(item.description, locale) : undefined;

  return (
    <div style={{ paddingBottom: 14, borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16 }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: "#1f1a17", lineHeight: 1.3 }}>
          {name}
          {item.dietary && item.dietary.length > 0 && item.dietary.map(d => (
            <span key={d} style={{ marginLeft: 8, fontSize: 9, color: accent, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", verticalAlign: "middle" }}>
              {d}
            </span>
          ))}
          {item.tags && item.tags.map(t => (
            <span key={t} style={{ marginLeft: 8, fontSize: 9, color: "#7d7269", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", verticalAlign: "middle" }}>
              {t}
            </span>
          ))}
        </div>
        {item.price && (
          <div style={{ fontSize: 13, color: "#7d7269", fontWeight: 500, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
            {item.price}
          </div>
        )}
      </div>
      {description && (
        <div style={{ fontSize: 12, color: "#9a9088", lineHeight: 1.6, marginTop: 3 }}>
          {description}
        </div>
      )}
    </div>
  );
}
