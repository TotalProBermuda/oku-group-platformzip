"use client";

import { useEffect, useState } from "react";
import { useTranslation, useLocale } from "@/components/i18n/LocaleProvider";

const visBadge: Record<string, string> = {
  PRIVATE: "badge badge-danger",
  APPROVED_INVESTORS: "badge badge-success",
};

export default function AdminIRPage() {
  const t = useTranslation();
  const locale = useLocale();
  const dateLocale = locale === "es" ? "es-PA" : locale === "pt" ? "pt-BR" : "en-US";

  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", visibility: "APPROVED_INVESTORS" });
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    setLoading(true);
    fetch("/api/v1/admin/ir")
      .then((r) => r.json())
      .then((d) => { if (d.ok) setDocs(d.data); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    setSubmitting(true);
    const res = await fetch("/api/v1/admin/ir", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const d = await res.json();
    if (d.ok) {
      setShowForm(false);
      setForm({ title: "", description: "", visibility: "APPROVED_INVESTORS" });
      load();
    }
    setSubmitting(false);
  };

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h2 className="section-title" style={{ margin: 0 }}>{t("admin", "irDocuments")}</h2>
        <button className="btn btn-primary btn-sm" onClick={() => setShowForm(!showForm)}>
          {showForm ? t("admin", "cancel") : t("admin", "newDocument")}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="form-group">
            <label className="form-label">{t("admin", "title")}</label>
            <input className="form-input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Annual Report 2024" />
          </div>
          <div className="form-group">
            <label className="form-label">{t("admin", "description")}</label>
            <textarea className="form-input" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Brief description of the document" />
          </div>
          <div className="form-group">
            <label className="form-label">{t("admin", "visibility")}</label>
            <select className="form-input" value={form.visibility} onChange={(e) => setForm({ ...form, visibility: e.target.value })}>
              <option value="APPROVED_INVESTORS">{t("admin", "approvedInvestors")}</option>
              <option value="PRIVATE">{t("admin", "private")}</option>
            </select>
          </div>
          <button className="btn btn-primary" disabled={submitting || !form.title} onClick={handleCreate}>
            {submitting ? t("admin", "creating") : t("admin", "createDocument")}
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-secondary">{t("admin", "loading")}</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("admin", "title")}</th>
                <th>{t("admin", "description")}</th>
                <th>{t("admin", "visibility")}</th>
                <th>{t("admin", "versions")}</th>
                <th>{t("admin", "latest")}</th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id}>
                  <td style={{ fontWeight: 600 }}>{d.title}</td>
                  <td className="text-sm text-secondary">{d.description || "—"}</td>
                  <td>
                    <span className={visBadge[d.visibility] || "badge"}>
                      {d.visibility === "APPROVED_INVESTORS" ? t("admin", "investors") : t("admin", "private")}
                    </span>
                  </td>
                  <td>{d.versions?.length || 0}</td>
                  <td className="text-sm text-secondary">
                    {d.versions?.length > 0
                      ? new Date(d.versions[0].createdAt).toLocaleDateString(dateLocale, { month: "short", day: "numeric", year: "numeric" })
                      : "—"}
                  </td>
                </tr>
              ))}
              {docs.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: "center", padding: "32px", color: "#9ca3af" }}>{t("admin", "noDocumentsFound")}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
