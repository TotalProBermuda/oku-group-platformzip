import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import FacebookProvider from "next-auth/providers/facebook";
import { prisma } from "@/lib/prisma";
import { isDemoModeEnabled } from "@/lib/demoMode";
import { resolveAuthSecret } from "@/lib/authSecret";
import { sameSiteForEnv } from "@/lib/cookieSecurity";
import type { NextAuthOptions } from "next-auth";

const useSecureCookies = !!process.env.REPLIT_DEV_DOMAIN || process.env.NODE_ENV === "production";

// Demo back-door: legacy passwordless CredentialsProvider that signs any
// existing user in by email alone. Hard-gated to non-production AND
// DEMO_MODE_ENABLED=true AND @oku.local emails (the seed-user domain). Outside
// those conditions it is not registered at all, so production attackers cannot
// reach it even with a known SUPERADMIN email.
const demoCredentialsProvider = CredentialsProvider({
  name: "Demo Login",
  credentials: {
    email: { label: "Email", type: "email" },
  },
  async authorize(credentials) {
    if (!isDemoModeEnabled()) return null;
    const email = typeof credentials?.email === "string" ? credentials.email.trim().toLowerCase() : "";
    if (!email || !email.endsWith("@oku.local")) return null;
    const user = await prisma.user.findUnique({
      where: { email },
      include: { roles: true },
    });
    if (!user) return null;
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.imageUrl,
      roles: user.roles.map((r) => r.roleKey),
    } as any;
  },
});

export const authOptions: NextAuthOptions = {
  secret: resolveAuthSecret(),
  logger: {
    error(code, metadata) {
      // JWT_SESSION_ERROR fires when a stale/invalid cookie is present.
      // Both layouts already handle it via .catch(() => null) so suppress it.
      if (code === "JWT_SESSION_ERROR") return;
      console.error("[next-auth]", code, metadata);
    },
  },
  providers: [
    ...(isDemoModeEnabled() ? [demoCredentialsProvider] : []),
    ...(process.env.GOOGLE_CLIENT_ID
      ? [GoogleProvider({ clientId: process.env.GOOGLE_CLIENT_ID!, clientSecret: process.env.GOOGLE_CLIENT_SECRET! })]
      : []),
    ...(process.env.FACEBOOK_CLIENT_ID
      ? [FacebookProvider({ clientId: process.env.FACEBOOK_CLIENT_ID!, clientSecret: process.env.FACEBOOK_CLIENT_SECRET! })]
      : []),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  jwt: {
    async encode(params) {
      const { encode: jwtEncode } = await import("next-auth/jwt");
      return jwtEncode({ ...params, salt: "next-auth.session-token" } as any);
    },
    async decode(params) {
      try {
        const { decode: jwtDecode } = await import("next-auth/jwt");
        return await jwtDecode({ ...params, salt: "next-auth.session-token" } as any);
      } catch {
        return null;
      }
    },
  },
  cookies: {
    sessionToken: {
      name: `next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: sameSiteForEnv(),
        path: "/",
        secure: useSecureCookies,
      },
    },
    callbackUrl: {
      name: `next-auth.callback-url`,
      options: {
        sameSite: sameSiteForEnv(),
        path: "/",
        secure: useSecureCookies,
      },
    },
    csrfToken: {
      name: `next-auth.csrf-token`,
      options: {
        httpOnly: true,
        sameSite: sameSiteForEnv(),
        path: "/",
        secure: useSecureCookies,
      },
    },
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.roles = (user as any).roles ?? [];
      }
      return token;
    },
    async session({ session, token }: any) {
      if (token?.userId) {
        session.user.id = token.userId;
        session.user.roles = token.roles ?? [];
      }
      return session;
    },
    async redirect({ url, baseUrl }) {
      const replitDomain = process.env.REPLIT_DEV_DOMAIN;
      if (replitDomain) {
        const fix = (u: string) =>
          u.replace(/https?:\/\/(0\.0\.0\.0|localhost):\d+/, `https://${replitDomain}`);
        baseUrl = fix(baseUrl);
        url = fix(url);
      }
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      try {
        if (new URL(url).hostname === new URL(baseUrl).hostname) return url;
      } catch {}
      return baseUrl;
    },
  },
};
