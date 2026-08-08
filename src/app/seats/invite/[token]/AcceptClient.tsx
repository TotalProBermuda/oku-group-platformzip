"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

interface SeatLookup {
  status: "valid" | "expired" | "revoked" | "accepted" | "not_found";
  seat?: {
    id: string;
    invitedEmail: string;
    invitedName: string | null;
    roleCode: string;
    seriesId: string | null;
    sessionId: string | null;
    seriesTitle: string | null;
    sessionTitle: string | null;
    sessionStartsAt: string | null;
    partnerName: string | null;
  };
  expiresAt?: string;
}

const ROLE_LABEL: Record<string, string> = {
  SERIES_CO_LEAD: "Series Co-Lead",
  SESSION_CO_LEAD: "Session Co-Lead",
  GUEST_LIST_LEAD: "Guest List Lead",
};

export function AcceptClient({
  token,
  lookup,
  signedInEmail,
}: {
  token: string;
  lookup: SeatLookup;
  signedInEmail: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (lookup.status === "expired") {
    return <Notice title="This invitation has expired" body="Ask the partner to send you a new invitation." />;
  }
  if (lookup.status === "revoked") {
    return <Notice title="Invitation revoked" body="This invitation is no longer valid." />;
  }
  if (lookup.status === "accepted") {
    return <Notice title="Already accepted" body="You have already accepted this invitation." />;
  }
  if (lookup.status === "not_found" || !lookup.seat) {
    return <Notice title="Invitation not found" body="The link is invalid or has been removed." />;
  }

  const seat = lookup.seat;
  const emailMatch = signedInEmail?.toLowerCase() === seat.invitedEmail.toLowerCase();
  const scopeLabel = seat.sessionTitle
    ? `${seat.seriesTitle ?? "Series"} — ${seat.sessionTitle}`
    : seat.seriesTitle ?? "this series";

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/seats/invite/${token}/accept`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to accept");
        return;
      }
      const dest = data.seriesId ? `/partner/series/${data.seriesId}` : "/";
      router.push(dest);
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  async function signInWithInvitedEmail() {
    setBusy(true);
    await signIn("credentials", {
      email: seat.invitedEmail,
      callbackUrl: `/seats/invite/${token}`,
    });
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, lineHeight: 1.3, margin: "0 0 12px" }}>
        You've been invited
      </h1>
      <p style={{ fontSize: 15, lineHeight: 1.55, color: "var(--color-text-secondary, #6b5e54)", margin: "0 0 18px" }}>
        <strong>{seat.partnerName ?? "An OKÜ partner"}</strong> has invited{" "}
        <strong>{seat.invitedEmail}</strong> to help lead{" "}
        <strong>{scopeLabel}</strong> as a{" "}
        <strong>{ROLE_LABEL[seat.roleCode] ?? seat.roleCode}</strong>.
      </p>

      {!signedInEmail && (
        <>
          <p style={{ fontSize: 14, color: "var(--color-text-secondary, #6b5e54)", marginBottom: 16 }}>
            To accept, sign in with the invited email address.
          </p>
          <button
            onClick={signInWithInvitedEmail}
            disabled={busy}
            style={{
              width: "100%", padding: "12px 20px", borderRadius: 6, border: "none",
              background: "#c41e3a", color: "#fff", fontWeight: 600, cursor: "pointer", fontSize: 15,
            }}
          >
            {busy ? "Signing in…" : `Sign in as ${seat.invitedEmail}`}
          </button>
          <p style={{ fontSize: 12, color: "var(--color-text-secondary, #8a7d70)", marginTop: 12, textAlign: "center" }}>
            If you don't have an account yet, one will be created for you on sign-in.
          </p>
        </>
      )}

      {signedInEmail && !emailMatch && (
        <Notice
          title="You're signed in as the wrong account"
          body={`This invitation was sent to ${seat.invitedEmail}, but you're signed in as ${signedInEmail}. Sign out and sign in with the invited email.`}
        />
      )}

      {signedInEmail && emailMatch && (
        <>
          <button
            onClick={accept}
            disabled={busy}
            style={{
              width: "100%", padding: "12px 20px", borderRadius: 6, border: "none",
              background: "#c41e3a", color: "#fff", fontWeight: 600, cursor: "pointer", fontSize: 15,
            }}
          >
            {busy ? "Accepting…" : "Accept invitation"}
          </button>
          {error && (
            <p style={{ color: "var(--color-danger, #c41e3a)", fontSize: 13, marginTop: 12, textAlign: "center" }}>
              {error}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <h2 style={{ fontSize: 18, margin: "0 0 8px" }}>{title}</h2>
      <p style={{ fontSize: 14, color: "var(--color-text-secondary, #6b5e54)", margin: 0 }}>{body}</p>
    </div>
  );
}
