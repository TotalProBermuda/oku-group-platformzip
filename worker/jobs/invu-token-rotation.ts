import type { Job } from "bullmq";
import { prisma } from "../../src/lib/prisma";
import { decrypt } from "../../src/server/services/invu/invuEncryptionService";
import { authenticateInvu } from "../../src/server/services/invu/invuAuthService";
import { recordIntegrationAudit } from "../../src/server/services/invu/invuAuditService";

/**
 * INVU access-token rotation job.
 *
 * INVU access tokens drift out from under us if left untouched (vendor has
 * never published a hard expiry, but we observe ~30-day soft revocation in
 * the wild). This recurring job re-runs `authenticateInvu` against every
 * credential whose token is older than ROTATION_INTERVAL_MS, refreshing the
 * encrypted token + tokenLastRotatedAt.
 *
 * Failure mode: a single venue auth failure must NOT block other venues.
 * Each credential is processed in its own try/catch and emits an
 * INVU_TOKEN_ROTATION_FAILED audit event on error. The auth helper itself
 * already records INVU_AUTH_SUCCESS / INVU_AUTH_FAILURE so we don't
 * double-log the success path.
 */

const ROTATION_INTERVAL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

export async function handleInvuTokenRotationJob(_job: Job): Promise<{ rotated: number; failed: number; skipped: number }> {
  const cutoff = new Date(Date.now() - ROTATION_INTERVAL_MS);

  // Eligible: enabled credentials, not in DISCONNECTED state, and either
  // never rotated or rotated before the cutoff. We need decrypted creds
  // for re-auth, so pull the encrypted username/password columns too.
  const due = await prisma.invuIntegrationCredential.findMany({
    where: {
      isEnabled: true,
      status: { not: "DISCONNECTED" },
      OR: [
        { tokenLastRotatedAt: null },
        { tokenLastRotatedAt: { lt: cutoff } },
      ],
    },
    select: {
      id: true,
      venueId: true,
      apiUserType: true,
      apiUsernameEncrypted: true,
      apiPasswordEncrypted: true,
      apiUserExpiresAt: true,
      branchScoped: true,
    },
  });

  let rotated = 0;
  let failed = 0;
  let skipped = 0;

  for (const cred of due) {
    if (!cred.apiUsernameEncrypted || !cred.apiPasswordEncrypted) {
      // No stored creds — operator must re-attach manually. Emit a single
      // audit so we can chase it down without polluting every nightly run
      // (this row will keep matching the cutoff, so the alert is durable).
      skipped += 1;
      await recordIntegrationAudit("INVU_TOKEN_ROTATION_FAILED", null, null, {
        credentialId: cred.id,
        venueId: cred.venueId,
        reason: "credential is missing encrypted username/password — operator re-attach required",
      });
      continue;
    }

    try {
      const username = decrypt(cred.apiUsernameEncrypted);
      const password = decrypt(cred.apiPasswordEncrypted);
      await authenticateInvu(username, password, cred.venueId, {
        apiUserType: cred.apiUserType,
        apiUserExpiresAt: cred.apiUserExpiresAt ?? null,
        branchScoped: cred.branchScoped ?? false,
      });
      rotated += 1;
    } catch (err) {
      failed += 1;
      await recordIntegrationAudit("INVU_TOKEN_ROTATION_FAILED", null, null, {
        credentialId: cred.id,
        venueId: cred.venueId,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  console.log(`[invu-token-rotation] processed ${due.length}: rotated=${rotated} failed=${failed} skipped=${skipped}`);
  return { rotated, failed, skipped };
}
