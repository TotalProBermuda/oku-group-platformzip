import StatusChip from "@/components/ui/StatusChip";

export type BeneficiaryStatusValue =
  | "MISSING_INFO"
  | "READY_FOR_REVIEW"
  | "OKU_APPROVED"
  | "AWAITING_BANK_CONFIRMATION"
  | "BANK_READY"
  | "REJECTED"
  | "ON_HOLD";

const MAP: Record<BeneficiaryStatusValue, { variant: string; label: string }> = {
  MISSING_INFO:               { variant: "gray",   label: "Missing info" },
  READY_FOR_REVIEW:           { variant: "yellow", label: "Ready for review" },
  OKU_APPROVED:               { variant: "yellow", label: "OKÜ approved" },
  AWAITING_BANK_CONFIRMATION: { variant: "yellow", label: "Awaiting Banesco" },
  BANK_READY:                 { variant: "green",  label: "Bank-ready" },
  REJECTED:                   { variant: "red",    label: "Rejected" },
  ON_HOLD:                    { variant: "red",    label: "On hold" },
};

export function BeneficiaryStatusPill({
  status,
  size = "sm",
}: {
  status: BeneficiaryStatusValue;
  size?: "xs" | "sm" | "md";
}) {
  const m = MAP[status] ?? { variant: "gray", label: status };
  return <StatusChip status={m.variant} label={m.label} size={size} />;
}

export default BeneficiaryStatusPill;
