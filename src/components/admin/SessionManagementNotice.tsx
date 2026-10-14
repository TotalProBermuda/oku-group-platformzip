"use client";
import { useTranslation } from "@/components/i18n/LocaleProvider";
export default function SessionManagementNotice() {
  const t = useTranslation();
  return <p className="alert alert-info">{t("admin", "sessionManagementLegacyNotice")}</p>;
}
