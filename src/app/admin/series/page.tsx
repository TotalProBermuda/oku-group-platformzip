"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import { useTranslation, useLocale } from "@/components/i18n/LocaleProvider";
import EntityTable, { EntityColumn } from "@/components/tables/EntityTable";
import StatusBadge from "@/components/entities/StatusBadge";
import EntityLink from "@/components/entities/EntityLink";
import ActionMenu, { ActionItem } from "@/components/entities/ActionMenu";
import { useEntityDrawer } from "@/hooks/useEntityDrawer";
import EntityDrawerHost from "@/components/drawers/EntityDrawerHost";
import { Search, Plus } from "lucide-react";

function SeriesPageContent() {
  const t = useTranslation();
  const locale = useLocale();
  const dateLocale =
    locale === "es" ? "es-PA" : locale === "pt" ? "pt-BR" : "en-US";

  const { drawerType, drawerId, openDrawer, closeDrawer } = useEntityDrawer();

  const [series, setSeries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ slug: "", title: "", hostType: "OKU", venue: "OKU" });
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    setLoading(true);
    fetch("/api/v1/admin/series")
      .then((r) => r.json())
      .then((d) => { if (d.ok) setSeries(d.data); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    return series.filter((s) => {
      const q = search.toLowerCase();
      const matchQ = !q || s.title?.toLowerCase().includes(q) || s.slug?.toLowerCase().includes(q);
      const matchStatus = !statusFilter || s.status === statusFilter;
      return matchQ && matchStatus;
    });
  }, [series, search, statusFilter]);

  const handleCreate = async () => {
    setSubmitting(true);
    const res = await fetch("/api/v1/admin/series", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const d = await res.json();
    if (d.ok) {
      setShowForm(false);
      setForm({ slug: "", title: "", hostType: "OKU", venue: "OKU" });
      load();
    }
    setSubmitting(false);
  };

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString(dateLocale, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  const getHost = (s: any) => {
    if (s.influencer?.user?.name) return s.influencer.user.name;
    if (s.partner?.user?.name) return s.partner.user.name;
    return s.hostType;
  };

  const buildActions = (s: any): ActionItem[] => {
    const items: ActionItem[] = [
      {
        key: "open",
        label: t("admin", "viewDetails"),
        onClick: () => openDrawer("series", s.id),
      },
    ];

    if (s.status === "DRAFT") {
      items.push({
        key: "publish",
        label: t("admin", "publishSeries"),
        onClick: async () => {
          await fetch(`/api/v1/admin/series/${s.id}/publish`, { method: "POST" });
          load();
        },
      });
    }

    if (s.status === "PUBLISHED") {
      items.push({
        key: "unpublish",
        label: t("admin", "unpublishSeries"),
        danger: true,
        onClick: async () => {
          if (!confirm(t("admin", "unpublishConfirm"))) return;
          await fetch(`/api/v1/admin/series/${s.id}/unpublish`, { method: "POST" });
          load();
        },
      });
    }

    return items;
  };

  const STATUSES = ["PUBLISHED", "DRAFT", "ARCHIVED"];
  const publishedCount = series.filter((s) => s.status === "PUBLISHED").length;

  const columns: EntityColumn<any>[] = [
    {
      key: "title",
      header: t("admin", "title"),
      sortable: true,
      render: (s) => (
        <div>
          <EntityLink
            entityType="series"
            entityId={s.id}
            label={s.title}
            showIcon={false}
            onOpen={(_, id) => openDrawer("series", id)}
          />
          <div style={{ fontSize: 11, fontFamily: "monospace", color: "var(--color-text-muted)", marginTop: 2 }}>
            /{s.slug}
          </div>
        </div>
      ),
    },
    {
      key: "venue",
      header: t("admin", "venue"),
      width: "90px",
      render: (s) => (
        <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
          {s.venue || "—"}
        </span>
      ),
    },
    {
      key: "status",
      header: t("admin", "status"),
      width: "110px",
      sortable: true,
      render: (s) => <StatusBadge status={s.status} dot />,
    },
    {
      key: "host",
      header: t("admin", "host"),
      render: (s) => {
        const hostUser = s.influencer?.user || s.partner?.user;
        if (hostUser) {
          return (
            <EntityLink
              entityType="user"
              entityId={hostUser.id}
              label={hostUser.name || hostUser.email}
              showIcon={false}
              onOpen={(_, id) => openDrawer("user", id)}
            />
          );
        }
        return (
          <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
            {s.hostType}
          </span>
        );
      },
    },
    {
      key: "sessions",
      header: t("admin", "sessions"),
      width: "80px",
      sortable: true,
      render: (s) => (
        <span style={{ fontSize: 13, fontWeight: 600 }}>
          {s.sessions?.length ?? 0}
        </span>
      ),
    },
    {
      key: "createdAt",
      header: t("admin", "created"),
      width: "112px",
      sortable: true,
      render: (s) => (
        <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
          {fmtDate(s.createdAt)}
        </span>
      ),
    },
    {
      key: "_actions",
      header: "",
      width: "44px",
      render: (s) => <ActionMenu items={buildActions(s)} align="right" />,
    },
  ];

  return (
    <>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 20,
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <h2 className="section-title" style={{ margin: 0 }}>
            {t("admin", "series")}
          </h2>
          <p style={{ fontSize: 12, color: "var(--color-text-muted)", margin: "4px 0 0" }}>
            {series.length} {t("admin", "seriesCount")} · {publishedCount} {t("admin", "publishedCount")}
          </p>
        </div>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => setShowForm(!showForm)}
          style={{ display: "flex", alignItems: "center", gap: 6 }}
        >
          <Plus size={13} />
          {t("admin", "newSeries")}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">{t("admin", "title")}</label>
              <input
                className="form-input"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. The Chef's Table"
              />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">{t("admin", "slug")}</label>
              <input
                className="form-input"
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
                placeholder="e.g. chefs-table"
              />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">{t("admin", "hostType")}</label>
              <select
                className="form-input"
                value={form.hostType}
                onChange={(e) => setForm({ ...form, hostType: e.target.value })}
              >
                <option value="OKU">OKÜ</option>
                <option value="CATCH">CATCH</option>
                <option value="INFLUENCER">Influencer</option>
                <option value="PARTNER">Partner</option>
              </select>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">{t("admin", "venue")}</label>
              <select
                className="form-input"
                value={form.venue}
                onChange={(e) => setForm({ ...form, venue: e.target.value })}
              >
                <option value="OKU">OKÜ</option>
                <option value="CATCH">CATCH</option>
              </select>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="btn btn-primary btn-sm"
              disabled={submitting || !form.title || !form.slug}
              onClick={handleCreate}
            >
              {submitting ? t("admin", "creating") : t("admin", "createSeries")}
            </button>
            <button className="btn btn-sm" onClick={() => setShowForm(false)}>
              {t("admin", "cancel")}
            </button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <Search
            size={14}
            style={{
              position: "absolute",
              left: 10,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--color-text-muted)",
              pointerEvents: "none",
            }}
          />
          <input
            className="form-input"
            placeholder={t("admin", "searchSeriesPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: 32, fontSize: 13 }}
          />
        </div>
        <select
          className="form-input"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ width: "auto", minWidth: 140, fontSize: 13 }}
        >
          <option value="">{t("admin", "allStatuses")}</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <EntityTable
        rows={filtered}
        columns={columns}
        rowKey={(s) => s.id}
        onRowClick={(s) => openDrawer("series", s.id)}
        emptyMessage={filtered.length === 0 && search ? t("admin", "noSeriesResults") : t("admin", "noSeriesFound")}
        loading={loading}
      />

      <EntityDrawerHost
        drawerType={drawerType}
        drawerId={drawerId}
        onClose={closeDrawer}
        onUpdated={load}
      />
    </>
  );
}

export default function AdminSeriesPage() {
  return (
    <Suspense fallback={<p style={{ color: "var(--color-text-muted)", padding: 24 }}>Loading…</p>}>
      <SeriesPageContent />
    </Suspense>
  );
}
