"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

export default function RefreshButton({ label, refreshingLabel }: { label: string; refreshingLabel: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      onClick={() => start(() => router.refresh())}
      disabled={pending}
      data-testid="launch-readiness-refresh"
      style={{
        padding: "6px 14px",
        borderRadius: 6,
        border: "1px solid #cbd5e1",
        background: pending ? "#e2e8f0" : "#fff",
        color: "#0f172a",
        cursor: pending ? "wait" : "pointer",
        fontSize: 13,
        fontWeight: 600,
      }}
    >
      {pending ? refreshingLabel : label}
    </button>
  );
}
