"use client";

import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { sessionCheckoutHref } from "@/lib/sessionCheckoutHref";
import { nextPurchaseBoundary, sessionTicketsOnSale, type PurchaseSession, type PurchaseSeries } from "@/lib/sessionPurchaseEligibility";

/** All public purchase CTAs use the displayed session, never a sibling fallback. */
export default function SessionTicketAction({
  session, series, checkoutHrefBase, query, children, unavailableLabel, className, style,
}: {
  session?: PurchaseSession | null; series?: PurchaseSeries | null; checkoutHrefBase: string;
  query?: Record<string, string | string[] | undefined>; children: string; unavailableLabel: string;
  className?: string; style?: CSSProperties;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const refresh = () => setNow(Date.now());
    const boundary = nextPurchaseBoundary(session, series);
    const timer = boundary === null ? undefined : setTimeout(refresh, Math.min(2_147_483_647, Math.max(1, boundary - Date.now())));
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [session, series, now]);

  if (!session || !sessionTicketsOnSale(session, series, Math.max(now, Date.now()))) {
    return <span aria-disabled="true" className="btn btn-ghost" style={style}>{unavailableLabel}</span>;
  }
  return <Link
    href={sessionCheckoutHref(checkoutHrefBase, session.id, query)}
    className={className} style={style}
    onClick={event => {
      // Also check at activation, in case a suspended/background tab missed its timer.
      if (!sessionTicketsOnSale(session, series)) { event.preventDefault(); setNow(Date.now()); }
    }}
  >{children}</Link>;
}
