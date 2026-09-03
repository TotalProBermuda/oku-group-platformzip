import { cookies } from "next/headers";
import { Suspense } from "react";
import { isValidLocale } from "@/i18n/config";
import { getTranslations } from "@/i18n/getTranslations";
import { LocaleProvider } from "@/components/i18n/LocaleProvider";
import { LoginContent } from "./LoginContent";
import { isDemoModeEnabled } from "@/lib/demoMode";
import type { Locale } from "@/types/i18n";

export default async function LoginPage() {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get("oku_locale")?.value;
  const locale: Locale = isValidLocale(cookieLocale ?? "") ? (cookieLocale as Locale) : "en";
  const translations = await getTranslations(locale, ["auth", "common"]);

  // Server-side check — process.env.DEMO_MODE_ENABLED is not exposed to the
  // client bundle, so we evaluate the gate here and pass the result down.
  // The demo-login API route also re-checks this, so the gate is fail-closed
  // even if the prop is tampered with on the wire.
  const demoEnabled = isDemoModeEnabled();
  const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

  return (
    <LocaleProvider locale={locale} translations={translations}>
      <Suspense
        fallback={
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "60vh" }}>
            <div className="loading-dots"><span /><span /><span /></div>
          </div>
        }
      >
        <LoginContent demoEnabled={demoEnabled} googleEnabled={googleEnabled} />
      </Suspense>
    </LocaleProvider>
  );
}
