import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import StageTransitionForm from "@/components/hiring/StageTransitionForm";

const EVENT_LABELS: Record<string, string> = {
  SYSTEM:               "System",
  STATUS_CHANGE:        "Status Changed",
  NOTE:                 "Note",
  REVIEW:               "Reviewed",
  SCORE:                "Scored",
  INTERVIEW_REQUESTED:  "Interview Requested",
  INTERVIEW_SCHEDULED:  "Interview Scheduled",
  DOCUMENT_REQUESTED:   "Document Requested",
  DOCUMENT_RECEIVED:    "Document Received",
  OFFER_REQUESTED:      "Offer Requested",
  OFFER_SENT:           "Offer Sent",
  REJECTION_SENT:       "Rejection Sent",
  HIRED:                "Hired",
};

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const app = await prisma.applicationSubmission.findUnique({
    where: { id },
    include: {
      applicantProfile: true,
      opportunity: true,
      workflowEvents: { orderBy: { createdAt: "desc" } },
      stageTransitions: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!app) notFound();

  const normalized = app.normalizedSnapshotJson as Record<string, unknown> | null;
  const submissionData = app.submissionDataJson as Record<string, unknown>;

  return (
    <>
      <div style={{ marginBottom: 24 }}>
        <Link href="/admin/hiring/applications" style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
          ← Back to Applications
        </Link>
        <h2 className="section-title" style={{ marginTop: 12 }}>Application Review</h2>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 24, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div className="card" style={{ padding: 24 }}>
            <h3 style={{ fontFamily: "var(--font-heading)", fontSize: 18, fontWeight: 500, margin: "0 0 4px" }}>
              {app.applicantProfile.fullName}
            </h3>
            <p style={{ fontSize: 14, color: "var(--color-text-muted)", margin: "0 0 16px" }}>
              {app.applicantProfile.email}
              {app.applicantProfile.phone ? ` · ${app.applicantProfile.phone}` : ""}
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: 4 }}>Opportunity</div>
                <div style={{ fontSize: 14 }}>{app.opportunity.title}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: 4 }}>Status</div>
                <div style={{ fontSize: 14, fontWeight: 500, color: "var(--color-crimson)" }}>{app.status.replaceAll("_", " ")}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: 4 }}>Submitted</div>
                <div style={{ fontSize: 14 }}>
                  {app.submittedAt
                    ? new Date(app.submittedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
                    : "—"}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: 4 }}>Source</div>
                <div style={{ fontSize: 14 }}>{app.source ?? "manual"}</div>
              </div>
            </div>
          </div>

          {normalized && (
            <div className="card" style={{ padding: 24 }}>
              <h3 style={{ fontFamily: "var(--font-heading)", fontSize: 16, fontWeight: 500, margin: "0 0 16px" }}>
                Normalized Summary
              </h3>
              <div style={{ display: "grid", gap: 10 }}>
                {Object.entries(normalized).map(([k, v]) => (
                  <div key={k} style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 8, fontSize: 14 }}>
                    <div style={{ color: "var(--color-text-muted)", fontWeight: 500 }}>
                      {k.replace(/([A-Z])/g, " $1").trim()}
                    </div>
                    <div>
                      {Array.isArray(v)
                        ? v.join(", ") || "—"
                        : v === null || v === undefined
                        ? "—"
                        : String(v)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="card" style={{ padding: 24 }}>
            <h3 style={{ fontFamily: "var(--font-heading)", fontSize: 16, fontWeight: 500, margin: "0 0 16px" }}>
              Raw Submission Data
            </h3>
            <pre
              style={{
                background: "var(--color-bg-secondary, #f8f5f3)",
                border: "1px solid var(--color-border)",
                borderRadius: 8,
                padding: 16,
                fontSize: 12,
                overflowX: "auto",
                margin: 0,
              }}
            >
              {JSON.stringify(submissionData, null, 2)}
            </pre>
          </div>

          {app.workflowEvents.length > 0 && (
            <div className="card" style={{ padding: 24 }}>
              <h3 style={{ fontFamily: "var(--font-heading)", fontSize: 16, fontWeight: 500, margin: "0 0 16px" }}>
                Activity Timeline
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {app.workflowEvents.map((event, i) => (
                  <div
                    key={event.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "120px 1fr",
                      gap: 12,
                      paddingBottom: i < app.workflowEvents.length - 1 ? 16 : 0,
                      marginBottom: i < app.workflowEvents.length - 1 ? 16 : 0,
                      borderBottom: i < app.workflowEvents.length - 1 ? "1px solid var(--color-border)" : "none",
                    }}
                  >
                    <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                      {new Date(event.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                      <br />
                      {new Date(event.createdAt).toLocaleTimeString("en-US", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>
                        {EVENT_LABELS[event.type] ?? event.type}
                      </div>
                      {event.payloadJson && (
                        <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 2 }}>
                          {typeof (event.payloadJson as Record<string, unknown>).message === "string"
                            ? String((event.payloadJson as Record<string, unknown>).message)
                            : event.type === "STATUS_CHANGE"
                            ? `${(event.payloadJson as Record<string, unknown>).from} → ${(event.payloadJson as Record<string, unknown>).to}`
                            : null}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <StageTransitionForm applicationId={app.id} currentStatus={app.status} />
        </div>
      </div>
    </>
  );
}
