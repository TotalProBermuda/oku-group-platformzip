import { redirect } from "next/navigation";

export default function LegacyLaunchReadinessRedirect() {
  redirect("/admin/payments");
}
