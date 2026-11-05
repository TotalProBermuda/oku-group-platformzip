type ExchangeDependencies = {
  signOut: () => Promise<unknown>;
  signIn: () => Promise<{ ok?: boolean; url?: string | null } | undefined>;
  getSession: () => Promise<{ user?: { passwordlessDestination?: string } } | null>;
};

/** Never retry a one-time credential automatically after an uncertain response. */
export async function exchangePasswordlessLink(deps: ExchangeDependencies): Promise<
  { ok: true; destination: string } | { ok: false; reason: "INVALID_LINK" | "CONNECTION" }
> {
  try {
    await deps.signOut();
    const result = await deps.signIn();
    if (!result?.ok || !result.url) return { ok: false, reason: "INVALID_LINK" };
    const session = await deps.getSession();
    if (!session?.user) return { ok: false, reason: "CONNECTION" };
    const path = session.user.passwordlessDestination ?? "/my";
    // Session callback also enforces roles; this is a defensive local-path check.
    const destination = path.startsWith("/") && !path.startsWith("//") && !/[\\\r\n]/.test(path) ? path : "/my";
    return { ok: true, destination };
  } catch {
    return { ok: false, reason: "CONNECTION" };
  }
}
