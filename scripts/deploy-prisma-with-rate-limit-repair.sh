#!/usr/bin/env sh
# Recover one known interrupted, infrastructure-only migration before normal
# production startup. The guard is intentionally specific: it never touches
# business data or any other migration record.
set -eu

MIGRATION_IDS="20260910010000_database_rate_limit 20260917100000_partner_commerce_signin_invites"
STATUS="$(npx prisma migrate status 2>&1 || true)"

for MIGRATION_ID in $MIGRATION_IDS; do
  if printf '%s' "$STATUS" | grep -Fq "$MIGRATION_ID"; then
    echo "Recovering interrupted infrastructure migration state: $MIGRATION_ID"
    npx prisma migrate resolve --rolled-back "$MIGRATION_ID"
  fi
done

npx prisma migrate deploy
exec npm run start -- -p 5000
