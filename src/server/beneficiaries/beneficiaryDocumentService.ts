import { prisma } from "@/lib/prisma";
import {
  autoPromoteDocStatusOnUpload,
  autoRevertDocStatusOnDelete,
} from "./beneficiaryService";
import {
  buildBeneficiaryAuditMetadata,
  BENEFICIARY_AUDIT_ACTIONS,
} from "@/server/audit/buildBeneficiaryAuditMetadata";
import {
  getPrivateUploadPresignUrl,
  getReadUrl,
  getObjectMetadata,
  deleteObject,
  readObjectPrefix,
  BUCKET_NAME,
} from "@/lib/object-storage";

// Maximum bytes streamed to the external AV scanner per file. Equal to the
// per-document size limit; the AV endpoint is expected to handle 10 MB.
const AV_SCAN_TIMEOUT_MS = 15_000;

// Cloudmersive advanced-scan endpoint. The advanced variant returns extra
// flags (executables, scripts, macros, password-protected, etc.) that we
// treat as REJECTED even when the file is technically virus-free, because
// Banesco-bound documents must be straightforward PDFs/images.
const CLOUDMERSIVE_AV_URL =
  "https://api.cloudmersive.com/virus/scan/file/advanced";

// ─────────────────────────────────────────────────────────────────────────────
// Beneficiary supporting documents.
//
// Files are stored in the *private* bucket prefix
// `<bucket>/private/beneficiary-docs/<profileId>/<uuid><ext>` and are NEVER
// reachable through the public `/api/v1/media/...` proxy. Reads always go
// through an authenticated route that resolves a short-lived (5 min) signed
// GET URL.
//
// Per-document validation:
//   - MIME ∈ ALLOWED_MIME (PDF / JPEG / PNG / WebP)
//   - Size ≤ MAX_BYTES (10 MB)
//   - After upload, GCS metadata is re-checked server-side (cannot trust the
//     client's claimed size/contentType) and on mismatch the object is
//     deleted and the request rejected.
//
// Per-document scan pipeline (`scanDocument`):
//   1. Magic-byte sniff — rejects type-mismatched / disguised payloads
//      (e.g. `evil.exe` renamed to `passport.pdf`).
//   2. External AV scan — production uses Cloudmersive (set
//      `CLOUDMERSIVE_AV_API_KEY`) which inspects the bytes for known
//      malware signatures plus disallowed traits (executables, scripts,
//      macros, password-protected archives). Self-hosted deployments can
//      instead point `AV_SCAN_URL` at a local HTTP shim wrapping ClamAV
//      / GCP DLP / etc. Cloudmersive takes precedence when both are set.
//      When neither is configured the document is recorded as **PENDING**
//      (NOT fake-CLEAN). Signed-read access is denied until the scan returns
//      CLEAN, so an unscanned upload cannot be downloaded by anyone — self,
//      admin, or share link — until follow-up scanning marks it CLEAN.
//
// Document status flags on `BeneficiaryProfile`:
//   - MISSING ↔ RECEIVED is auto-managed by file lifecycle: a successful
//     upload promotes MISSING → RECEIVED, and deleting the last
//     non-deleted file of that type reverts RECEIVED → MISSING. See
//     `autoPromoteDocStatusOnUpload` / `autoRevertDocStatusOnDelete` in
//     `beneficiaryService.ts`.
//   - VERIFIED, REJECTED, and NOT_REQUIRED are admin-only — never
//     auto-changed by upload/delete. Uploads are evidence, not auto-
//     approval; only an admin can mark a doc VERIFIED.
//   - INCOME_CERTIFICATION has no doc-status field on the profile (it's
//     gated by required + expiry), so it's a no-op for auto-status.
// ─────────────────────────────────────────────────────────────────────────────

export const ALLOWED_MIME = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const MAX_BYTES = 10 * 1024 * 1024; // 10 MB per document

export type DocTypeValue =
  | "PROOF_OF_ADDRESS"
  | "IDENTIFICATION"
  | "TAX_OR_RUC"
  | "SOURCE_OF_FUNDS"
  | "INCOME_CERTIFICATION";

export const DOC_TYPES = [
  "PROOF_OF_ADDRESS",
  "IDENTIFICATION",
  "TAX_OR_RUC",
  "SOURCE_OF_FUNDS",
  "INCOME_CERTIFICATION",
] as const satisfies readonly DocTypeValue[];

/** Tuple form for `z.enum(...)` — keeps the literal union without `as any`. */
export const DOC_TYPES_TUPLE: readonly [DocTypeValue, ...DocTypeValue[]] =
  DOC_TYPES as unknown as readonly [DocTypeValue, ...DocTypeValue[]];

export type ScanStatusValue = "PENDING" | "CLEAN" | "REJECTED";

export type DocumentView = {
  id: string;
  docType: DocTypeValue;
  filename: string;
  contentType: string;
  sizeBytes: number;
  scanStatus: ScanStatusValue;
  scanMessage: string | null;
  uploadedAt: string;
};

export class DocumentError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────

async function ensureProfile(userId: string): Promise<{ id: string }> {
  const existing = await prisma.beneficiaryProfile.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (existing) return existing;
  return prisma.beneficiaryProfile.create({
    data: { userId },
    select: { id: true },
  });
}

function isAllowedMime(s: string): s is (typeof ALLOWED_MIME)[number] {
  return (ALLOWED_MIME as readonly string[]).includes(s);
}

function isDocType(s: string): s is DocTypeValue {
  return (DOC_TYPES as readonly string[]).includes(s);
}

function validatePresign(input: {
  docType: string;
  filename: string;
  contentType: string;
  size: number;
}): void {
  if (!isDocType(input.docType)) {
    throw new DocumentError(`Unknown document type: ${input.docType}`);
  }
  if (!isAllowedMime(input.contentType)) {
    throw new DocumentError(
      `File type not allowed: ${input.contentType}. Allowed: PDF, JPG, PNG, WebP.`,
    );
  }
  if (!Number.isFinite(input.size) || input.size <= 0) {
    throw new DocumentError("File size required");
  }
  if (input.size > MAX_BYTES) {
    throw new DocumentError(
      `File exceeds ${Math.floor(MAX_BYTES / 1024 / 1024)}MB limit`,
    );
  }
  if (!input.filename || input.filename.length > 200) {
    throw new DocumentError("Invalid filename");
  }
}

/**
 * Strict object-path ownership check. The path must be exactly the canonical
 * presign output for this profile: leading bucket, the private prefix, and a
 * single safe filename segment (uuid + lowercase ext). Substring checks are
 * NOT enough — a path like `/foo/private/beneficiary-docs/<id>/x/../../y.pdf`
 * could otherwise slip past.
 */
function isOwnedObjectPath(objectPath: string, profileId: string): boolean {
  if (!BUCKET_NAME) return false;
  const expectedPrefix = `/${BUCKET_NAME}/private/beneficiary-docs/${profileId}/`;
  if (!objectPath.startsWith(expectedPrefix)) return false;
  const tail = objectPath.slice(expectedPrefix.length);
  // uuid v4 (36 chars) + lowercase alphanumeric extension, no slashes / dots
  // beyond the single extension separator.
  return /^[0-9a-f-]{36}\.[a-z0-9]+$/.test(tail);
}

function toView(r: {
  id: string;
  docType: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  scanStatus: string;
  scanMessage: string | null;
  uploadedAt: Date;
}): DocumentView {
  return {
    id: r.id,
    docType: r.docType as DocTypeValue,
    filename: r.filename,
    contentType: r.contentType,
    sizeBytes: r.sizeBytes,
    scanStatus: r.scanStatus as ScanStatusValue,
    scanMessage: r.scanMessage,
    uploadedAt: r.uploadedAt.toISOString(),
  };
}

async function listForProfile(profileId: string): Promise<DocumentView[]> {
  const rows = await prisma.beneficiaryDocument.findMany({
    where: { profileId, deletedAt: null },
    orderBy: { uploadedAt: "desc" },
  });
  return rows.map(toView);
}

// ─── Reads ────────────────────────────────────────────────────────────────

export async function listOwnDocuments(userId: string): Promise<DocumentView[]> {
  const p = await prisma.beneficiaryProfile.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!p) return [];
  return listForProfile(p.id);
}

export async function adminListDocuments(
  targetUserId: string,
): Promise<DocumentView[]> {
  const p = await prisma.beneficiaryProfile.findUnique({
    where: { userId: targetUserId },
    select: { id: true },
  });
  if (!p) return [];
  return listForProfile(p.id);
}

// ─── Presign + confirm flow (self-service) ─────────────────────────────────

export type PresignInput = {
  docType: DocTypeValue;
  filename: string;
  contentType: string;
  size: number;
};

export async function presignOwnUpload(
  userId: string,
  input: PresignInput,
): Promise<{ uploadUrl: string; objectPath: string }> {
  validatePresign(input);
  const profile = await ensureProfile(userId);
  return getPrivateUploadPresignUrl(
    `beneficiary-docs/${profile.id}`,
    input.filename,
    input.contentType,
  );
}

export type ConfirmInput = PresignInput & { objectPath: string };

/**
 * Inspect the first bytes of the uploaded object and return the detected
 * file family. Defends against:
 *   - Content-Type spoofing (claimed application/pdf but actually a PE/ELF
 *     binary or a script).
 *   - Empty / truncated uploads.
 *
 * This is NOT a virus scanner — see `scanDocument` for the seam where a real
 * AV product (ClamAV, GCP DLP, etc.) should be wired in. This sniff alone
 * does block the most common foot-gun (uploading `evil.exe` and renaming it
 * `passport.pdf`) and is a hard prerequisite for any future AV step.
 */
function sniffFileFamily(buf: Buffer): "pdf" | "jpeg" | "png" | "webp" | "unknown" {
  if (buf.length >= 4 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return "pdf"; // %PDF
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) return "png";
  if (
    buf.length >= 12 &&
    buf.slice(0, 4).toString("ascii") === "RIFF" &&
    buf.slice(8, 12).toString("ascii") === "WEBP"
  ) return "webp";
  return "unknown";
}

const FAMILY_TO_MIME: Record<"pdf" | "jpeg" | "png" | "webp", (typeof ALLOWED_MIME)[number]> = {
  pdf: "application/pdf",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/**
 * Stream the full object body to the configured external AV endpoint and
 * accept its verdict. Expected response body:
 *   { "clean": boolean, "message"?: string }
 *
 * Returns:
 *   - { status: "CLEAN" } if the scanner returned `{clean:true}`
 *   - { status: "REJECTED" } if it returned `{clean:false}` or an EICAR /
 *     malware verdict (any non-clean response)
 *   - { status: "PENDING" } if the scanner is unreachable / timed out / sent
 *     a malformed response — we do NOT optimistically pass these through;
 *     instead the document stays unreadable until re-scan.
 */
async function callExternalAv(
  objectPath: string,
  contentType: string,
  url: string,
): Promise<{ status: ScanStatusValue; message: string }> {
  const buf = await readObjectPrefix(objectPath, MAX_BYTES);
  if (!buf || buf.length === 0) {
    return { status: "REJECTED", message: "Could not read uploaded bytes" };
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), AV_SCAN_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": contentType },
      body: new Uint8Array(buf),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      return {
        status: "PENDING",
        message: `av:http_${res.status}`,
      };
    }
    const j = (await res.json().catch(() => null)) as
      | { clean?: boolean; message?: string }
      | null;
    if (!j || typeof j.clean !== "boolean") {
      return { status: "PENDING", message: "av:malformed_response" };
    }
    if (j.clean) {
      return { status: "CLEAN", message: `av:clean${j.message ? `:${j.message}` : ""}` };
    }
    return {
      status: "REJECTED",
      message: `av:infected${j.message ? `:${j.message}` : ""}`,
    };
  } catch (e: any) {
    return {
      status: "PENDING",
      message: `av:unreachable:${e?.name || "error"}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Cloudmersive Advanced AV — production scanner. Streams the file as
 * multipart/form-data to `/virus/scan/file/advanced` with the API key in the
 * `Apikey` header. The advanced response carries both a `CleanResult`
 * boolean and a set of trait flags (executables, scripts, macros,
 * password-protected archives, invalid file format). Banesco-bound
 * documents must be plain PDFs/images, so any of those trait flags is
 * also treated as REJECTED — even when CleanResult is true.
 *
 * Verdict mapping:
 *   - 200 + CleanResult:true + no disallowed traits   → CLEAN
 *   - 200 + CleanResult:false                         → REJECTED (with virus name)
 *   - 200 + CleanResult:true but ContainsExecutable / ContainsScript /
 *     ContainsMacros / ContainsPasswordProtectedFile / ContainsXmlExternalEntities /
 *     ContainsInsecureDeserialization / ContainsHtml / ContainsInvalidFile /
 *     ContainsRestrictedFileFormat → REJECTED
 *   - 401/402/403 (key invalid / quota exhausted)     → PENDING (do not pass-through)
 *   - other non-2xx / network / timeout / malformed   → PENDING
 */
type CloudmersiveResponse = {
  CleanResult?: boolean;
  FoundViruses?: Array<{ FileName?: string; VirusName?: string }> | null;
  ContainsExecutable?: boolean;
  ContainsInvalidFile?: boolean;
  ContainsScript?: boolean;
  ContainsPasswordProtectedFile?: boolean;
  ContainsRestrictedFileFormat?: boolean;
  ContainsMacros?: boolean;
  ContainsXmlExternalEntities?: boolean;
  ContainsInsecureDeserialization?: boolean;
  ContainsHtml?: boolean;
  VerifiedFileFormat?: string | null;
};

async function callCloudmersiveAv(
  objectPath: string,
  filename: string,
  apiKey: string,
): Promise<{ status: ScanStatusValue; message: string }> {
  const buf = await readObjectPrefix(objectPath, MAX_BYTES);
  if (!buf || buf.length === 0) {
    return { status: "REJECTED", message: "Could not read uploaded bytes" };
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), AV_SCAN_TIMEOUT_MS);
  try {
    const safeName = filename.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120);
    const form = new FormData();
    form.append(
      "inputFile",
      new Blob([new Uint8Array(buf)], { type: "application/octet-stream" }),
      safeName || "upload.bin",
    );
    const res = await fetch(CLOUDMERSIVE_AV_URL, {
      method: "POST",
      headers: { Apikey: apiKey },
      body: form,
      signal: ctrl.signal,
    });
    if (!res.ok) {
      return { status: "PENDING", message: `cloudmersive:http_${res.status}` };
    }
    const j = (await res.json().catch(() => null)) as CloudmersiveResponse | null;
    if (!j || typeof j.CleanResult !== "boolean") {
      return { status: "PENDING", message: "cloudmersive:malformed_response" };
    }
    if (j.CleanResult === false) {
      const virus = j.FoundViruses?.[0]?.VirusName || "unknown";
      return { status: "REJECTED", message: `cloudmersive:infected:${virus}` };
    }
    const traits: string[] = [];
    if (j.ContainsExecutable) traits.push("executable");
    if (j.ContainsScript) traits.push("script");
    if (j.ContainsMacros) traits.push("macros");
    if (j.ContainsPasswordProtectedFile) traits.push("password_protected");
    if (j.ContainsXmlExternalEntities) traits.push("xxe");
    if (j.ContainsInsecureDeserialization) traits.push("insecure_deserialization");
    if (j.ContainsHtml) traits.push("html");
    if (j.ContainsInvalidFile) traits.push("invalid_file");
    if (j.ContainsRestrictedFileFormat) traits.push("restricted_format");
    if (traits.length > 0) {
      return {
        status: "REJECTED",
        message: `cloudmersive:disallowed_traits:${traits.join(",")}`,
      };
    }
    return { status: "CLEAN", message: "cloudmersive:clean" };
  } catch (e: any) {
    return {
      status: "PENDING",
      message: `cloudmersive:unreachable:${e?.name || "error"}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Per-document scan pipeline. See file-level header for the policy.
 *   1. Size + Content-Type re-validation against server limits.
 *   2. Magic-byte sniff against the claimed Content-Type.
 *   3. External AV scan when `AV_SCAN_URL` is set; otherwise PENDING.
 *
 * REJECTED short-circuits all later steps and the upload is deleted by the
 * caller. PENDING means "stored but not readable" — admins still see the
 * row with the PENDING badge so they know a scan is owed.
 */
async function scanDocument(
  objectPath: string,
  meta: { size: number; contentType: string | null },
  claimedContentType: string,
  filename: string,
): Promise<{ status: ScanStatusValue; message: string }> {
  if (meta.contentType && !isAllowedMime(meta.contentType)) {
    return { status: "REJECTED", message: `Disallowed content-type: ${meta.contentType}` };
  }
  if (meta.size > MAX_BYTES) {
    return { status: "REJECTED", message: "Exceeds size limit" };
  }
  if (meta.size === 0) {
    return { status: "REJECTED", message: "Empty upload" };
  }
  const head = await readObjectPrefix(objectPath, 16);
  if (!head || head.length === 0) {
    return { status: "REJECTED", message: "Could not read uploaded bytes" };
  }
  const family = sniffFileFamily(head);
  if (family === "unknown") {
    return { status: "REJECTED", message: "File contents do not match an allowed type (PDF/JPG/PNG/WebP)" };
  }
  const sniffedMime = FAMILY_TO_MIME[family];
  if (sniffedMime !== claimedContentType) {
    return {
      status: "REJECTED",
      message: `Declared ${claimedContentType} but file is ${sniffedMime}`,
    };
  }

  const cloudmersiveKey = process.env.CLOUDMERSIVE_AV_API_KEY;
  if (cloudmersiveKey) {
    return callCloudmersiveAv(objectPath, filename, cloudmersiveKey);
  }
  const avUrl = process.env.AV_SCAN_URL;
  if (avUrl) {
    return callExternalAv(objectPath, claimedContentType, avUrl);
  }
  // No scanner wired → keep the file but mark it PENDING. Signed-read
  // routes refuse PENDING, so unscanned files cannot be downloaded.
  return { status: "PENDING", message: "av:not_configured" };
}

async function confirmUpload(
  uploaderUserId: string,
  profileId: string,
  input: ConfirmInput,
): Promise<DocumentView> {
  validatePresign(input);
  // Strict ownership check (see isOwnedObjectPath). Substring matching is
  // not enough — the path must be the exact canonical presign output for
  // this profile. Reject before doing any storage work.
  if (!isOwnedObjectPath(input.objectPath, profileId)) {
    throw new DocumentError("Invalid object path for this profile");
  }
  const meta = await getObjectMetadata(input.objectPath);
  if (!meta) throw new DocumentError("Upload not found in storage");

  const scan = await scanDocument(
    input.objectPath,
    meta,
    input.contentType,
    input.filename,
  );
  if (scan.status === "REJECTED") {
    await deleteObject(input.objectPath);
    throw new DocumentError(scan.message);
  }

  const row = await prisma.beneficiaryDocument.create({
    data: {
      profileId,
      docType: input.docType,
      filename: input.filename.slice(0, 200),
      contentType: input.contentType,
      sizeBytes: meta.size,
      objectPath: input.objectPath,
      scanStatus: scan.status,
      scanMessage: scan.message,
      uploadedById: uploaderUserId,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: uploaderUserId,
      action: "beneficiary.document.uploaded",
      metadata: {
        profileId,
        docType: input.docType,
        sizeBytes: meta.size,
        contentType: input.contentType,
        scanStatus: scan.status,
      },
    },
  });

  // Auto-promote MISSING → RECEIVED for the corresponding doc-status
  // field on the profile. VERIFIED / REJECTED / NOT_REQUIRED are left
  // untouched — admins keep control of those terminal states.
  const profile = await prisma.beneficiaryProfile.findUnique({
    where: { id: profileId },
    select: { userId: true },
  });
  if (profile) {
    await autoPromoteDocStatusOnUpload({
      profileId,
      targetUserId: profile.userId,
      actorId: uploaderUserId,
      docType: input.docType,
    });
  }

  return toView(row);
}

export async function confirmOwnUpload(
  userId: string,
  input: ConfirmInput,
): Promise<DocumentView> {
  const profile = await ensureProfile(userId);
  return confirmUpload(userId, profile.id, input);
}

export async function adminConfirmUploadFor(
  actorId: string,
  targetUserId: string,
  input: ConfirmInput,
): Promise<DocumentView> {
  const profile = await ensureProfile(targetUserId);
  return confirmUpload(actorId, profile.id, input);
}

export async function adminPresignUploadFor(
  targetUserId: string,
  input: PresignInput,
): Promise<{ uploadUrl: string; objectPath: string }> {
  validatePresign(input);
  const profile = await ensureProfile(targetUserId);
  return getPrivateUploadPresignUrl(
    `beneficiary-docs/${profile.id}`,
    input.filename,
    input.contentType,
  );
}

// ─── Signed read URLs ──────────────────────────────────────────────────────

const READ_TTL_SEC = 300;

async function loadDoc(docId: string) {
  return prisma.beneficiaryDocument.findUnique({
    where: { id: docId },
    include: { profile: { select: { userId: true } } },
  });
}

function assertReadable(doc: { scanStatus: string; scanMessage: string | null }): void {
  // Policy: signed-read URLs are issued ONLY for documents the scanner has
  // confirmed clean. PENDING (no scanner / scanner timed out) and REJECTED
  // are both denied — the file exists in private storage but nobody can
  // download it through this API surface until status flips to CLEAN.
  if (doc.scanStatus === "CLEAN") return;
  const reason =
    doc.scanStatus === "REJECTED"
      ? `Document was rejected by the security scan${doc.scanMessage ? `: ${doc.scanMessage}` : ""}`
      : "Document is awaiting security scan and cannot be downloaded yet";
  throw new DocumentError(reason, 409);
}

export async function getOwnDocumentSignedUrl(
  userId: string,
  docId: string,
): Promise<{ url: string; expiresInSec: number; filename: string; contentType: string }> {
  const doc = await loadDoc(docId);
  if (!doc || doc.deletedAt || doc.profile.userId !== userId) {
    throw new DocumentError("Document not found", 404);
  }
  assertReadable(doc);
  const url = await getReadUrl(doc.objectPath, READ_TTL_SEC);
  return {
    url,
    expiresInSec: READ_TTL_SEC,
    filename: doc.filename,
    contentType: doc.contentType,
  };
}

export async function adminGetDocumentSignedUrl(
  targetUserId: string,
  docId: string,
  actorId: string,
): Promise<{ url: string; expiresInSec: number; filename: string; contentType: string }> {
  const doc = await loadDoc(docId);
  if (!doc || doc.deletedAt || doc.profile.userId !== targetUserId) {
    throw new DocumentError("Document not found", 404);
  }
  assertReadable(doc);
  const url = await getReadUrl(doc.objectPath, READ_TTL_SEC);
  await prisma.auditLog.create({
    data: {
      actorId,
      action: BENEFICIARY_AUDIT_ACTIONS.documentViewed,
      metadata: buildBeneficiaryAuditMetadata({
        targetUserId,
        docId: doc.id,
        docType: doc.docType,
        source: "document_url",
      }),
    },
  });
  return {
    url,
    expiresInSec: READ_TTL_SEC,
    filename: doc.filename,
    contentType: doc.contentType,
  };
}

// ─── Deletes ───────────────────────────────────────────────────────────────

async function softDelete(actorId: string, doc: { id: string; objectPath: string; docType: string; profile: { userId: string } }) {
  await prisma.beneficiaryDocument.update({
    where: { id: doc.id },
    data: { deletedAt: new Date() },
  });
  await deleteObject(doc.objectPath);
  await prisma.auditLog.create({
    data: {
      actorId,
      action: "beneficiary.document.deleted",
      metadata: { docId: doc.id, targetUserId: doc.profile.userId, docType: doc.docType },
    },
  });

  // If this was the last non-deleted file of its type and the profile flag
  // is currently RECEIVED (set by a prior auto-promote), revert to MISSING.
  // VERIFIED / REJECTED / NOT_REQUIRED are left untouched.
  const docRow = await prisma.beneficiaryDocument.findUnique({
    where: { id: doc.id },
    select: { profileId: true },
  });
  if (docRow) {
    await autoRevertDocStatusOnDelete({
      profileId: docRow.profileId,
      targetUserId: doc.profile.userId,
      actorId,
      docType: doc.docType,
    });
  }
}

export async function deleteOwnDocument(
  userId: string,
  docId: string,
): Promise<void> {
  const doc = await loadDoc(docId);
  if (!doc || doc.deletedAt || doc.profile.userId !== userId) {
    throw new DocumentError("Document not found", 404);
  }
  await softDelete(userId, doc);
}

export async function adminDeleteDocument(
  actorId: string,
  targetUserId: string,
  docId: string,
): Promise<void> {
  const doc = await loadDoc(docId);
  if (!doc || doc.deletedAt || doc.profile.userId !== targetUserId) {
    throw new DocumentError("Document not found", 404);
  }
  await softDelete(actorId, doc);
}
