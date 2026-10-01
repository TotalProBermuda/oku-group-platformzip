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

export function isConfirmedCheckout(status: number, body: any): boolean {
  return status === 200 && body?.ok === true && typeof body?.data?.orderId === "string" && Boolean(body.data.orderId);
}
