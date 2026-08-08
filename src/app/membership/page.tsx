import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import MembershipPageClient from "@/components/membership/MembershipPageClient";

export const metadata = { title: "Membership | OKÜ Hospitality Group", description: "Access to culture, capital, and community through OKÜ Membership. Patron and Founder tiers available." };

export default async function MembershipPage() {
  const [session, plans] = await Promise.all([
    getServerSession(authOptions),
    prisma.membershipPlanConfig.findMany({ where: { active: true }, orderBy: { priceAnnualCents: "asc" } }),
  ]);

  return (
    <MembershipPageClient
      plans={plans as any}
      isLoggedIn={!!session?.user?.id}
    />
  );
}
