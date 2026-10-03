import "./globals.css";
import { headers } from "next/headers";
import Script from "next/script";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Providers } from "@/components/Providers";
import { injectedExtensionErrorGuardScript } from "@/lib/clientErrorFilters";

export const metadata = {
  title: "OKÜ Hospitality Group",
  description: "Curated dining experiences, exclusive series, and community events",
  other: {
    "google": "notranslate",
  },
};

const LANG_MAP: Record<string, string> = {
  en: "en",
  es: "es-PA",
  pt: "pt-BR",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [session, headerList] = await Promise.all([
    getServerSession(authOptions).catch(() => null),
    headers(),
  ]);

  const xLocale = headerList.get("x-locale") ?? "en";
  const htmlLang = LANG_MAP[xLocale] ?? "en";

  return (
    <html
      lang={htmlLang}
      translate="no"
      suppressHydrationWarning
    >
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=Inter:wght@100..900&display=swap"
        />
        {/* Chrome extensions execute in the page context. Install this before
            Next's dev overlay so a known MetaMask injection failure cannot be
            misreported as an OKÜ application crash. */}
        <Script
          id="extension-error-guard"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: injectedExtensionErrorGuardScript }}
        />
        {/* Anti-flash: apply saved theme before React hydration */}
        <Script
          id="theme-initializer"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('oku-theme');if(t==='dark')document.documentElement.setAttribute('data-theme','dark');}catch(e){}})();`,
          }}
        />
      </head>
      <body suppressHydrationWarning>
        <Providers session={session}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
