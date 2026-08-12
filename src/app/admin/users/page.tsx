"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import { useTranslation, useLocale } from "@/components/i18n/LocaleProvider";
import EntityTable, { EntityColumn } from "@/components/tables/EntityTable";
import StatusBadge from "@/components/entities/StatusBadge";
import ActionMenu, { ActionItem } from "@/components/entities/ActionMenu";
import UserDrawer from "@/components/admin/UserDrawer";
import NewUserModal from "@/components/admin/NewUserModal";
import { Search, UserPlus } from "lucide-react";

function UsersPageContent() {
  const t = useTranslation();
  const locale = useLocale();
  const dateLocale =
    locale === "es" ? "es-PA" : locale === "pt" ? "pt-BR" : "en-US";

  const PERSONA_LABELS: Record<string, string> = {
    STREETSIDE_HOST: t("admin", "streetsideHost"),
    TAXI_DRIVER:     t("admin", "taxiDriver"),
    TOUR_GUIDE:      t("admin", "tourGuide"),
    HOTEL_CONCIERGE: t("admin", "hotelConcierge"),
    PARTNER:         t("admin", "personaPartner") || "Partner",
  };

  const ROLE_LABELS: Record<string, string> = {
    VISITOR: "Visitor",
    ATTENDEE: "Attendee",
    INFLUENCER: "Influencer",
    PARTNER: "Partner",
    INVESTOR: "Investor",
    REFERRER: "Referrer",
    STAFF_OKU: "Staff (OKÜ)",
    STAFF_CATCH: "Staff (Catch)",
    FB_DIRECTOR:           "F&B Director",
    RESTAURANT_SUPERVISOR: "Restaurant Supervisor",
    ADMIN_COMMERCIAL:      "F&B Director",
    ADMIN_IR:              "Admin · IR",
    ADMIN_HR:              "Admin · HR",
    SUPERADMIN:            "Superadmin",
    RESTAURANT_HOST:       "Restaurant Host",
    STREETSIDE_HOST:       "Streetside Host",
  };

  // Distinct background tints per role family so a quick scan of the user
  // list immediately surfaces who is a Referrer vs Influencer vs Admin etc.
  const ROLE_TINTS: Record<string, { bg: string; fg: string }> = {
    REFERRER:         { bg: "#c9a96e22", fg: "#92764a" },
    INFLUENCER:       { bg: "#c41e3a14", fg: "#a01830" },
    PARTNER:          { bg: "#1e40af14", fg: "#1e3a8a" },
    INVESTOR:         { bg: "#0f766e14", fg: "#115e59" },
    SUPERADMIN:       { bg: "#1a161414", fg: "#1a1614" },
    FB_DIRECTOR:           { bg: "#7c3aed14", fg: "#5b21b6" },
    RESTAURANT_SUPERVISOR: { bg: "#c8a96e22", fg: "#92764a" },
    ADMIN_COMMERCIAL:      { bg: "#1a161410", fg: "#1a1614" },
    ADMIN_IR:              { bg: "#1a161410", fg: "#1a1614" },
    ADMIN_HR:              { bg: "#1a161410", fg: "#1a1614" },
  };

  const [users, setUsers]               = useState<any[]>([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState("");
  const [roleFilter, setRoleFilter]     = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedId, setSelectedId]     = useState<string | null>(null);
  const [showNewUser, setShowNewUser]   = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    const r = await fetch("/api/v1/admin/users");
    const d = await r.json();
    if (d.ok) setUsers(d.data);
    setLoading(false);
  };

  useEffect(() => { fetchUsers(); }, []);

  const filtered = useMemo(() => {
    return users.filter((u) => {
      const q = search.toLowerCase();
      const matchQ =
        !q ||
        u.name?.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q);
      const matchRole =
        !roleFilter || u.roles?.some((r: any) => r.roleKey === roleFilter);
      const matchStatus = !statusFilter || u.status === statusFilter;
      return matchQ && matchRole && matchStatus;
    });
  }, [users, search, roleFilter, statusFilter]);

  const buildActions = (u: any): ActionItem[] => [
    {
      key: "open",
      label: t("admin", "openProfile"),
      onClick: () => setSelectedId(u.id),
    },
    {
      key: "activate",
      label: t("admin", "activate"),
      hidden: u.status === "ACTIVE",
      onClick: async () => {
        await fetch(`/api/v1/admin/users/${u.id}/status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "ACTIVE" }),
        });
        fetchUsers();
      },
    },
    {
      key: "suspend",
      label: t("admin", "suspend"),
      hidden: u.status !== "ACTIVE",
      danger: true,
      onClick: async () => {
        await fetch(`/api/v1/admin/users/${u.id}/status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "SUSPENDED" }),
        });
        fetchUsers();
      },
    },
    {
      key: "reset",
      label: t("admin", "resetPassword"),
      danger: true,
      onClick: async () => {
        await fetch(`/api/v1/admin/users/${u.id}/reset-password`, { method: "POST" });
        fetchUsers();
      },
    },
  ];

  const ALL_ROLES = [
    "VISITOR","ATTENDEE","INFLUENCER","PARTNER","INVESTOR",
    "REFERRER","STAFF_OKU","STAFF_CATCH",
    "FB_DIRECTOR","RESTAURANT_SUPERVISOR","ADMIN_IR","ADMIN_HR","SUPERADMIN",
  ];
  const ALL_STATUSES = [
    "ACTIVE","SUSPENDED","LOCKED","ARCHIVED","BANNED","PENDING","PASSWORD_RESET_REQUIRED",
  ];

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString(dateLocale, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  const columns: EntityColumn<any>[] = [
    {
      key: "name",
      header: t("admin", "name"),
      sortable: true,
      render: (u) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{u.name || "—"}</div>
          {u.tags?.length > 0 && (
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 3 }}>
              {u.tags.slice(0, 3).map((tag: string) => (
                <span
                  key={tag}
                  style={{
                    fontSize: 10,
                    padding: "1px 7px",
                    borderRadius: 10,
                    background: "#c9a96e22",
                    color: "#92764a",
                    fontWeight: 700,
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      ),
    },
    {
      key: "email",
      header: t("admin", "email"),
      render: (u) => (
        <span style={{ color: "var(--color-text-secondary)", fontSize: 13 }}>
          {u.email}
        </span>
      ),
    },
    {
      key: "roles",
      header: t("admin", "role"),
      render: (u) => (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {u.roles?.slice(0, 2).map((r: any) => {
            const tint = ROLE_TINTS[r.roleKey] ?? {
              bg: "var(--color-border-light)",
              fg: "var(--color-text-secondary)",
            };
            return (
              <span
                key={r.roleKey}
                title={r.roleKey}
                style={{
                  fontSize: 10,
                  padding: "2px 7px",
                  borderRadius: 10,
                  background: tint.bg,
                  color: tint.fg,
                  fontWeight: 700,
                  whiteSpace: "nowrap",
                }}
              >
                {ROLE_LABELS[r.roleKey] ?? r.roleKey}
              </span>
            );
          })}
          {u.roles?.length > 2 && (
            <span style={{ fontSize: 10, color: "var(--color-text-muted)" }}>
              +{u.roles.length - 2}
            </span>
          )}
          {u.referrer && (
            <span
              style={{
                fontSize: 10,
                padding: "2px 7px",
                borderRadius: 10,
                background: "#c9a96e22",
                color: "#92764a",
                fontWeight: 700,
              }}
            >
              {PERSONA_LABELS[u.referrer.referrerType] || u.referrer.referrerType}
            </span>
          )}
        </div>
      ),
    },
    {
      key: "status",
      header: t("admin", "status"),
      width: "148px",
      sortable: true,
      render: (u) => <StatusBadge status={u.status} dot />,
    },
    {
      key: "createdAt",
      header: t("admin", "joined"),
      width: "112px",
      sortable: true,
      render: (u) => (
        <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
          {fmtDate(u.createdAt)}
        </span>
      ),
    },
    {
      key: "_actions",
      header: "",
      width: "44px",
      render: (u) => <ActionMenu items={buildActions(u)} align="right" />,
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
            {t("admin", "users")}
          </h2>
          <p style={{ fontSize: 12, color: "var(--color-text-muted)", margin: "4px 0 0" }}>
            {filtered.length} / {users.length}
          </p>
        </div>
        <button
          onClick={() => setShowNewUser(true)}
          className="btn btn-sm"
          style={{
            background: "#1a1614",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <UserPlus size={13} />
          {t("admin", "addUser")}
        </button>
      </div>

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
            placeholder={t("admin", "searchUsersPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: 32, fontSize: 13 }}
          />
        </div>
        <select
          className="form-input"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          style={{ width: "auto", minWidth: 160, fontSize: 13 }}
        >
          <option value="">{t("admin", "allRoles")}</option>
          {ALL_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select
          className="form-input"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ width: "auto", minWidth: 160, fontSize: 13 }}
        >
          <option value="">{t("admin", "allStatuses")}</option>
          {ALL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <EntityTable
        rows={filtered}
        columns={columns}
        rowKey={(u) => u.id}
        onRowClick={(u) => setSelectedId(u.id)}
        emptyMessage={t("admin", "noUsersFound")}
        loading={loading}
      />

      {selectedId && (
        <UserDrawer
          userId={selectedId}
          onClose={() => setSelectedId(null)}
          onUserUpdated={fetchUsers}
        />
      )}

      {showNewUser && (
        <NewUserModal
          onClose={() => setShowNewUser(false)}
          onCreated={(newUser) => {
            setUsers((prev) => [newUser, ...prev]);
            setShowNewUser(false);
            setSelectedId(newUser.id);
          }}
        />
      )}
    </>
  );
}

export default function AdminUsersPage() {
  return (
    <Suspense fallback={<p style={{ color: "var(--color-text-muted)", padding: 24 }}>Loading…</p>}>
      <UsersPageContent />
    </Suspense>
  );
}
