import "./globals.css";
import { Inter, Cormorant_Garamond } from "next/font/google";
import { headers } from "next/headers";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Providers } from "@/components/Providers";

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
      <head>
        {/* Anti-flash: apply saved theme before React hydration */}
        <script
          suppressHydrationWarning
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
