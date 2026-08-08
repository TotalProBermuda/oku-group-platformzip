"use client";

import { useEffect, useState } from "react";
import { brand, info } from "@/data/catch";
import { reserveUrl } from "@/lib/links";

const LINKS = [
  { href: "#about", label: "About" },
  { href: "#gallery", label: "Gallery" },
  { href: "#menu", label: "Menu" },
  { href: "#events", label: "Events" },
];

export default function SiteNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: scrolled ? "12px 48px" : "20px 48px",
        background: scrolled ? "rgba(22,17,15,0.92)" : "transparent",
        backdropFilter: scrolled ? "blur(10px)" : "none",
        borderBottom: scrolled
          ? "1px solid rgba(255,255,255,0.08)"
          : "1px solid transparent",
        transition: "all 0.25s ease",
      }}
    >
      <a href="#top" style={{ display: "flex", alignItems: "center", textDecoration: "none" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/catch/logo-catch.webp"
          alt="CATCH Panamá"
          style={{ height: 40, width: "auto", objectFit: "contain" }}
        />
      </a>

      <nav style={{ display: "flex", alignItems: "center", gap: 32 }}>
        {/* Section links + phone collapse on mobile; Reserve always stays visible. */}
        <span className="catch-nav-links" style={{ display: "flex", alignItems: "center", gap: 32 }}>
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              style={{
                color: "rgba(255,255,255,0.78)",
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                textDecoration: "none",
              }}
            >
              {l.label}
            </a>
          ))}
          <a
            href={`tel:${info.phone.replace(/[^+\d]/g, "")}`}
            style={{
              color: "rgba(255,255,255,0.55)",
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "0.06em",
              textDecoration: "none",
            }}
          >
            {info.phone}
          </a>
        </span>
        <a
          href={reserveUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            background: brand.crimson,
            color: "#fff",
            borderRadius: 8,
            padding: "9px 20px",
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            textDecoration: "none",
          }}
        >
          Reserve
        </a>
      </nav>
    </header>
  );
}
