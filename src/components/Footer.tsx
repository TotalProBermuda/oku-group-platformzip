import Link from "next/link";
import LanguageSwitcher from "./i18n/LanguageSwitcher";
import type { Locale } from "@/types/i18n";
import { localePath } from "@/i18n/utils";

interface Props {
  locale?: Locale;
  labels?: {
    explore: string;
    seriesEvents: string;
    careers: string;
    signIn: string;
    venues: string;
    tagline: string;
    allRightsReserved: string;
  };
}

export default function Footer({ locale = "en", labels }: Props) {
  const year = new Date().getFullYear();
  const l = labels || {
    explore: "Explore",
    seriesEvents: "Series & Events",
    careers: "Careers",
    signIn: "Sign In",
    venues: "Venues",
    tagline: "Curated dining experiences, exclusive series, and community events across our venues.",
    allRightsReserved: "All rights reserved.",
  };

  return (
    <footer className="footer">
      <div className="footer-inner">
        <div>
          <div className="footer-brand">OKÜ Hospitality Group</div>
          <div className="footer-tagline">{l.tagline}</div>
          <div style={{ marginTop: 20 }}>
            <LanguageSwitcher currentLocale={locale} variant="footer" />
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.3)", marginBottom: 12 }}>{l.explore}</div>
          <div className="footer-links">
            <Link href={localePath(locale, "/series")}   className="footer-link">{l.seriesEvents}</Link>
            <Link href={localePath(locale, "/careers")}  className="footer-link">{l.careers}</Link>
            <Link href={localePath(locale, "/login")}    className="footer-link">{l.signIn}</Link>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.3)", marginBottom: 12 }}>{l.venues}</div>
          <div className="footer-links">
            <Link href={localePath(locale, "/restaurants/oku")}     className="footer-link">OKÜ</Link>
            <Link href={localePath(locale, "/restaurants/catch")}   className="footer-link">CATCH</Link>
            <Link href={localePath(locale, "/restaurants/terrace")} className="footer-link">TERRACE</Link>
          </div>
        </div>
      </div>
      <div className="footer-copy" suppressHydrationWarning>
        © {year} OKÜ Hospitality Group. {l.allRightsReserved} · Platform Demo
      </div>
    </footer>
  );
}
