import { MatchMethod } from "@prisma/client";

export interface TrustScoreInput {
  matchMethod: MatchMethod;
  hasExactMatch: boolean;
  tableLabelMatches: boolean;
  customerNameMatchQuality: number;
  timeWindowFitMinutes: number | null;
  paymentTotalConsistent: boolean;
  noDuplicateConflict: boolean;
  noCreditAmbiguity: boolean;
}

// Score calibration — exact spec weights:
//
// Component weights:
//   hasExactMatch       +0.40  (prior reservation link confirmed from a previous sync cycle)
//   tableLabelMatches   +0.20
//   customerNameQuality +0.15  (Levenshtein-scaled 0.0–1.0 → max 0.15)
//   timeWindowFit       +0.10 if ≤30 min, +0.05 if ≤60 min
//   paymentConsistent   +0.08  (computed from actual data, not assumed)
//   noDuplicateConflict +0.05  (computed from actual data, not assumed)
//   noCreditAmbiguity   +0.02
//
// Heuristic-only max (no exact match, all signals verified):
//   0.20 + 0.15 + 0.10 + 0.08 + 0.05 + 0.02 = 0.60
//
// With exact match bonus:
//   min(1.00, 0.60 + 0.40) = 1.00 (capped)
//
// AUTO link threshold: trustScore ≥ 0.75
//   Sessions require at least the exact-match bonus + partial heuristics to auto-link.
//   Heuristic-only max (0.60) falls below 0.75 → correctly goes to PENDING_REVIEW.
//
// Practical scenarios:
//   exact + table + name(1.0) + time(≤30) + payment + dup + credit = 1.00 → AUTO MATCHED ✓
//   exact + table + name(1.0) + time(≤30)                           = 0.85 → AUTO MATCHED ✓
//   exact + table                                                    = 0.60 → PENDING_REVIEW ✓
//   table + name(1.0) + time(≤30) + payment + dup + credit          = 0.60 → PENDING_REVIEW ✓
//   exact only                                                        = 0.40 → PENDING_REVIEW ✓

export function computeTrustScore(input: TrustScoreInput): number {
  if (input.matchMethod === MatchMethod.MANUAL) return 1.0;
  if (input.matchMethod === MatchMethod.UNMATCHED) return 0.0;

  let score = 0.0;

  // Exact match: prior reservation link confirmed from previous sync cycle
  if (input.hasExactMatch) score += 0.40;

  // Table label match
  if (input.tableLabelMatches) score += 0.20;

  // Customer name quality: 0.0–0.15 proportional to Levenshtein score
  score += Math.max(0, Math.min(1, input.customerNameMatchQuality)) * 0.15;

  // Time window fit: +0.10 within ±30 min, +0.05 within ±60 min
  if (input.timeWindowFitMinutes !== null) {
    const absMin = Math.abs(input.timeWindowFitMinutes);
    if (absMin <= 30) {
      score += 0.10;
    } else if (absMin <= 60) {
      score += 0.05;
    }
  }

  // Payment total internally consistent (computed from actual data)
  if (input.paymentTotalConsistent) score += 0.08;

  // No duplicate session conflict for this reservation (computed from actual data)
  if (input.noDuplicateConflict) score += 0.05;

  // No credit note ambiguity
  if (input.noCreditAmbiguity) score += 0.02;

  return Math.min(1.0, Math.round(score * 1000) / 1000);
}

export function trustScoreToStatus(trustScore: number, hasReservationMatch: boolean): string {
  if (trustScore >= 0.75 && hasReservationMatch) return "MATCHED";
  return "PENDING_REVIEW";
}

export function needsReviewQueue(trustScore: number): boolean {
  return trustScore < 0.75;
}
