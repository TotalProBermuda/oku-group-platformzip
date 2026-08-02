import type { Locale } from "@/types/i18n";

const TAGLINE: Record<Locale, { line1: string; line2: string }> = {
  en: { line1: "HOSPITALITY", line2: "GROUP" },
  es: { line1: "GRUPO", line2: "HOTELERO" },
  pt: { line1: "GRUPO", line2: "HOTELEIRO" },
};

interface Props {
  locale?: Locale;
  size?: number;
  color?: string;
  taglineColor?: string;
  dividerColor?: string;
  showTagline?: boolean;
}

export default function Brandmark({
  locale = "en",
  size = 28,
  color = "#c41e3a",
  taglineColor = "#3d3633",
  dividerColor = "rgba(0,0,0,0.18)",
  showTagline = true,
}: Props) {
  const tagline = TAGLINE[locale] ?? TAGLINE.en;
  const taglineSize = Math.max(8, Math.round(size * 0.32));
  const dividerHeight = Math.round(size * 1.05);
  const gap = Math.round(size * 0.42);

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap,
        lineHeight: 1,
        whiteSpace: "nowrap",
      }}
      aria-label="OKÜ Hospitality Group"
    >
      <span
        style={{
          color,
          fontFamily: '"Playfair Display", Georgia, "Times New Roman", serif',
          fontWeight: 700,
          fontSize: size,
          letterSpacing: "0.01em",
          lineHeight: 1,
        }}
      >
        OKÜ
      </span>
      {showTagline && (
        <>
          <span
            aria-hidden
            style={{
              display: "inline-block",
              width: 1,
              height: dividerHeight,
              background: dividerColor,
            }}
          />
          <span
            style={{
              display: "inline-flex",
              flexDirection: "column",
              alignItems: "flex-start",
              color: taglineColor,
              fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif',
              fontWeight: 600,
              fontSize: taglineSize,
              letterSpacing: "0.16em",
              lineHeight: 1.15,
            }}
          >
            <span>{tagline.line1}</span>
            <span>{tagline.line2}</span>
          </span>
        </>
      )}
    </span>
  );
}
