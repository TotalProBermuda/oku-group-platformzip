#!/usr/bin/env sh
# Legacy entrypoint name retained for existing deployment settings.
# Startup must not repair migration history or modify database structure.
# Schema changes belong to a separately reviewed deployment operation.
set -eu
exec npm run start:next -- -p "${PORT:-5000}"
