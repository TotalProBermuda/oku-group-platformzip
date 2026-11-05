import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasLinkedReferrerIdentity } from "@/server/referrals/referrerDashboardAccess";

export default async function MyAccountIndexPage() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;

  if (!session || !userId) {
    redirect("/login?callbackUrl=/my");
  }

  const [hasReferrerIdentity, sellerSeat] = await Promise.all([
    hasLinkedReferrerIdentity({ userId }),
    prisma.partnerCommerceSeat.findFirst({
    where: { provisionedUserId: userId, status: { not: "REVOKED" } },
    select: { id: true },
    }),
  ]);

  redirect(hasReferrerIdentity ? "/referrer/dashboard" : sellerSeat ? "/partner/seller" : "/account");
}
