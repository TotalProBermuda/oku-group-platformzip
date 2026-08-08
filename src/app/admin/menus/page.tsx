import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession } from "@/server/auth/session";
import { hasPermission } from "@/lib/permissions";
import { listMenuHeadersForAdmin } from "@/server/menus/menuService";

export const dynamic = "force-dynamic";

const VENUE_LABEL: Record<string, string> = { oku: "OKÜ", catch: "CATCH", terrace: "TERRACE" };

function titleOf(t: any): string {
  if (!t) return "(Untitled)";
  if (typeof t === "string") return t;
  return t.en || Object.values(t).find(Boolean) || "(Untitled)";
}

export default async function AdminMenusListPage() {
  let session;
  try { session = await requireSession(); } catch { redirect("/login?callbackUrl=/admin/menus"); }
  if (!hasPermission(session.roles, "admin:menus:read")) redirect("/admin");

  const menus = await listMenuHeadersForAdmin();

  // Group house menus by venue for the primary table; event-only copies sit
  // in their own section so they don't visually crowd the standing menus.
  const houseMenus = menus.filter((m) => m.isHouseMenu);
  const eventMenus = menus.filter((m) => !m.isHouseMenu);

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, gap: 16 }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: 32, fontWeight: 400, color: "#1a1614", marginBottom: 6 }}>
            Menus
          </h1>
          <p style={{ fontSize: 14, color: "#6b7280", maxWidth: 600, lineHeight: 1.5 }}>
            House menus are the standing menus shown on each venue's public page. Event-only menus are
            attached to a specific event and never appear on venue pages.
          </p>
        </div>
        {hasPermission(session.roles, "admin:menus:edit") && (
          <Link
            href="/admin/menus/new"
            className="btn btn-primary"
            style={{ fontSize: 14, padding: "10px 18px", whiteSpace: "nowrap" }}
          >+ New Menu</Link>
        )}
      </div>

      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9a8f85", marginBottom: 12 }}>
          House Menus
        </h2>
        {houseMenus.length === 0 ? (
          <div style={{ padding: 24, background: "#fafaf9", border: "1px dashed #e5e0d8", borderRadius: 10, color: "#7d7269", fontSize: 14 }}>
            No house menus yet. Create one to give a venue its standing menu.
          </div>
        ) : (
          <div style={{ background: "white", border: "1px solid #e5e0d8", borderRadius: 12, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead style={{ background: "#fafaf9", textAlign: "left" }}>
                <tr>
                  <th style={{ padding: "10px 16px", fontWeight: 600, color: "#7d7269", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>Venue</th>
                  <th style={{ padding: "10px 16px", fontWeight: 600, color: "#7d7269", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>Type</th>
                  <th style={{ padding: "10px 16px", fontWeight: 600, color: "#7d7269", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>Title</th>
                  <th style={{ padding: "10px 16px", fontWeight: 600, color: "#7d7269", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>Sections</th>
                  <th style={{ padding: "10px 16px", fontWeight: 600, color: "#7d7269", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {houseMenus.map((m) => (
                  <tr key={m.id} style={{ borderTop: "1px solid #ece6df" }}>
                    <td style={{ padding: "12px 16px", fontWeight: 600, color: "#1a1614" }}>{VENUE_LABEL[m.venueSlug] ?? m.venueSlug}</td>
                    <td style={{ padding: "12px 16px", color: "#6b7280" }}>{m.menuType === "FOOD" ? "Food" : "Drinks"}</td>
                    <td style={{ padding: "12px 16px", color: "#1a1614" }}>{titleOf(m.menuTitle)}</td>
                    <td style={{ padding: "12px 16px", color: "#6b7280" }}>{m._count.sections}</td>
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 999, background: m.isPublished ? "#dcfce7" : "#fef3c7", color: m.isPublished ? "#15803d" : "#92400e" }}>
                        {m.isPublished ? "PUBLISHED" : "DRAFT"}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "right" }}>
                      <Link href={`/admin/menus/${m.id}`} style={{ fontSize: 13, color: "#c41e3a", fontWeight: 600 }}>Edit →</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 style={{ fontSize: 16, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9a8f85", marginBottom: 12 }}>
          Event-only Menus
        </h2>
        {eventMenus.length === 0 ? (
          <div style={{ padding: 24, background: "#fafaf9", border: "1px dashed #e5e0d8", borderRadius: 10, color: "#7d7269", fontSize: 14 }}>
            No event-only menus yet. Create one from an event's "Menus" tab, or use "+ New Menu" above and uncheck "House menu".
          </div>
        ) : (
          <div style={{ background: "white", border: "1px solid #e5e0d8", borderRadius: 12, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead style={{ background: "#fafaf9", textAlign: "left" }}>
                <tr>
                  <th style={{ padding: "10px 16px", fontWeight: 600, color: "#7d7269", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>Venue</th>
                  <th style={{ padding: "10px 16px", fontWeight: 600, color: "#7d7269", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>Type</th>
                  <th style={{ padding: "10px 16px", fontWeight: 600, color: "#7d7269", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>Title</th>
                  <th style={{ padding: "10px 16px", fontWeight: 600, color: "#7d7269", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>Used by</th>
                  <th style={{ padding: "10px 16px", fontWeight: 600, color: "#7d7269", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {eventMenus.map((m) => (
                  <tr key={m.id} style={{ borderTop: "1px solid #ece6df" }}>
                    <td style={{ padding: "12px 16px", fontWeight: 600, color: "#1a1614" }}>{VENUE_LABEL[m.venueSlug] ?? m.venueSlug}</td>
                    <td style={{ padding: "12px 16px", color: "#6b7280" }}>{m.menuType === "FOOD" ? "Food" : "Drinks"}</td>
                    <td style={{ padding: "12px 16px", color: "#1a1614" }}>{titleOf(m.menuTitle)}</td>
                    <td style={{ padding: "12px 16px", color: "#6b7280" }}>
                      {(m._count as any).eventLinks ?? 0} event{((m._count as any).eventLinks ?? 0) === 1 ? "" : "s"}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 999, background: m.isPublished ? "#dcfce7" : "#fef3c7", color: m.isPublished ? "#15803d" : "#92400e" }}>
                        {m.isPublished ? "PUBLISHED" : "DRAFT"}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "right" }}>
                      <Link href={`/admin/menus/${m.id}`} style={{ fontSize: 13, color: "#c41e3a", fontWeight: 600 }}>Edit →</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
