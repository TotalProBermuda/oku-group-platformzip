import Link from "next/link";
import NavbarAuth from "./NavbarAuth";
import NavbarMobileMenu from "./NavbarMobileMenu";
import LanguageSwitcher from "./i18n/LanguageSwitcher";
import Brandmark from "./Brandmark";
import type { Locale } from "@/types/i18n";
import { localePath } from "@/i18n/utils";

export type NavSession = {
  user: {
    name: string | null;
    email: string | null;
    roles: string[];
  };
} | null;

interface Props {
  session: NavSession;
  locale?: Locale;
  navLabels?: {
    restaurants: string;
    experiences: string;
    membership: string;
    careers: string;
    signIn?: string;
    signOut?: string;
  };
}

export default function Navbar({ session, locale = "en", navLabels }: Props) {
  const labels = navLabels || {
    restaurants: "Restaurants",
    experiences: "Experiences",
    membership: "Membership",
    careers: "Careers",
    signIn: "Sign In",
    signOut: "Sign Out",
  };

  return (
    <header style={{ position: "sticky", top: 0, background: "rgba(255,255,255,0.97)", backdropFilter: "blur(8px)", borderBottom: "1px solid var(--color-border)", zIndex: 100 }}>
      <nav style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 24px", maxWidth: 1200, margin: "0 auto", height: 64, gap: 16 }}>
        <Link href={`/${locale}`} style={{ display: "flex", alignItems: "center", flexShrink: 0, textDecoration: "none" }}>
          <Brandmark locale={locale} size={28} />
        </Link>

        <div className="nav-desktop" style={{ display: "flex", alignItems: "center", gap: 24, flex: 1, justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            <Link href={localePath(locale, "/restaurants")} className="nav-link">{labels.restaurants}</Link>
            <Link href={localePath(locale, "/experiences")} className="nav-link">{labels.experiences}</Link>
            <Link href={localePath(locale, "/membership")}  className="nav-link">{labels.membership}</Link>
            <Link href={localePath(locale, "/careers")}     className="nav-link">{labels.careers}</Link>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <LanguageSwitcher currentLocale={locale} variant="header" />
            <NavbarAuth session={session} locale={locale} signInLabel={labels.signIn} signOutLabel={labels.signOut} />
          </div>
        </div>

        <div className="nav-mobile-right">
          <LanguageSwitcher currentLocale={locale} variant="header" />
          <NavbarMobileMenu session={session} locale={locale} labels={labels} />
        </div>
      </nav>
    </header>
  );
}
