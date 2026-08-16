import Link from "next/link";
import Image from "next/image";
import { seriesLocationLabel } from "@/lib/locations";

async function getSeries(slug: string) {
  const base = process.env.APP_BASE_URL || "http://localhost:5000";
  const res = await fetch(`${base}/api/v1/series`, { cache: "no-store" });
  const json = await res.json();
  return (json.data || []).find((s: any) => s.slug === slug);
}

const dateFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
});

const venueGradients: Record<string, string> = {
  OKU: "linear-gradient(160deg, #2d1f1b 0%, #1a1614 100%)",
  CATCH: "linear-gradient(160deg, #0f1f2d 0%, #0a1520 100%)",
};

export default async function SeriesDetail({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const series = await getSeries(slug);

  if (!series) {
    return (
      <div className="page-container" style={{ textAlign: "center", paddingTop: 80 }}>
        <div className="empty-state-icon" style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
        <div style={{ fontFamily: "var(--font-heading)", fontSize: 28, marginBottom: 12 }}>Series Not Found</div>
        <Link href="/series" className="btn btn-primary">Browse All Series</Link>
      </div>
    );
  }

  const minPrice = series.ticketTypes?.length
    ? Math.min(...series.ticketTypes.map((t: any) => t.priceCents))
    : null;
  const locationLabel = seriesLocationLabel(series);

  return (
    <div>
      <div style={{
        background: venueGradients[series.venue || "OKU"],
        padding: "64px 24px",
        position: "relative",
        overflow: "hidden",
      }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 30% 50%, rgba(196,30,58,0.12) 0%, transparent 60%)" }} />
        <div style={{ maxWidth: 1200, margin: "0 auto", position: "relative", zIndex: 1 }}>
          <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
            {locationLabel && (
              <span className={`badge ${series.venue === "CATCH" ? "venue-badge-catch" : "venue-badge-oku"}`}>
                {locationLabel}
              </span>
            )}
            {series.hostType === "INFLUENCER" && (
              <span className="badge" style={{ background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.75)" }}>
                Creator Series
              </span>
            )}
            {series.hostType === "PARTNER" && (
              <span className="badge" style={{ background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.75)" }}>
                Partner Series
              </span>
            )}
          </div>
          <h1 style={{
            fontFamily: "var(--font-heading)",
            fontSize: "clamp(32px, 5vw, 56px)",
            fontWeight: 600,
            color: "white",
            letterSpacing: "-0.02em",
            lineHeight: 1.15,
            marginBottom: 16,
          }}>
            {series.title}
          </h1>
          {series.description && (
            <p style={{ fontSize: 17, color: "rgba(255,255,255,0.65)", maxWidth: 600, lineHeight: 1.7, marginBottom: 28 }}>
              {series.description}
            </p>
          )}
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
            <Link
              href={`/series/${series.slug}/checkout`}
              className="btn btn-primary btn-lg"
              style={{ background: "var(--color-primary)", border: "none" }}
            >
              {minPrice ? `Buy Tickets from $${(minPrice / 100).toFixed(0)}` : "Buy Tickets"}
            </Link>
            <Link href="/series" className="btn btn-lg" style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.15)" }}>
              ← All Series
            </Link>
          </div>
        </div>
      </div>

      <div className="page-container">
        <div style={{ display: "grid", gap: 48 }}>
          <section>
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
              <h2 className="section-title" style={{ margin: 0 }}>Sessions</h2>
              {series.sessions?.length > 0 && (
                <span className="badge badge-neutral">{series.sessions.length} scheduled</span>
              )}
            </div>
            {(!series.sessions || series.sessions.length === 0) ? (
              <div className="empty-state">
                <div className="empty-state-icon">📅</div>
                <div className="empty-state-title">No sessions scheduled yet</div>
              </div>
            ) : (
              <div className="card-grid">
                {series.sessions.map((sess: any, idx: number) => {
                  const remaining = sess.capacity - sess.soldCount;
                  const pctFull = Math.round((sess.soldCount / sess.capacity) * 100);
                  return (
                    <div key={sess.id} className="card" style={{ position: "relative" }}>
                      <div style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        right: 0,
                        height: 3,
                        background: "var(--color-border)",
                        borderRadius: "var(--radius-lg) var(--radius-lg) 0 0",
                        overflow: "hidden",
                      }}>
                        <div style={{ height: "100%", width: `${pctFull}%`, background: remaining === 0 ? "var(--color-danger)" : "var(--color-success)", transition: "width 0.3s" }} />
                      </div>
                      <div style={{ fontFamily: "var(--font-heading)", fontSize: 18, fontWeight: 600, marginBottom: 12, paddingTop: 4 }}>
                        {sess.title || `Session ${idx + 1}`}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
                        <div className="text-sm text-secondary">
                          🗓 {dateFmt.format(new Date(sess.startsAt))}
                        </div>
                        <div className="text-sm text-muted">
                          Until {dateFmt.format(new Date(sess.endsAt))}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 16, paddingTop: 12, borderTop: "1px solid var(--color-border-light)" }}>
                        <div>
                          <div className="text-xs text-muted" style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>Capacity</div>
                          <div style={{ fontWeight: 600 }}>{sess.capacity}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted" style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>Sold</div>
                          <div style={{ fontWeight: 600 }}>{sess.soldCount}</div>
                        </div>
                        <div style={{ marginLeft: "auto" }}>
                          {remaining > 0 ? (
                            <span className="badge badge-success">{remaining} left</span>
                          ) : (
                            <span className="badge badge-danger">Sold Out</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {series.ticketTypes?.length > 0 && (
            <section>
              <h2 className="section-title">Ticket Types</h2>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Description</th>
                      <th>Price</th>
                      <th>Max Per Order</th>
                    </tr>
                  </thead>
                  <tbody>
                    {series.ticketTypes.map((tt: any) => (
                      <tr key={tt.id}>
                        <td>
                          <span style={{ fontWeight: 600, fontFamily: "var(--font-heading)", fontSize: 16 }}>{tt.name}</span>
                        </td>
                        <td className="text-secondary text-sm">{tt.description || "—"}</td>
                        <td>
                          <span style={{ fontFamily: "var(--font-heading)", fontSize: 18, fontWeight: 600, color: "var(--color-primary)" }}>
                            ${(tt.priceCents / 100).toFixed(2)}
                          </span>
                        </td>
                        <td className="text-secondary">{tt.maxPerOrder}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: 24 }}>
                <Link href={`/series/${series.slug}/checkout`} className="btn btn-primary btn-lg">
                  Purchase Tickets
                </Link>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
