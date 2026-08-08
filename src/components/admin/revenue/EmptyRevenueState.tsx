import Link from "next/link";

export default function EmptyRevenueState({
  message,
  ctaLabel = "Go to INVU Integration",
  ctaHref = "/admin/integrations/invu",
}: {
  message: string;
  ctaLabel?: string;
  ctaHref?: string;
}) {
  return (
    <div
      style={{
        background: "var(--layer-1)",
        border: "1px solid var(--color-border)",
        borderRadius: 16,
        padding: "40px 32px",
        textAlign: "center",
        color: "var(--color-text-muted)",
        fontSize: 14,
        lineHeight: 1.6,
      }}
    >
      <div style={{ marginBottom: 16, fontSize: 15 }}>{message}</div>
      <Link
        href={ctaHref}
        style={{
          display: "inline-block",
          padding: "10px 18px",
          background: "var(--color-text)",
          color: "var(--color-bg)",
          borderRadius: 999,
          textDecoration: "none",
          fontSize: 13,
          fontWeight: 500,
          letterSpacing: "0.02em",
        }}
      >
        {ctaLabel}
      </Link>
    </div>
  );
}
