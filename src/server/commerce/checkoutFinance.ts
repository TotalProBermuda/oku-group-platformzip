import { prisma } from "@/lib/prisma";
import { calculateCheckoutCharges } from "./financeCalculation";

export async function priceCheckoutCharges(subtotalCents: number, at = new Date()) {
  const rule = await prisma.checkoutFinanceRule.findFirst({
    where: { effectiveFrom: { lte: at } }, orderBy: { effectiveFrom: "desc" },
  });
  if (!rule) throw new Error("Ticket finance rules have not been configured");
  return {
    ...calculateCheckoutCharges(subtotalCents, rule),
    financeRule: { id: rule.id, effectiveFrom: rule.effectiveFrom.toISOString(),
      serviceFeeBps: rule.serviceFeeBps, serviceFeeFlatCents: rule.serviceFeeFlatCents, taxBps: rule.taxBps, taxServiceFee: rule.taxServiceFee },
  };
}
