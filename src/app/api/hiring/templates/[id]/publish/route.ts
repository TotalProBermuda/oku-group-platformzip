import { NextResponse } from "next/server";
import { publishTemplate } from "@/lib/hiring/template-versioning";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const version = await publishTemplate(id);
    return NextResponse.json(version, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Publish failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
