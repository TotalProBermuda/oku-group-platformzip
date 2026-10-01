/** Only a full authorization from this immediate-capture request can fulfil an order.
 * Intermediate/review states retain the payment claim for reconciliation, not retry.
 */
export function classifyCharge(httpStatus: number | null, body: { status?: string; id?: string } | null) {
  if (httpStatus && httpStatus >= 200 && httpStatus < 300 && body?.id && body.status === "AUTHORIZED") return "approved";
  if (!httpStatus || httpStatus >= 500 || (httpStatus >= 200 && httpStatus < 300)) return "review";
  return "failed";
}
