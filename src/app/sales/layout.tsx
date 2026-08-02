import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { isValidLocale } from "@/i18n/config";
import { getTranslations } from "@/i18n/getTranslations";
import { LocaleProvider } from "@/components/i18n/LocaleProvider";
import Navbar from "@/components/Navbar";
import PortalNav from "@/components/PortalNav";
import { prisma } from "@/lib/prisma";
import { getOptionalSession } from "@/server/auth/session";
import type { Locale } from "@/types/i18n";

export default async function SalesLayout({ children }: { children: React.ReactNode }) {
  const auth = await getOptionalSession();
  if (!auth) {
    redirect("/login?callbackUrl=/sales");
  }
  const { session, userId, roles } = auth;

  // Gate: must hold at least one ACTIVE partner-anchored referrer assignment.
  const has = await prisma.eventReferrerAssignment.findFirst({
    where: {
      assignedUserId: userId,
      parentPartnerId: { not: null },
      status: "ACTIVE",
    },
    select: { id: true },
  });
  if (!has && !roles.includes("SUPERADMIN")) {
    redirect("/account");
  }

  const jar = await cookies();
  const cookieLocale = jar.get("oku_locale")?.value;
  const locale: Locale = isValidLocale(cookieLocale ?? "") ? (cookieLocale as Locale) : "en";

  const translations = await getTranslations(locale, [
    "common", "navigation", "footer",
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
      <PortalNav title="Sales Portal" />
      <main style={{ minHeight: "70vh", background: "var(--color-bg)" }}>{children}</main>
    </LocaleProvider>
  );
}
