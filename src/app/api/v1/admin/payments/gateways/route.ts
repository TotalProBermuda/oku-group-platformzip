import { NextResponse } from "next/server";
import { requireAdminRoles } from "@/server/auth/adminGuard";
import { isEncryptionAvailable } from "@/server/security/encryption";
import {
  getOrInitAuthNetCredential,
  toSafeView,
} from "@/server/payments/gatewayCredentialService";

export async function GET(req: Request) {
  try {
    await requireAdminRoles(req, ["SUPERADMIN"]);
    const cred = await getOrInitAuthNetCredential();
    return NextResponse.json({
      ok: true,
      data: {
        encryptionAvailable: isEncryptionAvailable(),
        envFallback: {
          apiLoginIdConfigured: !!process.env.AUTHORIZE_NET_API_LOGIN_ID,
          transactionKeyConfigured: !!process.env.AUTHORIZE_NET_TRANSACTION_KEY,
          envConfigured: !!process.env.AUTHORIZE_NET_ENV,
        },
        gateways: [toSafeView(cred)],
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e.message },
      { status: e.status || 500 }
    );
  }
}
