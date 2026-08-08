"use client";
import { SessionProvider } from "next-auth/react";
import type { Session } from "next-auth";
import { ThemeProvider } from "@/contexts/ThemeContext";

if (typeof window !== "undefined") {
  import("next-auth/react").then((mod: any) => {
    if (typeof mod.setLogger === "function") {
      mod.setLogger({
        error: (code: string, ...rest: unknown[]) => {
          if (code === "CLIENT_FETCH_ERROR" || code === "JWT_SESSION_ERROR") return;
          // eslint-disable-next-line no-console
          console.error("[next-auth]", code, ...rest);
        },
        warn: () => {},
        debug: () => {},
      });
    }
  });
}

export function Providers({ children, session }: { children: React.ReactNode; session: Session | null }) {
  return (
    <SessionProvider
      session={session}
      refetchOnWindowFocus={false}
      refetchInterval={0}
    >
      <ThemeProvider>{children}</ThemeProvider>
    </SessionProvider>
  );
}
