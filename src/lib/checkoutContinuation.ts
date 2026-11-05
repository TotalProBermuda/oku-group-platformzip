/** Browser coordination only. The server remains the authority on payment. */
export function createCheckoutContinuation() {
  let busy = false;
  const returnedChallenges = new Set<string>();
  return {
    begin() { if (busy) return false; busy = true; return true; },
    finish() { busy = false; },
    claimReturn(id: string) {
      if (!id || busy || returnedChallenges.has(id)) return false;
      returnedChallenges.add(id);
      return true;
    },
  };
}

export function isVerificationReturn(event: { origin: string; source: unknown; data: unknown }, origin: string, frame: unknown) {
  return Boolean(frame) && event.source === frame && event.origin === origin &&
    (event.data as { type?: string } | null)?.type === "oku-3ds-complete";
}

export function isConfirmedCheckout(status: number, body: unknown): boolean {
  if (status !== 200 || !body || typeof body !== "object") return false;
  const response = body as { ok?: unknown; data?: unknown };
  if (response.ok !== true || !response.data || typeof response.data !== "object") return false;
  const data = response.data as { orderId?: unknown };
  return typeof data.orderId === "string" && data.orderId.length > 0;
}
