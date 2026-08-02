/**
 * Payments P5 — Adapter factory + active-checkout adapter resolution.
 *
 * Use `getProviderAdapter(provider)` for refund/void routing keyed by the
 * persisted `Payment.provider`.
 *
 * Use `getActiveCheckoutAdapter()` only at the checkout-confirm entrypoint —
 * it reads `CommerceSettings.activeCheckoutGateway` and returns the adapter
 * for new charges. Refunds/voids must NEVER call this.
 */
import { authNetAdapter } from "./authNetAdapter";
import { cybersourceAdapter } from "./cybersourceAdapter";
import type { PaymentProviderAdapter, ProviderId } from "./types";
import { getActiveCheckoutGateway } from "@/server/payments/activeGateway";

export function getProviderAdapter(provider: ProviderId): PaymentProviderAdapter {
  switch (provider) {
    case "AUTHORIZE_NET":
      return authNetAdapter;
    case "CYBERSOURCE":
      return cybersourceAdapter;
    default: {
      const _exhaustive: never = provider;
      throw new Error(`Unknown provider: ${String(_exhaustive)}`);
    }
  }
}

export function getProviderAdapterSafe(
  provider: string | null | undefined,
): PaymentProviderAdapter | null {
  if (provider === "AUTHORIZE_NET" || provider === "CYBERSOURCE") {
    return getProviderAdapter(provider);
  }
  return null;
}

export async function getActiveCheckoutAdapter(): Promise<{
  adapter: PaymentProviderAdapter;
  provider: ProviderId;
}> {
  const snap = await getActiveCheckoutGateway();
  const adapter = getProviderAdapter(snap.active);
  return { adapter, provider: snap.active };
}

export type { PaymentProviderAdapter, ProviderId } from "./types";
export { authNetAdapter, cybersourceAdapter };
