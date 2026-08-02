"use client";

import type { Locale } from "@/types/i18n";
import type { getTranslations } from "@/i18n/useTranslation";
import ReservationWizard from "@/components/reservations/ReservationWizard";

interface Props {
  locale: Locale;
  t: ReturnType<typeof getTranslations>;
}

export default function LocaleReservationClient({ locale, t }: Props) {
  return (
    <div style={{ minHeight: "100vh", background: "#0c0a08", color: "#fff" }}>
      <div style={{ position: "relative", textAlign: "center", padding: "40px 24px 24px" }}>
        <div style={{ fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(255,255,255,0.45)", marginBottom: 12 }}>
          {t.common.location}
        </div>
        <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "clamp(28px,5vw,52px)", fontWeight: 300, letterSpacing: "-0.02em", margin: "0 0 10px", lineHeight: 1.05, color: "#fff" }}>
          {t.booking.pageTitle}
        </h1>
        <p style={{ fontSize: 14, color: "rgba(255,255,255,0.55)", maxWidth: 460, margin: "0 auto" }}>
          {t.booking.pageSubtitle}
        </p>
      </div>

      <ReservationWizard locale={locale} t={t} />
    </div>
  );
}
