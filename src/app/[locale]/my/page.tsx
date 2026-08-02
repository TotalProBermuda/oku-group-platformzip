import { redirect } from "next/navigation";

export default function LocaleMyPage({ params }: { params: Promise<{ locale: string }> }) {
  redirect("/my/tickets");
}
