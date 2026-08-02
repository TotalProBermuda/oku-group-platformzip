"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import type { NavSession } from "./Navbar";
import type { Locale } from "@/types/i18n";
import { localePath } from "@/i18n/utils";

interface Props {
  session: NavSession;
  locale: Locale;
  labels: {
    restaurants: string;
    experiences: string;
    membership: string;
    careers: string;
    signIn?: string;
    signOut?: string;
  };
}

export default function NavbarMobileMenu({ session, locale, labels }: Props) {
  const [open, setOpen] = useState(false);

  const roles: string[] = session?.user?.roles ?? [];
  const isAdmin      = roles.some((r) => ["SUPERADMIN", "ADMIN_COMMERCIAL", "ADMIN_IR", "ADMIN_HR"].includes(r));
  const isInfluencer = roles.includes("INFLUENCER");
  const isPartner    = roles.includes("PARTNER");
  const isInvestor   = roles.includes("INVESTOR");
  const isStaff      = roles.some((r) => ["STAFF_OKU", "STAFF_CATCH"].includes(r));

  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = original;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        className="nav-hamburger"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
      >
        <span className={`hamburger-icon${open ? " open" : ""}`}>
          <span />
          <span />
          <span />
        </span>
      </button>

      {open && (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 98, background: "rgba(0,0,0,0.15)" }}
            onClick={close}
          />
          <nav
            className="mobile-menu"
            aria-label="Mobile navigation"
          >
            <Link href={localePath(locale, "/restaurants")} className="mobile-nav-link" onClick={close}>{labels.restaurants}</Link>
            <Link href={localePath(locale, "/experiences")} className="mobile-nav-link" onClick={close}>{labels.experiences}</Link>
            <Link href={localePath(locale, "/membership")}  className="mobile-nav-link" onClick={close}>{labels.membership}</Link>
            <Link href={localePath(locale, "/careers")}     className="mobile-nav-link" onClick={close}>{labels.careers}</Link>

            {(isAdmin || isInfluencer || isPartner || isInvestor || isStaff) && (
              <div className="mobile-menu-divider" />
            )}
            {isAdmin      && <Link href="/admin"                className="mobile-nav-link" onClick={close}>Admin Console</Link>}
            {isInfluencer && <Link href="/influencer/dashboard" className="mobile-nav-link" onClick={close}>Influencer Dashboard</Link>}
            {isPartner    && <Link href="/partner/dashboard"    className="mobile-nav-link" onClick={close}>Partner Portal</Link>}
            {isInvestor   && <Link href="/investor"             className="mobile-nav-link" onClick={close}>IR Portal</Link>}
            {isStaff      && <Link href="/staff"                className="mobile-nav-link" onClick={close}>Staff SOPs</Link>}

            <div className="mobile-menu-divider" />

            {session?.user ? (
              <>
                <Link href="/my/membership" className="mobile-nav-link" onClick={close}>◇ My Membership</Link>
                <Link href="/my/tickets"    className="mobile-nav-link" onClick={close}>🎟 My Tickets</Link>
                <Link href="/my/orders"     className="mobile-nav-link" onClick={close}>📦 My Orders</Link>
                {isInfluencer && (
                  <Link href="/account/influencer-profile" className="mobile-nav-link" onClick={close}>✏️ Edit Profile</Link>
                )}
                <div className="mobile-menu-divider" />
                <button
                  onClick={() => { close(); signOut({ callbackUrl: localePath(locale, "/login") }); }}
                  className="mobile-nav-link mobile-nav-signout"
                >
                  {labels.signOut ?? "Sign Out"}
                </button>
              </>
            ) : (
              <Link href={localePath(locale, "/login")} className="mobile-nav-link mobile-nav-cta" onClick={close}>
                {labels.signIn ?? "Sign In"}
              </Link>
            )}
          </nav>
        </>
      )}
    </>
  );
}
