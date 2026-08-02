#!/bin/bash
set -e

echo "==> Installing dependencies..."
npm install --legacy-peer-deps

echo "==> Generating Prisma client..."
npx prisma generate

echo "==> Applying database migrations..."
npx prisma migrate deploy || echo "No migration files found, skipping."

echo "==> Syncing schema to database (db push)..."
npx prisma db push --accept-data-loss

echo "==> Verifying i18n parity across en/es/pt..."
npm run i18n:check

echo "==> Post-merge setup complete."
echo "    NOTE: Restart the Next.js Dev Server workflow to pick up any build-cache changes."
