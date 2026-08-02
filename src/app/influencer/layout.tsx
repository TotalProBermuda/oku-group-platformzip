import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isValidLocale } from "@/i18n/config";
import { getTranslations } from "@/i18n/getTranslations";
import { LocaleProvider } from "@/components/i18n/LocaleProvider";
import Navbar from "@/components/Navbar";
import PortalNav from "@/components/PortalNav";
import ProfileCompletionBanner from "@/components/influencer/ProfileCompletionBanner";
import type { Locale } from "@/types/i18n";

export default async function InfluencerLayout({ children }: { children: React.ReactNode }) {
  const headersList = await headers();
  const pathname = headersList.get("x-pathname") ?? "";

  // Public pages under /influencer that don't need auth
  if (pathname.startsWith("/influencer/accept-invite")) {
    return <>{children}</>;
  }

  const session = await getServerSession(authOptions);
  const roles: string[] = (session?.user as any)?.roles ?? [];

  if (!session || (!roles.includes("INFLUENCER") && !roles.includes("SUPERADMIN"))) {
    redirect("/login?callbackUrl=/influencer/dashboard");
  }

  const jar = await cookies();
  const cookieLocale = jar.get("oku_locale")?.value;
  const locale: Locale = isValidLocale(cookieLocale ?? "") ? (cookieLocale as Locale) : "en";

  const translations = await getTranslations(locale, [
    "common", "navigation", "footer", "home", "venues", "booking", "forms", "seo", "admin", "host", "referrals",
  ]);
  const nav = translations.navigation as Record<string, string>;

  const navSession = {
    user: {
      name:  session.user?.name  ?? null,
      email: session.user?.email ?? null,
      roles,
    },
  };

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
      <PortalNav title="Influencer Portal" />
      <ProfileCompletionBanner />
      <main style={{ minHeight: "70vh", background: "var(--color-bg)" }}>{children}</main>
    </LocaleProvider>
  );
}
