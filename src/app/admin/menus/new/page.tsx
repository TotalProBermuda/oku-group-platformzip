import { redirect } from "next/navigation";
import { requireSession } from "@/server/auth/session";
import { hasPermission } from "@/lib/permissions";
import NewMenuForm from "./NewMenuForm";

export const dynamic = "force-dynamic";

export default async function NewMenuPage() {
  let session;
  try { session = await requireSession(); } catch { redirect("/login?callbackUrl=/admin/menus/new"); }
  if (!hasPermission(session.roles, "admin:menus:edit")) redirect("/admin/menus");
  return <NewMenuForm />;
}
