import { NextResponse } from "next/server";
import { getReadUrl } from "@/lib/object-storage";

export async function GET(
  _: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  // Defensive: the public media proxy is unauthenticated. Anything stored
  // under `<bucket>/private/...` (e.g. beneficiary documents) must NOT be
  // reachable through this route. Object layout is [bucket, ...objectName].
  if (path[1] === "private") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const objectPath = path.join("/");

  try {
    const signedUrl = await getReadUrl(objectPath, 3600);
    return NextResponse.redirect(signedUrl, {
      status: 302,
      headers: {
        "Cache-Control": "public, max-age=3000, s-maxage=3000",
      },
    });
  } catch (err: any) {
    console.error("Media serve error:", err);
    return NextResponse.json({ error: "Media not found" }, { status: 404 });
  }
}
