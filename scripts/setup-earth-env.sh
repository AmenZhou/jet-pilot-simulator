#!/usr/bin/env bash
# Interactive .env setup for Fly Earth (Cesium Ion + optional satellite tiles).
#
# Usage:
#   ./scripts/setup-earth-env.sh
#
# Non-interactive:
#   ION_TOKEN=eyJ... SATELLITE=true ./scripts/setup-earth-env.sh
#
# Get Ion token: https://cesium.com/ion/tokens
# After changes: npm run dev

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/.env"
EXAMPLE="$ROOT/.env.example"

set_kv() {
  local key="$1"
  local value="$2"
  if grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
    if [[ "$(uname)" == "Darwin" ]]; then
      sed -i '' "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
    else
      sed -i "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
    fi
  else
    printf '%s=%s\n' "$key" "$value" >> "$ENV_FILE"
  fi
}

remove_kv() {
  local key="$1"
  if grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
    if [[ "$(uname)" == "Darwin" ]]; then
      sed -i '' "/^${key}=/d" "$ENV_FILE"
    else
      sed -i "/^${key}=/d" "$ENV_FILE"
    fi
  fi
}

if [[ ! -f "$ENV_FILE" ]]; then
  if [[ -f "$EXAMPLE" ]]; then
    cp "$EXAMPLE" "$ENV_FILE"
    echo "Created $ENV_FILE from .env.example"
  else
    touch "$ENV_FILE"
    echo "Created empty $ENV_FILE"
  fi
fi

# --- Cesium Ion (optional 3D terrain) ---
ION_TOKEN="${ION_TOKEN:-}"
if [[ -z "$ION_TOKEN" ]]; then
  read -r -p "Cesium Ion token (Enter to skip): " -s ION_TOKEN
  echo
fi
if [[ -n "$ION_TOKEN" ]]; then
  set_kv "VITE_CESIUM_ION_ACCESS_TOKEN" "$ION_TOKEN"
  echo "Set VITE_CESIUM_ION_ACCESS_TOKEN"
else
  remove_kv "VITE_CESIUM_ION_ACCESS_TOKEN"
  echo "Skipped Ion token (free ellipsoid mode)"
fi

# --- Esri satellite (no Ion required) ---
SATELLITE="${SATELLITE:-}"
if [[ -z "$SATELLITE" ]]; then
  read -r -p "Enable Esri satellite imagery? [y/N]: " SATELLITE
  SATELLITE="${SATELLITE:-n}"
fi
case "${SATELLITE,,}" in
  y|yes|true|1)
    set_kv "VITE_SATELLITE_IMAGERY" "true"
    echo "Set VITE_SATELLITE_IMAGERY=true"
    ;;
  *)
    remove_kv "VITE_SATELLITE_IMAGERY"
    echo "Satellite imagery off (dark map tiles)"
    ;;
esac

echo
echo "Done. Current .env keys:"
grep -E '^VITE_' "$ENV_FILE" || true
echo
echo "Restart dev server:"
echo "  cd $ROOT && npm run dev"
