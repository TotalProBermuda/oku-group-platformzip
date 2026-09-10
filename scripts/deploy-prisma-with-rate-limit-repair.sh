#!/usr/bin/env sh
# Recover one known interrupted, infrastructure-only migration before normal
# production startup. The guard is intentionally specific: it never touches
# business data or any other migration record.
set -eu

MIGRATION_ID="20260910010000_database_rate_limit"
STATUS="$(npx prisma migrate status 2>&1 || true)"

if printf '%s' "$STATUS" | grep -Fq "$MIGRATION_ID"; then
  echo "Recovering interrupted rate-limit migration state."
  npx prisma migrate resolve --rolled-back "$MIGRATION_ID"
fi

npx prisma migrate deploy
exec npm run start -- -p 5000
