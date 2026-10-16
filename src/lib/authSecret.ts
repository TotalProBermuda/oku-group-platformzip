// Pure/Edge-compatible: used by Node auth, middleware, internal HMACs and readiness.
// Preserve the existing NEXTAUTH_SECRET key when both names are configured.
// Do not trim or rewrite secret bytes: that would invalidate existing sessions.
function configuredAuthSecret(): string | undefined {
  return process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || undefined;
}

// Presence only; never return a secret in readiness payloads.
export function hasConfiguredAuthSecret(): boolean {
  return Boolean(configuredAuthSecret());
}

export function resolveAuthSecret(): string {
  const secret = configuredAuthSecret();
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "NEXTAUTH_SECRET or AUTH_SECRET is required in production. Refusing to boot with an insecure default.",
    );
  }
  return "replace-me";
}
