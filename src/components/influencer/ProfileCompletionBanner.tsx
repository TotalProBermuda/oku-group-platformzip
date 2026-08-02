"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Profile {
  displayName: string | null;
  shortBio: string | null;
  profileImageUrl: string | null;
  instagramUrl: string | null;
  whatsapp: string | null;
}

function getMissingFields(profile: Profile): string[] {
  const missing: string[] = [];
  if (!profile.displayName) missing.push("display name");
  if (!profile.shortBio) missing.push("bio");
  if (!profile.profileImageUrl) missing.push("profile photo");
  return missing;
}

export default function ProfileCompletionBanner() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    fetch("/api/v1/me/influencer-profile")
      .then((r) => r.json())
      .then((d) => { if (d.profile) setProfile(d.profile); })
      .catch(() => {});
  }, []);

  if (!profile || dismissed) return null;

  const missing = getMissingFields(profile);
  if (missing.length === 0) return null;

  return (
    <div style={{
      background: "linear-gradient(135deg, #7c0d1f 0%, #1a1614 100%)",
      borderBottom: "1px solid rgba(196,30,58,0.3)",
      padding: "14px 24px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 16,
      flexWrap: "wrap",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#fbbf24", flexShrink: 0 }} />
        <div>
          <span style={{ color: "white", fontSize: 14, fontWeight: 600 }}>Complete your creator profile</span>
          <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, marginLeft: 8 }}>
            Missing: {missing.join(", ")}
          </span>
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <Link
          href="/account/influencer-profile"
          style={{ background: "#c41e3a", color: "white", padding: "8px 18px", borderRadius: 8, textDecoration: "none", fontSize: 13, fontWeight: 700 }}
        >
          Update Profile →
        </Link>
        <button
          onClick={() => setDismissed(true)}
          style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: 4 }}
        >
          ×
        </button>
      </div>
    </div>
  );
}
