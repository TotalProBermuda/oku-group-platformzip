// Centralized NextAuth secret resolution. Fail-closed in production so a
// missing NEXTAUTH_SECRET cannot silently degrade to a known placeholder
// that would let an attacker forge signed session cookies. Used by both
// authOptions (src/lib/auth.ts) and the demo-login bypass route
// (src/app/api/auth/demo-login/route.ts) so the policy lives in one place.
export function resolveAuthSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (secret && secret.length > 0) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "NEXTAUTH_SECRET is required in production. Refusing to boot with an insecure default.",
    );
  }
  return "replace-me";
}
