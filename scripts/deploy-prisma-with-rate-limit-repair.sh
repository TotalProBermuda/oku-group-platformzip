#!/usr/bin/env sh
# Recover one known interrupted, infrastructure-only migration before normal
# production startup. The guard is intentionally specific: it never touches
# business data or any other migration record.
set -eu

MIGRATION_IDS="20260910010000_database_rate_limit 20260917100000_partner_commerce_signin_invites"

for MIGRATION_ID in $MIGRATION_IDS; do
  # `migrate resolve --rolled-back` succeeds only when this exact migration is
  # recorded as failed. Running it conditionally avoids parsing Prisma's
  # version-dependent status text and leaves applied/pending migrations alone.
  if npx prisma migrate resolve --rolled-back "$MIGRATION_ID" >/dev/null 2>&1; then
    echo "Recovering interrupted infrastructure migration state: $MIGRATION_ID"
  fi
done

npx prisma migrate deploy
exec npm run start:next -- -p "${PORT:-5000}"
