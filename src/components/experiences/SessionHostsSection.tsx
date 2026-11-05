import type { Locale } from "@/types/i18n";

type Assignment = {
  assignmentRole: string;
  displayOrder: number;
  isPrimary: boolean;
  profile: {
    id: string;
    displayName: string;
    shortDescription: string | null;
    bio: string | null;
    websiteUrl: string | null;
    avatarUrl: string | null;
    logoUrl: string | null;
    slug: string | null;
  };
};

function safeMediaUrl(value: string | null) {
  if (!value) return null;
  if (value.startsWith("/") && !value.startsWith("//") && !/[\\\\\u0000-\u0020]/.test(value)) return value;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.toString() : null;
  } catch { return null; }
}

const labels: Record<Locale, { heading: string; host: string; cohost: string; website: string }> = {
  en: { heading: "Hosts & co-hosts", host: "Host", cohost: "Co-host", website: "Visit website" },
  es: { heading: "Anfitriones y coanfitriones", host: "Anfitrión", cohost: "Coanfitrión", website: "Visitar sitio web" },
  pt: { heading: "Anfitriões e coanfitriões", host: "Anfitrião", cohost: "Coanfitrião", website: "Visitar o site" },
};

function roleLabel(role: string, locale: Locale) {
  const normalized = role.toUpperCase().replace(/[\s-]+/g, "_");
  const values = labels[locale] ?? labels.en;
  if (normalized === "HOST") return values.host;
  if (["COHOST", "CO_HOST", "CO_HOSTED_BY"].includes(normalized)) return values.cohost;
  return role.replace(/_/g, " ");
}

export default function SessionHostsSection({ assignments, locale }: { assignments: Assignment[]; locale: Locale }) {
  const visible = assignments.filter((item) => item.profile?.displayName);
  if (visible.length === 0) return null;
  const copy = labels[locale] ?? labels.en;

  return (
    <section aria-labelledby="session-hosts-heading" style={{ marginBottom: 48 }}>
      <h2 id="session-hosts-heading" style={{ fontFamily: "var(--font-heading)", fontSize: 26, fontWeight: 400, color: "#1a1614", marginBottom: 16 }}>
        {copy.heading}
      </h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: 16 }}>
        {visible.map(({ assignmentRole, profile }) => {
          const image = safeMediaUrl(profile.avatarUrl) || safeMediaUrl(profile.logoUrl);
          const description = profile.shortDescription || profile.bio;
          const website = safeMediaUrl(profile.websiteUrl);
          return (
            <article key={profile.id + assignmentRole} style={{ display: "flex", gap: 16, alignItems: "flex-start", background: "#fff", border: "1px solid #e5e0d8", borderRadius: 14, padding: 18 }}>
              {image ? <div role="img" aria-label={profile.displayName} style={{ width: 72, height: 72, flex: "0 0 72px", borderRadius: "50%", backgroundImage: `url("${image.replace(/["\\\\]/g, "")}")`, backgroundSize: "cover", backgroundPosition: "center" }} /> : null}
              <div style={{ minWidth: 0 }}>
                <div style={{ color: "#9a8f85", textTransform: "uppercase", letterSpacing: ".1em", fontSize: 10, fontWeight: 700, marginBottom: 3 }}>
                  {roleLabel(assignmentRole, locale)}
                </div>
                <h3 style={{ margin: 0, fontSize: 17, color: "#1a1614" }}>{profile.displayName}</h3>
                {description ? <p style={{ margin: "6px 0 0", color: "#6b7280", fontSize: 13, lineHeight: 1.5 }}>{description}</p> : null}
                {website ? <a href={website} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 8, color: "#c41e3a", fontSize: 13, fontWeight: 600 }}>{copy.website} ↗</a> : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
