export function calculateCheckoutCharges(subtotalCents: number, rule: {
  serviceFeeBps: number; serviceFeeFlatCents?: number; taxBps: number; taxServiceFee: boolean;
}) {
  if (!Number.isSafeInteger(subtotalCents) || subtotalCents < 0) throw new Error("Invalid subtotal");
  for (const rate of [rule.serviceFeeBps, rule.taxBps]) {
    if (!Number.isInteger(rate) || rate < 0 || rate > 10000) throw new Error("Invalid finance rate");
  }
  const flat = rule.serviceFeeFlatCents ?? 0;
  if (!Number.isSafeInteger(flat) || flat < 0 || flat > 1000000) throw new Error("Invalid flat fee");
  const feesCents = subtotalCents === 0 ? 0 : Math.round(subtotalCents * rule.serviceFeeBps / 10000) + flat;
  const taxCents = Math.round((subtotalCents + (rule.taxServiceFee ? feesCents : 0)) * rule.taxBps / 10000);
  const totalCents = subtotalCents + feesCents + taxCents;
  if (!Number.isSafeInteger(totalCents)) throw new Error("Checkout total exceeds supported range");
  return { feesCents, taxCents, totalCents };
}
