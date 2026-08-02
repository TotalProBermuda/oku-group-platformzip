import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getOwnProfile } from "@/server/beneficiaries/beneficiaryService";
import { listOwnDocuments } from "@/server/beneficiaries/beneficiaryDocumentService";
import BeneficiarySelfServiceForm from "@/components/account/BeneficiarySelfServiceForm";
import { PrivacyNoticePanel } from "@/components/trust";

export const dynamic = "force-dynamic";

export default async function MyBeneficiaryPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login?callbackUrl=/my/beneficiary");
  const userId = (session.user as any).id as string;
  const [profile, documents] = await Promise.all([
    getOwnProfile(userId),
    listOwnDocuments(userId),
  ]);

  return (
    <div style={{ maxWidth: 720, margin: "40px auto", padding: "0 20px" }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: "#7d7269", textTransform: "uppercase", letterSpacing: "0.07em" }}>My account</div>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginTop: 4 }}>Banesco beneficiary information</h1>
        <p style={{ color: "#5a4f47", marginTop: 8, lineHeight: 1.55 }}>
          OKÜ Finance uses these details to prepare your payout file for Banesco.
          Your account number is encrypted and only the last 4 digits are ever
          shown back to you.
        </p>
      </div>
      <BeneficiarySelfServiceForm initial={profile} initialDocuments={documents} />
      <div style={{ marginTop: 20 }}>
        <PrivacyNoticePanel surface="beneficiary" />
      </div>
    </div>
  );
}
