#!/usr/bin/env sh
# Legacy entrypoint name retained for existing deployment settings.
# Startup must not repair migration history or modify database structure.
# Schema changes belong to a separately reviewed deployment operation.
set -eu
# Do not depend on npm being on the deployment runtime PATH.
NODE_BIN=$(command -v node || true)
if [ -z "$NODE_BIN" ]; then
  if [ -f .next/oku-node-runtime-path ]; then
    IFS= read -r candidate < .next/oku-node-runtime-path || true
    case "$candidate" in
      /nix/store/*/bin/node)
        if [ -x "$candidate" ]; then NODE_BIN=$candidate; fi ;;
    esac
  fi
fi
if [ -z "$NODE_BIN" ]; then
  marker_present=false
  candidate_executable=false
  if [ -f .next/oku-node-runtime-path ]; then marker_present=true; fi
  case "${candidate:-}" in
    /nix/store/*/bin/node) if [ -x "$candidate" ]; then candidate_executable=true; fi ;;
  esac
  printf 'Runtime diagnostic: cwd=%s marker_present=%s candidate_executable=%s\n' "$PWD" "$marker_present" "$candidate_executable" >&2
  echo 'Production startup failed: Node.js runtime is unavailable.' >&2
  exit 127
fi
exec "$NODE_BIN" node_modules/next/dist/bin/next start -p "${PORT:-5000}"
