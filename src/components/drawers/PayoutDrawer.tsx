"use client";

import { useEffect, useState, useCallback } from "react";
import RightDetailDrawer from "./RightDetailDrawer";
import StatusBadge from "@/components/entities/StatusBadge";
import EntityLink from "@/components/entities/EntityLink";
import { useTranslation, useLocale } from "@/components/i18n/LocaleProvider";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

type Tab = "overview" | "entries";

interface PayoutDrawerProps {
  influencerId: string | null;
  onClose: () => void;
  onUserOpen?: (userId: string) => void;
  onOrderOpen?: (orderId: string) => void;
}

export default function PayoutDrawer({
  influencerId,
  onClose,
  onUserOpen,
  onOrderOpen,
}: PayoutDrawerProps) {
  const t = useTranslation();
  const locale = useLocale();
  const dateLocale =
    locale === "es" ? "es-PA" : locale === "pt" ? "pt-BR" : "en-US";

  const [data, setData] = useState<{ entries: any[]; summary: any } | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/v1/admin/payouts");
      const d = await r.json();
      if (d.ok) {
        const filtered = influencerId
          ? {
              ...d.data,
              entries: d.data.entries.filter(
                (e: any) => e.influencer?.id === influencerId
              ),
            }
          : d.data;

        if (influencerId) {
          const earned = filtered.entries
            .filter((e: any) => e.type === "COMMISSION_EARNED")
            .reduce((s: number, e: any) => s + e.amountCents, 0);
          const paid = filtered.entries
            .filter((e: any) => e.type === "COMMISSION_PAID")
            .reduce((s: number, e: any) => s + Math.abs(e.amountCents), 0);
          const reversed = filtered.entries
            .filter((e: any) => e.type === "COMMISSION_REVERSED")
            .reduce((s: number, e: any) => s + Math.abs(e.amountCents), 0);
          filtered.summary = {
            totalEarnedCents: earned,
            totalPaidCents: paid,
            outstandingCents: earned - paid - reversed,
          };
        }

        setData(filtered);
      }
    } finally {
      setLoading(false);
    }
  }, [influencerId]);

  useEffect(() => {
    if (influencerId) {
      setTab("overview");
      setData(null);
      fetchData();
    }
  }, [influencerId, fetchData]);

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString(dateLocale, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  const fmtMoney = (cents: number) =>
    new Intl.NumberFormat(dateLocale, { style: "currency", currency: "USD" }).format(
      cents / 100
    );

  const influencer = data?.entries?.[0]?.influencer;
  const userName = influencer?.user?.name || influencer?.user?.email || t("admin", "influencer");

  const TABS = [
    { key: "overview", label: t("admin", "overview") },
    { key: "entries",  label: t("admin", "ledgerEntries"), badge: data?.entries?.length },
  ];

  return (
    <RightDetailDrawer
      open={!!influencerId}
      onClose={onClose}
      title={userName}
      subtitle={influencer?.user?.email ?? undefined}
      width={500}
      tabs={TABS as any}
      activeTab={tab}
      onTabChange={(k) => setTab(k as Tab)}
      loading={loading}
    >
      {data && tab === "overview" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {influencer?.user && (
            <Section title={t("admin", "influencer")}>
              <EntityLink
                entityType="user"
                entityId={influencer.user.id}
                label={influencer.user.name || influencer.user.email}
                sublabel={influencer.user.email}
                variant="card"
                onOpen={(_, id) => onUserOpen?.(id)}
              />
            </Section>
          )}

          <Section title={t("admin", "summary")}>
            <SummaryCard
              icon={<TrendingUp size={16} />}
              label={t("admin", "totalEarned")}
              value={fmtMoney(data.summary.totalEarnedCents)}
              color="#065f46"
              bg="#ecfdf5"
            />
            <SummaryCard
              icon={<TrendingDown size={16} />}
              label={t("admin", "totalPaid")}
              value={fmtMoney(data.summary.totalPaidCents)}
              color="#1e40af"
              bg="#eff6ff"
            />
            <SummaryCard
              icon={<Minus size={16} />}
              label={t("admin", "outstanding")}
              value={fmtMoney(data.summary.outstandingCents)}
              color={data.summary.outstandingCents > 0 ? "#92400e" : "#6b7280"}
              bg={data.summary.outstandingCents > 0 ? "#fffbeb" : "#f9fafb"}
            />
          </Section>
        </div>
      )}

      {data && tab === "entries" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {data.entries.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--color-text-muted)", fontSize: 13 }}>
              {t("admin", "noPayoutsFound")}
            </div>
          ) : (
            data.entries.map((entry: any) => (
              <div
                key={entry.id}
                style={{
                  padding: "11px 14px",
                  background: "var(--color-bg)",
                  borderRadius: 8,
                  border: "1px solid var(--color-border-light)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <StatusBadge status={entry.type} size="xs" />
                    {entry.order && (
                      <button
                        onClick={() => onOrderOpen?.(entry.order.id)}
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          padding: 0,
                          fontSize: 11,
                          color: "var(--color-primary)",
                          marginTop: 4,
                          display: "block",
                          fontFamily: "monospace",
                        }}
                      >
                        ···{entry.order.id.slice(-8)}
                      </button>
                    )}
                    {entry.note && (
                      <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 4 }}>
                        {entry.note}
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color:
                          entry.type === "COMMISSION_EARNED" ? "#065f46" :
                          entry.type === "COMMISSION_REVERSED" ? "#9f1239" : "#1e40af",
                      }}
                    >
                      {entry.type === "COMMISSION_EARNED" ? "+" : "–"}
                      {fmtMoney(Math.abs(entry.amountCents))}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 2 }}>
                      {fmtDate(entry.createdAt)}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </RightDetailDrawer>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: 10 }}>
        {title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{children}</div>
    </div>
  );
}

function SummaryCard({ icon, label, value, color, bg }: { icon: React.ReactNode; label: string; value: string; color: string; bg: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 14px",
        borderRadius: 8,
        background: bg,
      }}
    >
      <div style={{ color, flexShrink: 0 }}>{icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>{label}</div>
        <div style={{ fontSize: 16, fontWeight: 700, color }}>{value}</div>
      </div>
    </div>
  );
}
