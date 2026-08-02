/**
 * Replit Object Storage adapter for Next.js App Router.
 * Adapted from the Replit App Storage blueprint for use without Express.
 */

import { Storage } from "@google-cloud/storage";
import { randomUUID } from "crypto";
import path from "path";

const SIDECAR = "http://127.0.0.1:1106";
const BUCKET_PATH = process.env.PUBLIC_OBJECT_SEARCH_PATHS?.split(",")[0]?.trim() ?? "";

// bucket name is the first segment after leading slash
function parsePath(fullPath: string): { bucket: string; object: string } {
  const p = fullPath.startsWith("/") ? fullPath.slice(1) : fullPath;
  const idx = p.indexOf("/");
  if (idx === -1) return { bucket: p, object: "" };
  return { bucket: p.slice(0, idx), object: p.slice(idx + 1) };
}

const { bucket: BUCKET_NAME } = parsePath(BUCKET_PATH);

export const gcsClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${SIDECAR}/token`,
    type: "external_account",
    credential_source: {
      url: `${SIDECAR}/credential`,
      format: { type: "json", subject_token_field_name: "access_token" },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
} as any);

async function signUrl({
  bucket,
  object,
  method,
  ttlSec,
}: {
  bucket: string;
  object: string;
  method: "PUT" | "GET" | "DELETE";
  ttlSec: number;
}): Promise<string> {
  const res = await fetch(`${SIDECAR}/object-storage/signed-object-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bucket_name: bucket,
      object_name: object,
      method,
      expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
    }),
  });
  if (!res.ok) throw new Error(`Sidecar sign error: ${res.status}`);
  const { signed_url } = await res.json();
  return signed_url;
}

/**
 * Generate a presigned PUT URL for direct browser-to-GCS upload.
 * Returns the uploadUrl (PUT to this) and objectPath (store this in the DB).
 */
export async function getUploadPresignUrl(
  filename: string,
  contentType: string
): Promise<{ uploadUrl: string; objectPath: string; mediaUrl: string }> {
  const ext = path.extname(filename).toLowerCase() || "";
  const uuid = randomUUID();
  const objectName = `public/uploads/${uuid}${ext}`;

  const uploadUrl = await signUrl({
    bucket: BUCKET_NAME,
    object: objectName,
    method: "PUT",
    ttlSec: 900, // 15 min to complete upload
  });

  const objectPath = `/${BUCKET_NAME}/${objectName}`;
  const mediaUrl = `/api/v1/media/${BUCKET_NAME}/${objectName}`;

  return { uploadUrl, objectPath, mediaUrl };
}

/**
 * Generate a short-lived signed GET URL for serving a stored object.
 * Used by the media proxy route.
 */
export async function getReadUrl(objectPath: string, ttlSec = 3600): Promise<string> {
  // objectPath expected: /bucket/object or bucket/object
  const { bucket, object } = parsePath(objectPath);
  return signUrl({ bucket, object, method: "GET", ttlSec });
}

/**
 * Check if an object exists in GCS.
 */
export async function objectExists(objectPath: string): Promise<boolean> {
  const { bucket, object } = parsePath(objectPath);
  const [exists] = await gcsClient.bucket(bucket).file(object).exists();
  return exists;
}

/**
 * Generate a presigned PUT URL into a *private* prefix. Files written here are
 * NOT served by the public `/api/v1/media/...` proxy — callers must build a
 * route that authenticates the user and resolves a short-lived signed GET URL
 * on demand. Used by the beneficiary document upload flow.
 *
 * The final object name is `private/<pathPrefix>/<uuid><ext>`. The leading
 * `private/` segment is checked by the public media proxy and rejected.
 */
export async function getPrivateUploadPresignUrl(
  pathPrefix: string,
  filename: string,
  contentType: string,
): Promise<{ uploadUrl: string; objectPath: string }> {
  const ext = path.extname(filename).toLowerCase() || "";
  const uuid = randomUUID();
  const cleanPrefix = pathPrefix.replace(/^\/+|\/+$/g, "");
  const objectName = `private/${cleanPrefix}/${uuid}${ext}`;
  const uploadUrl = await signUrl({
    bucket: BUCKET_NAME,
    object: objectName,
    method: "PUT",
    ttlSec: 900,
  });
  const objectPath = `/${BUCKET_NAME}/${objectName}`;
  return { uploadUrl, objectPath };
}

/** Fetch object size + contentType from GCS, or null if missing. */
export async function getObjectMetadata(
  objectPath: string,
): Promise<{ size: number; contentType: string | null } | null> {
  const { bucket, object } = parsePath(objectPath);
  try {
    const [meta] = await gcsClient.bucket(bucket).file(object).getMetadata();
    return {
      size: Number(meta.size ?? 0),
      contentType: (meta.contentType as string | null) ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Download the first `byteLen` bytes of an object — used for content-sniffing
 * (magic-byte check) on uploads we don't trust by claimed Content-Type alone.
 * Returns null when the object is missing.
 */
export async function readObjectPrefix(
  objectPath: string,
  byteLen: number,
): Promise<Buffer | null> {
  const { bucket, object } = parsePath(objectPath);
  try {
    const file = gcsClient.bucket(bucket).file(object);
    const [buf] = await file.download({ start: 0, end: Math.max(0, byteLen - 1) });
    return buf as Buffer;
  } catch {
    return null;
  }
}

/** Best-effort delete; missing objects are not an error. */
export async function deleteObject(objectPath: string): Promise<void> {
  const { bucket, object } = parsePath(objectPath);
  try {
    await gcsClient.bucket(bucket).file(object).delete();
  } catch {
    // ignore — already gone, or permission/transient
  }
}

export { BUCKET_NAME };
