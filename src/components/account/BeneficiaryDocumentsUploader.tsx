"use client";

import { useEffect, useRef, useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Reusable beneficiary-document uploader. Used by both the self-service form
// (/my/beneficiary) and the admin drawer (/admin/payouts/beneficiaries).
//
// Flow per upload:
//   1. POST { action: "presign", docType, filename, contentType, size } →
//      { uploadUrl, objectPath }
//   2. PUT the file body to uploadUrl with Content-Type header set.
//   3. POST { action: "confirm", docType, objectPath, filename, contentType,
//      size } → DocumentView. Server re-checks GCS metadata, runs the scan
//      hook, and persists the row.
// ─────────────────────────────────────────────────────────────────────────────

export type DocTypeValue =
  | "PROOF_OF_ADDRESS"
  | "IDENTIFICATION"
  | "TAX_OR_RUC"
  | "SOURCE_OF_FUNDS"
  | "INCOME_CERTIFICATION";

export type DocumentView = {
  id: string;
  docType: DocTypeValue;
  filename: string;
  contentType: string;
  sizeBytes: number;
  scanStatus: "PENDING" | "CLEAN" | "REJECTED";
  scanMessage: string | null;
  uploadedAt: string;
};

const DOC_LABELS: Record<DocTypeValue, string> = {
  PROOF_OF_ADDRESS: "Proof of address",
  IDENTIFICATION: "ID / passport",
  TAX_OR_RUC: "Tax / RUC",
  SOURCE_OF_FUNDS: "Source of funds",
  INCOME_CERTIFICATION: "Income certification",
};

const DOC_TYPES: DocTypeValue[] = [
  "PROOF_OF_ADDRESS",
  "IDENTIFICATION",
  "TAX_OR_RUC",
  "SOURCE_OF_FUNDS",
  "INCOME_CERTIFICATION",
];

const ALLOWED_MIME = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 10 * 1024 * 1024;

function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default function BeneficiaryDocumentsUploader({
  listEndpoint,
  itemEndpoint,
  initial,
  showIncomeCert = true,
  canDelete = true,
}: {
  /** GET / POST endpoint for list + presign + confirm. */
  listEndpoint: string;
  /** Returns the per-doc base URL given a document id (used for DELETE + url). */
  itemEndpoint: (id: string) => string;
  initial: DocumentView[];
  showIncomeCert?: boolean;
  canDelete?: boolean;
}) {
  const [docs, setDocs] = useState<DocumentView[]>(initial);
  const [busyType, setBusyType] = useState<DocTypeValue | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const inputRefs = useRef<Partial<Record<DocTypeValue, HTMLInputElement | null>>>({});

  // Refresh the list whenever `initial` changes (admin opens a different drawer).
  useEffect(() => { setDocs(initial); }, [initial]);

  async function reload() {
    const res = await fetch(listEndpoint, { cache: "no-store" });
    const json = await res.json();
    if (json.ok) setDocs(json.data);
  }

  async function upload(docType: DocTypeValue, file: File) {
    setErr(null);
    if (!ALLOWED_MIME.includes(file.type)) {
      setErr(`File type not allowed: ${file.type || "unknown"}. Use PDF, JPG, PNG, or WebP.`);
      return;
    }
    if (file.size > MAX_BYTES) {
      setErr(`File exceeds ${MAX_BYTES / 1024 / 1024}MB limit.`);
      return;
    }
    setBusyType(docType);
    try {
      // 1. presign
      const presignRes = await fetch(listEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "presign",
          docType,
          filename: file.name,
          contentType: file.type,
          size: file.size,
        }),
      });
      const presignJson = await presignRes.json();
      if (!presignJson.ok) throw new Error(presignJson.error || "Presign failed");
      const { uploadUrl, objectPath } = presignJson.data as {
        uploadUrl: string;
        objectPath: string;
      };

      // 2. PUT to GCS
      const putRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!putRes.ok) throw new Error(`Upload failed (${putRes.status})`);

      // 3. confirm
      const confirmRes = await fetch(listEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "confirm",
          docType,
          objectPath,
          filename: file.name,
          contentType: file.type,
          size: file.size,
        }),
      });
      const confirmJson = await confirmRes.json();
      if (!confirmJson.ok) throw new Error(confirmJson.error || "Confirm failed");

      setDocs((prev) => [confirmJson.data as DocumentView, ...prev]);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusyType(null);
      const ref = inputRefs.current[docType];
      if (ref) ref.value = "";
    }
  }

  async function openDoc(doc: DocumentView) {
    setErr(null);
    try {
      const res = await fetch(`${itemEndpoint(doc.id)}/url`, { cache: "no-store" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Could not open document");
      window.open(json.data.url, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      setErr(e.message);
    }
  }

  async function deleteDoc(doc: DocumentView) {
    if (!window.confirm(`Delete "${doc.filename}"?`)) return;
    setErr(null);
    try {
      const res = await fetch(itemEndpoint(doc.id), { method: "DELETE" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Delete failed");
      setDocs((prev) => prev.filter((d) => d.id !== doc.id));
    } catch (e: any) {
      setErr(e.message);
    }
  }

  const types = showIncomeCert ? DOC_TYPES : DOC_TYPES.filter((t) => t !== "INCOME_CERTIFICATION");

  return (
    <div>
      <div style={{ fontSize: 12, color: "#7d7269", marginBottom: 10 }}>
        Allowed: PDF, JPG, PNG, WebP — up to {MAX_BYTES / 1024 / 1024} MB per file.
        Files are stored privately and only accessible via short-lived links.
      </div>
      {err && (
        <div style={{ background: "#fbe3e1", border: "1px solid #f0c2bd", borderRadius: 6, padding: 8, marginBottom: 10, fontSize: 12, color: "#7a1a1a" }}>
          {err}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {types.map((t) => {
          const items = docs.filter((d) => d.docType === t);
          const busy = busyType === t;
          return (
            <div key={t} style={{ border: "1px solid #e8e2dd", borderRadius: 8, padding: 10, background: "#fafafa" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{DOC_LABELS[t]}</div>
                <label style={{ fontSize: 12, color: "#1f1d1b", cursor: busy ? "wait" : "pointer", border: "1px solid #d6cdc4", padding: "4px 10px", borderRadius: 6, background: "#fff" }}>
                  {busy ? "Uploading…" : "Upload"}
                  <input
                    ref={(el) => { inputRefs.current[t] = el; }}
                    type="file"
                    accept={ALLOWED_MIME.join(",")}
                    style={{ display: "none" }}
                    disabled={busy}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) upload(t, f);
                    }}
                  />
                </label>
              </div>
              {items.length === 0 ? (
                <div style={{ fontSize: 12, color: "#9b8f85", marginTop: 6 }}>No file uploaded.</div>
              ) : (
                <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0 0", display: "flex", flexDirection: "column", gap: 4 }}>
                  {items.map((d) => (
                    <li key={d.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, fontSize: 12, background: "#fff", border: "1px solid #ece5dc", borderRadius: 6, padding: "6px 8px" }}>
                      <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={d.filename}>
                          {d.filename}
                        </span>
                        <span style={{ color: "#7d7269", fontSize: 11 }}>
                          {fmtSize(d.sizeBytes)} · {new Date(d.uploadedAt).toLocaleDateString()} · scan: {d.scanStatus.toLowerCase()}
                        </span>
                      </div>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button onClick={() => openDoc(d)} style={btn}>View</button>
                        {canDelete && (
                          <button onClick={() => deleteDoc(d)} style={{ ...btn, color: "#a01a1a" }}>Delete</button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
      <button
        onClick={reload}
        style={{ marginTop: 10, fontSize: 11, color: "#7d7269", background: "transparent", border: 0, cursor: "pointer", textDecoration: "underline" }}
      >
        Refresh
      </button>
    </div>
  );
}

const btn: React.CSSProperties = {
  padding: "3px 8px",
  border: "1px solid #d6cdc4",
  borderRadius: 4,
  background: "#fff",
  fontSize: 11,
  cursor: "pointer",
};
