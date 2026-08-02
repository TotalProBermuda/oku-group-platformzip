"use client";

import { useEffect, useState } from "react";
import { useTranslation, useLocale } from "@/components/i18n/LocaleProvider";

interface DocVersion {
  id: string;
  version: number;
  fileName: string;
  sizeBytes: number;
  createdAt: string;
}

interface IRDoc {
  id: string;
  title: string;
  description: string | null;
  visibility: string;
  updatedAt: string;
  versions: DocVersion[];
}

function formatSize(bytes: number) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

const docTypeIcon = (title: string) => {
  const lower = title.toLowerCase();
  if (lower.includes("annual") || lower.includes("report")) return "↗";
  if (lower.includes("deck") || lower.includes("pitch")) return "◭";
  if (lower.includes("financial") || lower.includes("statement")) return "⬡";
  if (lower.includes("memo") || lower.includes("update")) return "◈";
  return "◇";
};

export default function InvestorPortal() {
  const t = useTranslation();
  const locale = useLocale();
  const [documents, setDocuments] = useState<IRDoc[]>([]);
  const [investorName, setInvestorName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const dateFmt = new Intl.DateTimeFormat(locale === "es" ? "es-PA" : locale === "pt" ? "pt-BR" : "en-US", {
    month: "short", day: "numeric", year: "numeric",
  });

  useEffect(() => {
    fetch("/api/v1/investor/documents")
      .then((r) => r.json())
      .then((res) => {
        if (res.ok) {
          setDocuments(res.data.documents);
          setInvestorName(res.data.investorName);
        } else {
          setError(res.error || t("common", "failedToLoadDocs"));
        }
      })
      .catch(() => setError(t("common", "failedToLoadDocs")))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="dashboard-canvas">
      {/* Header band */}
      <div style={{ background: "var(--layer-2)", borderBottom: "1px solid var(--color-border)", padding: "36px 0 28px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px" }}>
          <div className="dash-eyebrow">{t("common", "investorRelations")}</div>
          <h1 className="page-header" style={{ marginBottom: 4 }}>{t("common", "irPortal")}</h1>
          {investorName && (
            <p style={{ fontSize: 14, color: "var(--color-text-secondary)", marginTop: 6 }}>
              {t("common", "welcomeBackName", { name: investorName })}
            </p>
          )}
        </div>
      </div>

      <div className="dashboard-body">
        {loading ? (
          <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
            {[1, 2, 3].map((i) => (
              <div key={i} className="module-card">
                <div className="skeleton" style={{ height: 44, width: 44, borderRadius: 12, marginBottom: 16 }} />
                <div className="skeleton" style={{ height: 22, width: "70%", marginBottom: 10 }} />
                <div className="skeleton" style={{ height: 14, width: "90%" }} />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="alert-strip alert-strip-error">
            <span className="alert-strip-icon">⚠</span>
            {error}
          </div>
        ) : documents.length === 0 ? (
          <div className="empty-panel">
            <div className="empty-panel-icon">◇</div>
            <div className="empty-panel-title">{t("common", "noDocsAvailable")}</div>
            <div className="empty-panel-desc">{t("common", "docsSharedMsg")}</div>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
              <div>
                <div className="dash-section-title">{t("common", "documentsLibrary") || "Document Library"}</div>
                <p className="text-sm text-secondary">
                  {documents.length === 1
                    ? t("common", "documentsAvailable", { count: documents.length })
                    : t("common", "documentsAvailablePlural", { count: documents.length })}
                </p>
              </div>
            </div>

            <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}>
              {documents.map((doc) => {
                const latest = doc.versions[0];
                return (
                  <div key={doc.id} className="module-card" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                    {/* Header row */}
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                      <div style={{
                        width: 44, height: 44, borderRadius: 12,
                        background: "var(--color-primary-muted)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 20, color: "var(--color-primary)", flexShrink: 0,
                        fontFamily: "var(--font-heading)",
                      }}>
                        {docTypeIcon(doc.title)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: "var(--font-heading)", fontSize: 17, fontWeight: 400, letterSpacing: "-0.01em", lineHeight: 1.3, marginBottom: 6 }}>
                          {doc.title}
                        </div>
                        <span className={`badge ${doc.visibility === "PRIVATE" ? "badge-neutral" : "badge-info"}`}>
                          {doc.visibility === "PRIVATE" ? t("admin", "private") : t("admin", "investorAccess")}
                        </span>
                      </div>
                    </div>

                    {doc.description && (
                      <p style={{ fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.6, margin: 0 }}>
                        {doc.description}
                      </p>
                    )}

                    {/* Meta strip */}
                    <div style={{ display: "flex", gap: 24, padding: "12px 0", borderTop: "1px solid var(--color-border-light)", borderBottom: "1px solid var(--color-border-light)" }}>
                      <div>
                        <div className="kpi-label">{t("common", "version")}</div>
                        <div style={{ fontWeight: 600, fontSize: 15, color: "var(--color-text)" }}>{doc.versions.length}</div>
                      </div>
                      {latest && (
                        <>
                          <div>
                            <div className="kpi-label">{t("admin", "sizeField")}</div>
                            <div style={{ fontWeight: 600, fontSize: 15, color: "var(--color-text)" }}>{formatSize(latest.sizeBytes)}</div>
                          </div>
                          <div>
                            <div className="kpi-label">{t("admin", "updatedField")}</div>
                            <div style={{ fontWeight: 600, fontSize: 14, color: "var(--color-text)" }}>{dateFmt.format(new Date(doc.updatedAt))}</div>
                          </div>
                        </>
                      )}
                    </div>

                    {latest && (
                      <div style={{ display: "flex", gap: 10 }}>
                        <button className="btn btn-primary btn-sm"
                          onClick={() => alert(`Viewing: ${latest.fileName}\nVersion ${latest.version}\nSize: ${formatSize(latest.sizeBytes)}`)}>
                          {t("admin", "viewDocument")}
                        </button>
                        <button className="btn btn-secondary btn-sm"
                          onClick={() => alert(`Download: ${latest.fileName}`)}>
                          {t("common", "download")}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
