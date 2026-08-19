import "./globals.css";
import { Inter, Cormorant_Garamond } from "next/font/google";
import { headers } from "next/headers";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Providers } from "@/components/Providers";
import { injectedExtensionErrorGuardScript } from "@/lib/clientErrorFilters";
import Script from "next/script";

const inter = Inter({
  subsets: ["latin"],
  variable: "--inter",
  display: "swap",
});

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--cormorant",
  display: "swap",
});

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
      className={`${inter.variable} ${cormorant.variable}`}
    >
      <body suppressHydrationWarning>
        {/* Chrome extensions execute in the page context. Install this before
            Next's dev overlay so a known MetaMask injection failure cannot be
            misreported as an OKÜ application crash. Using next/script
            beforeInteractive keeps these scripts outside React's hydration
            reconciliation, avoiding the <head> structural mismatch that an
            explicit <head> element causes in App Router. */}
        <Script
          id="metamask-guard"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: injectedExtensionErrorGuardScript }}
        />
        {/* Anti-flash: apply saved theme before React hydration */}
        <Script
          id="theme-anti-flash"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('oku-theme');if(t==='dark')document.documentElement.setAttribute('data-theme','dark');}catch(e){}})();`,
          }}
        />
        <Providers session={session}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
