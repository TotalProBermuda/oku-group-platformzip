import { notFound } from "next/navigation";
import { getInviteByToken } from "@/server/partnerSeats/service";
import { getOptionalSession } from "@/server/auth/session";
import { prisma } from "@/lib/prisma";
import { AcceptClient } from "./AcceptClient";

export default async function SeatInviteAcceptPage(
  props: { params: Promise<{ token: string }> }
) {
  const { token } = await props.params;
  const lookup = await getInviteByToken(token);
  if (lookup.status === "not_found") notFound();

  const session = await getOptionalSession();
  let signedInEmail: string | null = null;
  if (session) {
    const u = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { email: true },
    });
    signedInEmail = u?.email ?? null;
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "var(--layer-2, #f5f0ea)" }}>
      <div style={{ maxWidth: 520, width: "100%", background: "var(--color-bg, #fff)", border: "1px solid var(--color-border, #e5dccf)", borderRadius: 12, padding: 32 }}>
        <div style={{ textAlign: "center", marginBottom: 18 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.18em", color: "#c41e3a" }}>OKÜ HOSPITALITY GROUP</span>
        </div>
        <AcceptClient
          token={token}
          lookup={JSON.parse(JSON.stringify(lookup))}
          signedInEmail={signedInEmail}
        />
      </div>
    </div>
  );
}
