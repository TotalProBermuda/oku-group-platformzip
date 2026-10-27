import { NextResponse } from "next/server";
import { z } from "zod/v3";
import { requireSession } from "@/server/auth/session";
import { getOwnProfile, upsertOwnProfile } from "@/server/beneficiaries/beneficiaryService";
import { scrubErrorMessage } from "@/server/security/logScrub";

export const dynamic = "force-dynamic";

function errorStatus(error: unknown): number {
  if (typeof error === "object" && error !== null && "status" in error && typeof error.status === "number") {
    return error.status;
  }
  return 500;
}

const PatchBody = z.object({
  banescoAccountNumber: z.string().nullable().optional(),
  bankName: z.string().nullable().optional(),
  accountHolderName: z.string().nullable().optional(),
  accountType: z.enum(["CHECKING", "SAVINGS"]).nullable().optional(),
  currency: z.string().nullable().optional(),
  swiftBic: z.string().nullable().optional(),
  statusEmailOptOut: z.boolean().optional(),
  payoutAuthorization: z.boolean().optional(),
});

export async function GET() {
  try {
    const { userId } = await requireSession();
    const view = await getOwnProfile(userId);
    return NextResponse.json({ ok: true, data: view });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: scrubErrorMessage(e) }, { status: errorStatus(e) });
  }
}

export async function PATCH(req: Request) {
  try {
    const { userId } = await requireSession();
    const body = PatchBody.parse(await req.json());
    const view = await upsertOwnProfile(userId, body);
    return NextResponse.json({ ok: true, data: view });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: scrubErrorMessage(e) }, { status: errorStatus(e) });
  }
}
