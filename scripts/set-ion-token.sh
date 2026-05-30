#!/usr/bin/env bash
# Add or update Cesium Ion access token in .env (never committed — see .gitignore).
#
# Usage:
#   ./scripts/set-ion-token.sh                    # prompt for token
#   ./scripts/set-ion-token.sh eyJhbGciOiJ...     # pass token as arg
#
# Get a token: https://cesium.com/ion/tokens
# Restart dev server after: npm run dev

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/.env"

TOKEN="${1:-}"
if [[ -z "$TOKEN" ]]; then
  read -r -s -p "Cesium Ion access token: " TOKEN
  echo
fi

if [[ -z "$TOKEN" ]]; then
  echo "Error: token is empty." >&2
  exit 1
fi

touch "$ENV_FILE"

if grep -q '^VITE_CESIUM_ION_ACCESS_TOKEN=' "$ENV_FILE" 2>/dev/null; then
  if [[ "$(uname)" == "Darwin" ]]; then
    sed -i '' "s|^VITE_CESIUM_ION_ACCESS_TOKEN=.*|VITE_CESIUM_ION_ACCESS_TOKEN=$TOKEN|" "$ENV_FILE"
  else
    sed -i "s|^VITE_CESIUM_ION_ACCESS_TOKEN=.*|VITE_CESIUM_ION_ACCESS_TOKEN=$TOKEN|" "$ENV_FILE"
  fi
else
  printf '\nVITE_CESIUM_ION_ACCESS_TOKEN=%s\n' "$TOKEN" >> "$ENV_FILE"
fi

echo "Updated $ENV_FILE"
echo "Restart the dev server: cd $ROOT && npm run dev"
