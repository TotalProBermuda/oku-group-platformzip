#!/bin/bash
set -e

echo "==> Installing dependencies..."
npm ci

echo "==> Generating Prisma client..."
npx prisma generate

# Pulling source must not mutate the connected database. Apply reviewed
# migrations separately after verifying the target, backup, and rollback plan.
echo "==> Database migrations require a separate reviewed release step."

echo "==> Verifying i18n parity across en/es/pt..."
npm run i18n:check

echo "==> Post-merge setup complete."
echo "    NOTE: Restart the Next.js Dev Server workflow to pick up any build-cache changes."
