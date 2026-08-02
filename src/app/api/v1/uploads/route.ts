import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUploadPresignUrl } from "@/lib/object-storage";

const ALLOWED_TYPES = [
  "image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml",
  "video/mp4", "video/webm", "video/quicktime",
];
const MAX_BYTES = 20 * 1024 * 1024; // 20 MB hard cap

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { filename, contentType, size } = body;

  if (!filename || !contentType) {
    return NextResponse.json({ error: "filename and contentType required" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(contentType)) {
    return NextResponse.json({ error: `File type not allowed: ${contentType}` }, { status: 400 });
  }
  if (size && size > MAX_BYTES) {
    return NextResponse.json({ error: "File exceeds 20MB limit" }, { status: 400 });
  }

  try {
    const result = await getUploadPresignUrl(filename, contentType);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("Upload presign error:", err);
    return NextResponse.json({ error: "Storage unavailable" }, { status: 503 });
  }
}
