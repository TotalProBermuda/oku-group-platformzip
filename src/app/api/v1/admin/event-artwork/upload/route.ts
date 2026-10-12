import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { getUploadPresignUrl } from "@/lib/object-storage";
import { artworkUploadSchema } from "@/server/series/artworkInput";

export async function POST(req: Request) {
  try {
    const { roles } = await requireSession();
    if (!roles.includes("SUPERADMIN")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const parsed = artworkUploadSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Upload a JPG, PNG, WEBP or GIF image up to 10 MB." }, { status: 400 });
    // Derive extension from MIME, not an untrusted filename. Never persist the signed PUT URL.
    const extensions = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif" };
    const result = await getUploadPresignUrl(`artwork${extensions[parsed.data.contentType]}`, parsed.data.contentType);
    return NextResponse.json(result);
  } catch (error) {
    const status = (error as { status?: number }).status;
    return NextResponse.json({ error: status === 401 ? "Unauthorized" : "Artwork storage unavailable." }, { status: status === 401 ? 401 : 503 });
  }
}
