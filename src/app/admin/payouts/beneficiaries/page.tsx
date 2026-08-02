import AdminPageShell from "@/components/admin/AdminPageShell";
import BeneficiariesPanel from "@/components/admin/payouts/BeneficiariesPanel";
import { adminListProfileSummaries } from "@/server/beneficiaries/beneficiaryService";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { hasPermission } from "@/lib/permissions";
import type { RoleKey } from "@/types/roles";

export const dynamic = "force-dynamic";

export default async function AdminBeneficiariesPage() {
  const session = await getServerSession(authOptions);
  const roles = ((session?.user as any)?.roles ?? []) as RoleKey[];
  // Page entry requires only the broader summary permission. Restricted
  // bank/document detail is gated separately on the per-user GET, the
  // signed-URL GET, the documents GET, and the queue CSV export — each
  // of which requires `admin:beneficiaries:detail`.
  if (!hasPermission(roles, "admin:beneficiaries:summary")) {
    redirect("/admin");
  }
  const initial = await adminListProfileSummaries({});
  const canSeeDetail = hasPermission(roles, "admin:beneficiaries:detail");
  return (
    <AdminPageShell
      eyebrow="Admin · Finance"
      title="Beneficiaries"
      subtitle="OKÜ captures and approves beneficiary information for payout batches. Banesco performs the formal KYC during onboarding — these records track bank-readiness, not regulatory KYC. Document statuses are recorded manually until uploads are enabled in a later release."
    >
      <BeneficiariesPanel initial={initial} canSeeDetail={canSeeDetail} />
    </AdminPageShell>
  );
}
