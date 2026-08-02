import { prisma } from "@/lib/prisma";
import type { CommerceSettings } from "@prisma/client";

export const COMMERCE_SETTINGS_ID = "global";

export const COMMERCE_SETTINGS_DEFAULTS = {
  businessName: null as string | null,
  addressLine1: null as string | null,
  addressLine2: null as string | null,
  city: null as string | null,
  countryRegion: null as string | null,
  currency: "USD",
  timezone: "America/Panama",
  storeStatus: "OPEN" as "OPEN" | "CLOSED" | "TEST_MODE",
  capacityManagementEnabled: true,
  holdMinutes: 15,
  lowStockThreshold: 10,
  soldOutThreshold: 0,
  stockNotificationEmails: [] as string[],
  hideSoldOutTicketTypes: false,
  allowGuestCheckout: true,
  requireAccountForMemberships: true,
  continueShoppingDestination: "/series",
  emptyCartText: null as string | null,
  checkoutSupportEmail: null as string | null,
  cancellationPolicyText: null as string | null,
  senderName: null as string | null,
  adminNotificationEmails: [] as string[],
  debugMode: "OFF" as "OFF" | "ERRORS_ONLY" | "VERBOSE",
};

export async function getCommerceSettings(): Promise<CommerceSettings> {
  const existing = await prisma.commerceSettings.findUnique({
    where: { id: COMMERCE_SETTINGS_ID },
  });
  if (existing) return existing;
  try {
    return await prisma.commerceSettings.create({
      data: { id: COMMERCE_SETTINGS_ID },
    });
  } catch {
    // Race: another request created it between findUnique and create.
    const row = await prisma.commerceSettings.findUnique({
      where: { id: COMMERCE_SETTINGS_ID },
    });
    if (!row) throw new Error("Failed to initialize commerce settings");
    return row;
  }
}
