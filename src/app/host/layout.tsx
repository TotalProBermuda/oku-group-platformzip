import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getOptionalSession } from "@/server/auth/session";
import { getTranslations } from "@/i18n/getTranslations";
import { LocaleProvider } from "@/components/i18n/LocaleProvider";
import { isValidLocale, DEFAULT_LOCALE } from "@/i18n/config";
import type { Locale } from "@/types/i18n";

export default async function HostLayout({ children }: { children: React.ReactNode }) {
  const session = await getOptionalSession();
  if (!session) redirect("/login?callbackUrl=/host/dashboard");

  const allowed = ["SUPERADMIN", "RESTAURANT_HOST", "STREETSIDE_HOST"];
  const hasAccess = (session.roles as string[]).some((r) => allowed.includes(r));
  if (!hasAccess) redirect("/login");

  const cookieStore = await cookies();
  const rawLocale = cookieStore.get("oku_locale")?.value ?? DEFAULT_LOCALE;
  const locale: Locale = isValidLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;
  const translations = await getTranslations(locale, ["host", "common"]);

  return (
    <LocaleProvider locale={locale} translations={translations}>
      <div style={{ fontFamily: "var(--font-sans)", minHeight: "100vh", background: "#0d0d0f" }}>
        {children}
      </div>
    </LocaleProvider>
  );
}
