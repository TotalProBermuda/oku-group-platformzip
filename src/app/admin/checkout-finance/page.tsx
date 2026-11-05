import { redirect } from "next/navigation";
import { requireSession } from "@/server/auth/session";
import FinanceSettings from "./settings";

export default async function CheckoutFinancePage() {
  const { roles } = await requireSession();
  if (!roles.includes("SUPERADMIN")) redirect("/admin");
  return <FinanceSettings />;
}
