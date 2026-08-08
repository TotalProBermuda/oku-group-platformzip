import { getCompensationSummary } from "@/lib/compensation/dashboard";
import CompensationDashboard from "@/components/compensation/CompensationDashboard";
import CompensationTabs from "@/components/admin/revenue/CompensationTabs";

export const dynamic = "force-dynamic";

export default async function CompensationPage() {
  const raw = await getCompensationSummary({ preset: "last_30_days" });
  const data = JSON.parse(JSON.stringify(raw));
  return (
    <CompensationTabs>
      <CompensationDashboard data={data} />
    </CompensationTabs>
  );
}
