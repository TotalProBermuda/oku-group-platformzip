import { cookies } from "next/headers";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isValidLocale } from "@/i18n/config";
import { getTranslations } from "@/i18n/getTranslations";
import { LocaleProvider } from "@/components/i18n/LocaleProvider";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import type { Locale } from "@/types/i18n";

export default async function MyAccountLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const cookieLocale = jar.get("oku_locale")?.value;
  const locale: Locale = isValidLocale(cookieLocale ?? "") ? (cookieLocale as Locale) : "en";

  const [rawSession, translations] = await Promise.all([
    getServerSession(authOptions),
    getTranslations(locale),
  ]);

  const nav = translations.navigation as Record<string, string>;
  const foot = translations.footer as Record<string, string>;

  const navSession = rawSession?.user
    ? {
        user: {
          name: rawSession.user.name ?? null,
          email: rawSession.user.email ?? null,
          roles: (rawSession.user as Record<string, unknown>)?.roles as string[] ?? [],
        },
      }
    : null;

  return (
    <LocaleProvider locale={locale} translations={translations}>
      <Navbar
        session={navSession}
        locale={locale}
        navLabels={{
          restaurants: nav.restaurants || "Restaurants",
          experiences: nav.experiences || "Experiences",
          membership:  nav.membership  || "Membership",
          careers:     nav.careers     || "Careers",
          signIn:      nav.signIn      || "Sign In",
          signOut:     nav.signOut     || "Sign Out",
        }}
      />
      <main style={{ minHeight: "70vh" }}>{children}</main>
      <Footer
        locale={locale}
        labels={{
          explore: foot.exploreHeading || "Explore",
          seriesEvents: foot.seriesEvents || "Series & Events",
          careers: foot.careers || "Careers",
          signIn: foot.signIn || "Sign In",
          venues: foot.venuesHeading || "Venues",
          tagline: foot.tagline || "Curated dining experiences across our venues.",
          allRightsReserved: foot.allRightsReserved || "All rights reserved.",
        }}
      />
    </LocaleProvider>
  );
}
