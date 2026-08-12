import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isValidLocale } from "@/i18n/config";
import { getTranslations } from "@/i18n/getTranslations";
import { LocaleProvider } from "@/components/i18n/LocaleProvider";
import Navbar from "@/components/Navbar";
import AdminShell from "@/components/AdminShell";
import type { Locale } from "@/types/i18n";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login?callbackUrl=/admin");

  const roles: string[] = (session.user as any)?.roles ?? [];
  const adminRoles = ["SUPERADMIN", "FB_DIRECTOR", "ADMIN_COMMERCIAL", "ADMIN_IR", "ADMIN_HR", "ADMIN_FINANCE"];
  if (!roles.some((r) => adminRoles.includes(r))) {
    redirect("/login?callbackUrl=/admin");
  }

  const jar = await cookies();
  const cookieLocale = jar.get("oku_locale")?.value;
  const locale: Locale = isValidLocale(cookieLocale ?? "") ? (cookieLocale as Locale) : "en";

  const translations = await getTranslations(locale, [
    "common", "navigation", "footer", "home", "venues", "booking", "forms", "seo", "admin", "analytics", "attendance", "checkin", "referrals",
  ]);
  const nav = translations.navigation as Record<string, string>;
  const c   = translations.common   as Record<string, string>;
  const adm = translations.admin    as import("@/i18n/translationsData").AdminTranslations;

  const navSession = {
    user: {
      name:  session.user.name  ?? null,
      email: session.user.email ?? null,
      roles,
    },
  };

  const navLabels = {
    administration: c.administration        || "Administration",
    adminConsole:   c.adminConsole          || "Admin Console",
    overview:       c.adminNavOverview      || "Overview",
    experiences:    c.adminNavExperiences   || "Experiences",
    series:         adm.series             || "Series",
    entities:       adm.entities            || "Entities",
    profiles:       adm.profiles            || "Profiles",
    accounts:       adm.accounts            || "Accounts",
    sponsorship:    adm.sponsorship         || "Sponsorship",
    analytics:      c.adminNavAnalytics     || "Analytics",
    orders:         c.adminNavOrders        || "Orders",
    users:          c.adminNavUsers         || "Users",
    memberships:    c.adminNavMemberships   || "Memberships",
    menus:          adm.menus               || "Menus",
    payouts:        c.adminNavPayouts       || "Payouts",
    irDocuments:    c.adminNavIRDocuments   || "IR Documents",
    hr:             c.adminNavHR            || "HR",
    hiring:         c.adminNavHiring        || "Hiring",
    compensation:   c.adminNavCompensation  || "Compensation",
    partners:       c.adminNavPartners      || "Partners",
    scorecards:     c.adminNavScorecards    || "Scorecards",
    commissionRules: "Commission Rules",
    launchReadiness:        adm.launchReadiness?.navLabel              || "Launch Readiness",
    referralMergeConflicts: (translations.referrals as Record<string, Record<string, string>> | undefined)?.mergeConflicts?.navLabel || "Referral Merge Conflicts",
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
      <AdminShell roles={roles} navLabels={navLabels}>
        {children}
      </AdminShell>
    </LocaleProvider>
  );
}
