import { getFoodMenuByVenue, getDrinksMenuByVenue, type VenueMenu } from "@/data/venues/menus";
import type { Locale } from "@/types/i18n";
import MenuBlock from "./MenuBlock";

export type MenuVenueSlug = "oku" | "catch" | "terrace";

const VENUE_THEME: Record<MenuVenueSlug, { accent: string; accentLight: string; label: string }> = {
  oku:     { accent: "#1a1614", accentLight: "#f5f2ef", label: "OKÜ" },
  catch:   { accent: "#1e3a5f", accentLight: "#f0f4f8", label: "CATCH" },
  terrace: { accent: "#2d4a1e", accentLight: "#f2f5f0", label: "TERRACE" },
};

const HEADING_FALLBACK: Record<Locale, { menu: string; food: string; drinks: string; unavailable: string }> = {
  en: { menu: "Menu",  food: "Food Menu",   drinks: "Drinks",  unavailable: "Menu unavailable." },
  es: { menu: "Menú",  food: "Menú de Comida", drinks: "Bebidas", unavailable: "Menú no disponible." },
  pt: { menu: "Menu",  food: "Cardápio",    drinks: "Bebidas", unavailable: "Menu indisponível." },
};

type Props = {
  venueSlug: MenuVenueSlug;
  locale?: Locale;
  variant?: "page" | "embedded";
  showVenueHeading?: boolean;
  accent?: string;
  accentLight?: string;
  headingLabel?: string;
  drinksLabel?: string;
  unavailableLabel?: string;
  background?: string;
  /** Optional pre-fetched menus (server components pass DB-backed data here). */
  foodMenu?: VenueMenu | null;
  drinksMenu?: VenueMenu | null;
};

export default function MenuView({
  venueSlug,
  locale = "en",
  variant = "embedded",
  showVenueHeading = false,
  accent,
  accentLight,
  headingLabel,
  drinksLabel,
  unavailableLabel,
  background,
  foodMenu: foodMenuProp,
  drinksMenu: drinksMenuProp,
}: Props) {
  const theme = VENUE_THEME[venueSlug];
  const fallbacks = HEADING_FALLBACK[locale] ?? HEADING_FALLBACK.en;
  const usedAccent = accent ?? theme.accent;
  const usedAccentLight = accentLight ?? theme.accentLight;
  // Prefer caller-provided (DB-backed) menus; fall back to the static file
  // for client/lazy contexts that haven't been migrated to fetch from /api/v1/menus yet.
  const foodMenu = foodMenuProp !== undefined ? foodMenuProp : getFoodMenuByVenue(venueSlug);
  const drinksMenu = drinksMenuProp !== undefined ? drinksMenuProp : getDrinksMenuByVenue(venueSlug);

  const wrapperPadding = variant === "page" ? "32px 24px" : "16px";
  const maxWidth = variant === "page" ? 960 : "100%";
  const wrapperBg = background ?? "#faf8f6";

  return (
    <div style={{ background: wrapperBg, padding: wrapperPadding, borderRadius: variant === "embedded" ? 12 : 0 }}>
      <div style={{ maxWidth, margin: "0 auto" }}>
        {showVenueHeading && (
          <div style={{ marginBottom: 24, paddingBottom: 16, borderBottom: `1px solid ${usedAccent}22` }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: usedAccent }}>
              {headingLabel ?? fallbacks.menu}
            </div>
            <div style={{ fontFamily: "var(--font-heading)", fontSize: 26, color: "#1f1a17", letterSpacing: "-0.03em", marginTop: 4 }}>
              {theme.label}
            </div>
          </div>
        )}

        {foodMenu ? (
          <MenuBlock menu={foodMenu} accent={usedAccent} accentLight={usedAccentLight} locale={locale} />
        ) : (
          <div style={{ fontSize: 13, color: "#7d7269", fontStyle: "italic", padding: "32px 0" }}>
            {unavailableLabel ?? fallbacks.unavailable}
          </div>
        )}

        {drinksMenu && (
          <div style={{ marginTop: 32 }}>
            {drinksLabel && (
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: usedAccent, marginBottom: 12 }}>
                {drinksLabel}
              </div>
            )}
            <MenuBlock menu={drinksMenu} accent={usedAccent} accentLight={usedAccentLight} locale={locale} />
          </div>
        )}
      </div>
    </div>
  );
}
