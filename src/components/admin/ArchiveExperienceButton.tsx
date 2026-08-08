"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  seriesId: string;
  currentStatus: string;
  label?: string;
  confirmMsg?: string;
}

export default function ArchiveExperienceButton({ seriesId, currentStatus, label, confirmMsg }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const isArchived = currentStatus === "ARCHIVED";

  async function handleClick() {
    const msg = confirmMsg ?? (isArchived ? "Restore this experience?" : "Archive this experience? It will be hidden from the public listing.");
    if (!confirm(msg)) return;
    setLoading(true);
    await fetch(`/api/v1/admin/experiences/${seriesId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: isArchived ? "DRAFT" : "ARCHIVED" }),
    });
    setLoading(false);
    router.refresh();
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      style={{ fontSize: 12, color: isArchived ? "#6b7280" : "#9ca3af", textDecoration: "none", fontWeight: 500, background: "none", border: "none", cursor: "pointer", padding: 0 }}
    >
      {loading ? "…" : (isArchived ? "Restore" : (label ?? "Archive"))}
    </button>
  );
}
