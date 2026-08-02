import { redirect, notFound } from "next/navigation";
import { requireSession } from "@/server/auth/session";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import MenuEditor from "@/components/admin/menus/MenuEditor";

export const dynamic = "force-dynamic";

export default async function AdminMenuEditPage({ params }: { params: Promise<{ id: string }> }) {
  let session;
  try {
    session = await requireSession();
  } catch {
    redirect("/login?callbackUrl=/admin/menus");
  }
  if (!hasPermission(session.roles, "admin:menus:read")) {
    redirect("/admin");
  }
  const { id } = await params;
  const menu = await prisma.venueMenuRecord.findUnique({
    where: { id },
    include: {
      sections: {
        include: { items: { orderBy: { sortOrder: "asc" } } },
        orderBy: { sortOrder: "asc" },
      },
    },
  });
  if (!menu) notFound();

  const canEdit = hasPermission(session.roles, "admin:menus:edit");

  return <MenuEditor initial={JSON.parse(JSON.stringify(menu))} canEdit={canEdit} />;
}
