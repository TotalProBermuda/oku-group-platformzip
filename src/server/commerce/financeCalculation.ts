export function calculateCheckoutCharges(subtotalCents: number, rule: {
  serviceFeeBps: number; taxBps: number; taxServiceFee: boolean;
}) {
  if (!Number.isSafeInteger(subtotalCents) || subtotalCents < 0) throw new Error("Invalid subtotal");
  for (const rate of [rule.serviceFeeBps, rule.taxBps]) {
    if (!Number.isInteger(rate) || rate < 0 || rate > 10000) throw new Error("Invalid finance rate");
  }
  const feesCents = Math.round(subtotalCents * rule.serviceFeeBps / 10000);
  const taxCents = Math.round((subtotalCents + (rule.taxServiceFee ? feesCents : 0)) * rule.taxBps / 10000);
  const totalCents = subtotalCents + feesCents + taxCents;
  if (!Number.isSafeInteger(totalCents)) throw new Error("Checkout total exceeds supported range");
  return { feesCents, taxCents, totalCents };
}
