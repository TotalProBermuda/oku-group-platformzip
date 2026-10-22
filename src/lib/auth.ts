import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import FacebookProvider from "next-auth/providers/facebook";
import { prisma } from "@/lib/prisma";
import { isDemoModeEnabled } from "@/lib/demoMode";
import { resolveAuthSecret } from "@/lib/authSecret";
import { sameSiteForEnv } from "@/lib/cookieSecurity";
import type { NextAuthOptions } from "next-auth";
import { authorizeProductionAccount } from "@/server/auth/productionAccount";
import { consumePasswordlessToken } from "@/server/auth/passwordless";
import type { RoleKey } from "@/types/roles";

const ROLE_KEYS: readonly RoleKey[] = [
  "VISITOR", "ATTENDEE", "INFLUENCER", "PARTNER", "PARTNER_SELLER", "INVESTOR", "REFERRER",
  "STAFF_OKU", "STAFF_CATCH", "ADMIN_COMMERCIAL", "ADMIN_IR", "ADMIN_HR", "ADMIN_FINANCE",
  "SUPERADMIN", "RESTAURANT_HOST", "STREETSIDE_HOST", "FB_DIRECTOR", "RESTAURANT_SUPERVISOR",
];
const isRoleKey = (role: unknown): role is RoleKey =>
  typeof role === "string" && ROLE_KEYS.includes(role as RoleKey);

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
    if (!user || user.status !== "ACTIVE") return null;
    return Object.assign({
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.imageUrl,
      roles: user.roles.map((r) => r.roleKey),
    });
  },
});

const passwordlessCredentialsProvider = CredentialsProvider({
  id: "passwordless",
  name: "Email magic link",
  credentials: {
    token: { label: "Token", type: "text" },
    email: { label: "Email", type: "email" },
  },
  async authorize(credentials) {
    const identity = await consumePasswordlessToken({
      rawToken: credentials?.token ?? "",
      claimedEmail: credentials?.email ?? "",
    });
    if (!identity) return null;
    return Object.assign({
      id: identity.id,
      email: identity.email,
      name: identity.name,
      roles: identity.roles,
      status: identity.status,
      passwordlessDestination: identity.destination,
    });
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
    passwordlessCredentialsProvider,
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
      return jwtEncode({ ...params, salt: "next-auth.session-token" });
    },
    async decode(params) {
      try {
        const { decode: jwtDecode } = await import("next-auth/jwt");
        return await jwtDecode({ ...params, salt: "next-auth.session-token" });
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
    async signIn({ user, account, profile }) {
      if (account?.provider === "credentials") return isDemoModeEnabled();
      if (account?.provider === "passwordless") return true;

      const authorized = await authorizeProductionAccount({
        email: user.email,
        name: user.name,
        image: user.image,
        provider: account?.provider ?? "unknown",
        emailVerified:
          account?.provider === "google"
            ? (profile as { email_verified?: boolean } | undefined)?.email_verified
            : undefined,
      });
      if (!authorized) return false;
      Object.assign(user, authorized);
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        const appUser = user as typeof user & { roles?: unknown; passwordlessDestination?: unknown };
        token.roles = Array.isArray(appUser.roles) ? appUser.roles.filter(isRoleKey) : [];
        if (typeof appUser.passwordlessDestination === "string") {
          token.passwordlessDestination = appUser.passwordlessDestination;
        }
      }
      // Revalidate existing cookies as well as fresh sign-ins. Suspension and
      // role removal must take effect without waiting for a JWT to expire.
      const userId = typeof token.userId === "string" ? token.userId : token.sub;
      if (!userId) return {};
      const current = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, status: true, roles: { select: { roleKey: true } } },
      });
      if (!current || current.status !== "ACTIVE" ||
        (current.email.toLowerCase().endsWith("@oku.local") && !isDemoModeEnabled())) return {};
      token.userId = current.id;
      token.email = current.email;
      token.roles = current.roles.map((role) => role.roleKey).filter(isRoleKey);
      return token;
    },
    async session({ session, token }) {
      if (session.user && typeof token.userId === "string") {
        session.user.id = token.userId;
        session.user.roles = Array.isArray(token.roles) ? token.roles.filter(isRoleKey) : [];
        if (typeof token.passwordlessDestination === "string") {
          session.user.passwordlessDestination = token.passwordlessDestination;
        }
      } else {
        session.user = undefined;
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
