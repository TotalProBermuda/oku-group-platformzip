#!/bin/bash
set -e

echo "==> Installing dependencies..."
npm install --legacy-peer-deps

echo "==> Generating Prisma client..."
npx prisma generate

echo "==> Applying database migrations..."
# Apply reviewed migration files only. With set -e, any failure stops setup;
# never fall back to schema push/reset or silently accept data loss.
npx prisma migrate deploy

echo "==> Verifying i18n parity across en/es/pt..."
npm run i18n:check

echo "==> Post-merge setup complete."
echo "    NOTE: Restart the Next.js Dev Server workflow to pick up any build-cache changes."
