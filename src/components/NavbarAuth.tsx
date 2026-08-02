"use client";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { useState } from "react";
import type { NavSession } from "./Navbar";
import type { Locale } from "@/types/i18n";
import { localePath } from "@/i18n/utils";

interface Props {
  session: NavSession;
  locale?: Locale;
  signInLabel?: string;
  signOutLabel?: string;
}

function getDashboardHref(roles: string[]): string {
  if (roles.some((r) => ["SUPERADMIN", "ADMIN_COMMERCIAL", "ADMIN_IR", "ADMIN_HR"].includes(r))) return "/admin";
  if (roles.includes("STREETSIDE_HOST") && !roles.includes("RESTAURANT_HOST")) return "/host/streetside";
  if (roles.some((r) => ["RESTAURANT_HOST", "STREETSIDE_HOST"].includes(r))) return "/host/dashboard";
  if (roles.includes("INFLUENCER"))  return "/influencer/dashboard";
  if (roles.includes("PARTNER"))     return "/partner/dashboard";
  if (roles.includes("INVESTOR"))    return "/investor";
  if (roles.some((r) => r.startsWith("STAFF_"))) return "/staff";
  return "/my";
}

function getDashboardLabel(roles: string[]): string {
  if (roles.some((r) => ["SUPERADMIN", "ADMIN_COMMERCIAL", "ADMIN_IR", "ADMIN_HR"].includes(r))) return "Admin Console";
  if (roles.includes("STREETSIDE_HOST") && !roles.includes("RESTAURANT_HOST")) return "Streetside";
  if (roles.some((r) => ["RESTAURANT_HOST", "STREETSIDE_HOST"].includes(r))) return "Host Dashboard";
  if (roles.includes("INFLUENCER"))  return "My Dashboard";
  if (roles.includes("PARTNER"))     return "Partner Portal";
  if (roles.includes("INVESTOR"))    return "IR Portal";
  if (roles.some((r) => r.startsWith("STAFF_"))) return "SOPs";
  return "My Account";
}

function getRoleLabel(roles: string[]): string {
  if (roles.includes("SUPERADMIN"))        return "Superadmin";
  if (roles.includes("ADMIN_COMMERCIAL"))  return "Admin — Commercial";
  if (roles.includes("ADMIN_HR"))          return "Admin — HR";
  if (roles.includes("ADMIN_IR"))          return "Admin — IR";
  if (roles.some((r) => r === "RESTAURANT_HOST")) return "Restaurant Host";
  if (roles.some((r) => r === "STREETSIDE_HOST"))  return "Streetside Host";
  if (roles.includes("INFLUENCER"))        return "Influencer";
  if (roles.includes("PARTNER"))           return "Partner";
  if (roles.includes("INVESTOR"))          return "Investor";
  if (roles.some((r) => r.startsWith("STAFF_"))) return "Staff";
  return "Member";
}

export default function NavbarAuth({ session, locale = "en", signInLabel = "Sign In", signOutLabel = "Sign Out" }: Props) {
  const [acctOpen, setAcctOpen] = useState(false);

  const roles: string[] = session?.user?.roles ?? [];
  const isEmployee = roles.some((r) =>
    ["SUPERADMIN", "ADMIN_COMMERCIAL", "ADMIN_IR", "ADMIN_HR",
     "RESTAURANT_HOST", "STREETSIDE_HOST"].includes(r) ||
    r.startsWith("STAFF_")
  );
  const isInfluencer = roles.includes("INFLUENCER");

  const dashHref  = getDashboardHref(roles);
  const dashLabel = getDashboardLabel(roles);
  const roleLabel = getRoleLabel(roles);

  const userName    = session?.user?.name || session?.user?.email || "";
  const userInitial = userName ? userName.charAt(0).toUpperCase() : "?";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      {session?.user && (
        <Link
          href={dashHref}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "7px 14px", borderRadius: 9,
            background: "var(--color-primary)", color: "white",
            fontSize: 12, fontWeight: 700, textDecoration: "none",
            letterSpacing: "0.02em", whiteSpace: "nowrap",
            transition: "opacity 0.15s",
          }}
          onMouseOver={(e) => { (e.currentTarget as HTMLAnchorElement).style.opacity = "0.85"; }}
          onMouseOut={(e)  => { (e.currentTarget as HTMLAnchorElement).style.opacity = "1"; }}
        >
          <span style={{ fontSize: 13 }}>▤</span>
          {dashLabel}
        </Link>
      )}

      <div style={{ flexShrink: 0 }}>
        {session?.user ? (
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setAcctOpen((o) => !o)}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: "var(--radius)", border: "1px solid var(--color-border)", background: "var(--color-surface)", cursor: "pointer", transition: "all 0.15s" }}
              onMouseOver={(e) => { e.currentTarget.style.borderColor = "var(--color-primary)"; }}
              onMouseOut={(e)  => { e.currentTarget.style.borderColor = "var(--color-border)";  }}
            >
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--color-primary)", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                {userInitial}
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text)", maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {session.user.name?.split(" ")[0] || session.user.email?.split("@")[0]}
              </span>
              <span style={{ fontSize: 10, color: "var(--color-text-muted)" }}>▾</span>
            </button>

            {acctOpen && (
              <>
                <div style={{ position: "fixed", inset: 0, zIndex: 98 }} onClick={() => setAcctOpen(false)} />
                <div style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 12, padding: "8px 0", minWidth: 210, boxShadow: "var(--shadow-drawer)", zIndex: 99 }}>

                  {/* Role badge */}
                  <div style={{ padding: "6px 16px 10px", borderBottom: "1px solid var(--color-border)" }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: "var(--color-primary)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                      {roleLabel}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 1 }}>
                      {session.user.name || session.user.email}
                    </div>
                  </div>

                  {/* Dashboard shortcut */}
                  <Link href={dashHref} onClick={() => setAcctOpen(false)}
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", fontSize: 13, fontWeight: 700, color: "var(--color-primary)", textDecoration: "none" }}>
                    ▤ {dashLabel}
                  </Link>

                  {/* Personal items — guests and members only, not employees */}
                  {!isEmployee && (
                    <>
                      <div style={{ height: 1, background: "var(--color-border)" }} />
                      <Link href="/my/membership" onClick={() => setAcctOpen(false)} style={{ display: "block", padding: "10px 16px", fontSize: 13, color: "var(--color-text)", textDecoration: "none" }}>◇ My Membership</Link>
                      <Link href="/my/tickets"    onClick={() => setAcctOpen(false)} style={{ display: "block", padding: "10px 16px", fontSize: 13, color: "var(--color-text)", textDecoration: "none" }}>🎟 My Tickets</Link>
                      <Link href="/my/orders"     onClick={() => setAcctOpen(false)} style={{ display: "block", padding: "10px 16px", fontSize: 13, color: "var(--color-text)", textDecoration: "none" }}>📦 My Orders</Link>
                    </>
                  )}

                  {isInfluencer && (
                    <>
                      <div style={{ height: 1, background: "var(--color-border)", margin: "4px 0" }} />
                      <Link href="/account/influencer-profile" onClick={() => setAcctOpen(false)} style={{ display: "block", padding: "10px 16px", fontSize: 13, color: "var(--color-text)", textDecoration: "none" }}>✏️ Edit Influencer Profile</Link>
                    </>
                  )}

                  <div style={{ height: 1, background: "var(--color-border)", margin: "4px 0" }} />
                  <button
                    onClick={() => signOut({ callbackUrl: localePath(locale, "/login") })}
                    style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 16px", fontSize: 13, color: "#dc2626", background: "none", border: "none", cursor: "pointer" }}
                  >
                    {signOutLabel}
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <Link href={localePath(locale, "/login")} className="btn btn-primary btn-sm">{signInLabel}</Link>
        )}
      </div>
    </div>
  );
}
