import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isValidLocale } from "@/i18n/config";
import { getTranslations } from "@/i18n/getTranslations";
import { LocaleProvider } from "@/components/i18n/LocaleProvider";
import LanguageModal from "@/components/i18n/LanguageModal";
import { LocaleErrorBoundary } from "@/components/LocaleErrorBoundary";
import { GlobalClientErrorHandlers } from "@/components/GlobalClientErrorHandlers";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PublicChatbot from "@/components/chat/PublicChatbot";
import type { Locale } from "@/types/i18n";
import { SUPPORTED_LOCALES } from "@/types/i18n";

interface Props {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}

export async function generateStaticParams() {
  return SUPPORTED_LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const safeLocale = isValidLocale(locale) ? locale as Locale : "en";
  const t = await getTranslations(safeLocale, ["seo"]);
  const seo = t.seo as Record<string, string>;

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://okugroup.com";
  const alternates: Record<string, string> = {};
  for (const loc of SUPPORTED_LOCALES) {
    alternates[loc] = `${baseUrl}/${loc}`;
  }

  return {
    title: {
      default: seo.siteTitle || "OKÜ Hospitality Group",
      template: `%s — OKÜ Hospitality Group`,
    },
    description: seo.siteDescription,
    alternates: {
      canonical: `${baseUrl}/${safeLocale}`,
      languages: alternates,
    },
    openGraph: {
      type: "website",
      locale: safeLocale === "es" ? "es_PA" : safeLocale === "pt" ? "pt_BR" : "en_US",
      siteName: "OKÜ Hospitality Group",
    },
  };
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!isValidLocale(locale)) notFound();
  const safeLocale = locale as Locale;

  const [rawSession, translations] = await Promise.all([
    getServerSession(authOptions).catch(() => null),
    getTranslations(safeLocale),
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
    <LocaleProvider locale={safeLocale} translations={translations}>
      <GlobalClientErrorHandlers />
      <LanguageModal />
      <Navbar
        session={navSession}
        locale={safeLocale}
        navLabels={{
          restaurants: nav.restaurants || "Restaurants",
          experiences: nav.experiences || "Experiences",
          membership: nav.membership || "Membership",
          careers: nav.careers || "Careers",
          signIn: nav.signIn || "Sign In",
          signOut: nav.signOut || "Sign Out",
        }}
      />
      <main style={{ minHeight: "70vh" }}>
        <LocaleErrorBoundary locale={safeLocale}>{children}</LocaleErrorBoundary>
      </main>
      <Footer
        locale={safeLocale}
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
      <PublicChatbot />
    </LocaleProvider>
  );
}
