import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";
import {
  adminListDocuments,
  adminPresignUploadFor,
  adminConfirmUploadFor,
  DocumentError,
  ALLOWED_MIME,
  MAX_BYTES,
  DOC_TYPES_TUPLE,
} from "@/server/beneficiaries/beneficiaryDocumentService";
import { scrubErrorMessage } from "@/server/security/logScrub";

export const dynamic = "force-dynamic";

const DocTypeEnum = z.enum(DOC_TYPES_TUPLE);

const PresignBody = z.object({
  action: z.literal("presign"),
  docType: DocTypeEnum,
  filename: z.string().min(1).max(200),
  contentType: z.string().min(1),
  size: z.number().int().positive(),
});

const ConfirmBody = z.object({
  action: z.literal("confirm"),
  docType: DocTypeEnum,
  objectPath: z.string().min(1),
  filename: z.string().min(1).max(200),
  contentType: z.string().min(1),
  size: z.number().int().positive(),
});

const Body = z.discriminatedUnion("action", [PresignBody, ConfirmBody]);

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ userId: string }> },
) {
  try {
    const { roles } = await requireSession();
    requirePermission(roles, "admin:beneficiaries:detail");
    const { userId } = await ctx.params;
    const docs = await adminListDocuments(userId);
    return NextResponse.json({
      ok: true,
      data: docs,
      limits: { maxBytes: MAX_BYTES, allowedMime: ALLOWED_MIME },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: scrubErrorMessage(e) }, { status: e.status || 500 });
  }
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ userId: string }> },
) {
  try {
    const { roles, userId: actorId } = await requireSession();
    requirePermission(roles, "admin:beneficiaries:write");
    const { userId: targetUserId } = await ctx.params;
    const body = Body.parse(await req.json());
    if (body.action === "presign") {
      const out = await adminPresignUploadFor(targetUserId, {
        docType: body.docType,
        filename: body.filename,
        contentType: body.contentType,
        size: body.size,
      });
      return NextResponse.json({ ok: true, data: out });
    }
    const view = await adminConfirmUploadFor(actorId, targetUserId, {
      docType: body.docType,
      objectPath: body.objectPath,
      filename: body.filename,
      contentType: body.contentType,
      size: body.size,
    });
    return NextResponse.json({ ok: true, data: view });
  } catch (e: any) {
    const status = e instanceof DocumentError ? e.status : (e.status || 500);
    return NextResponse.json({ ok: false, error: scrubErrorMessage(e) }, { status });
  }
}
