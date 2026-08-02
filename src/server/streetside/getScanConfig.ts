import { prisma } from "@/lib/prisma";

export type EffectiveScanConfig = {
  canScanMembers: boolean;
  canScanTickets: boolean;
  canScanReservationBlocks: boolean;
};

/**
 * Resolves the effective scan config for a host:
 * 1. User-specific override (if exists)
 * 2. Global default (if exists)
 * 3. Built-in defaults (members only)
 */
export async function getEffectiveScanConfig(userId: string): Promise<EffectiveScanConfig> {
  const userConfig = await prisma.streetsideScanConfig.findUnique({ where: { userId } });
  if (userConfig) {
    return {
      canScanMembers: userConfig.canScanMembers,
      canScanTickets: userConfig.canScanTickets,
      canScanReservationBlocks: userConfig.canScanReservationBlocks,
    };
  }

  const globalConfig = await prisma.streetsideScanConfig.findFirst({ where: { isGlobalDefault: true } });
  if (globalConfig) {
    return {
      canScanMembers: globalConfig.canScanMembers,
      canScanTickets: globalConfig.canScanTickets,
      canScanReservationBlocks: globalConfig.canScanReservationBlocks,
    };
  }

  return { canScanMembers: true, canScanTickets: false, canScanReservationBlocks: false };
}
