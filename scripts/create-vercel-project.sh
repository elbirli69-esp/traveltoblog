#!/usr/bin/env bash
# Create / link TravelToBlog on Vercel (same flow as other cloud projects).
# Requires: `vercel` CLI logged in OR VERCEL_TOKEN in env.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PROJECT_NAME="${VERCEL_PROJECT_NAME:-traveltoblog}"
SCOPE="${VERCEL_SCOPE:-}"

if ! command -v vercel >/dev/null 2>&1; then
  echo "Installing vercel CLI locally…"
  npx --yes vercel@latest --version >/dev/null
  VERCEL=(npx --yes vercel@latest)
else
  VERCEL=(vercel)
fi

TOKEN_ARGS=()
if [[ -n "${VERCEL_TOKEN:-}" ]]; then
  TOKEN_ARGS+=(--token "$VERCEL_TOKEN")
fi

SCOPE_ARGS=()
if [[ -n "$SCOPE" ]]; then
  SCOPE_ARGS+=(--scope "$SCOPE")
fi

echo "==> Linking / creating project: $PROJECT_NAME"
"${VERCEL[@]}" link \
  --yes \
  --project "$PROJECT_NAME" \
  "${SCOPE_ARGS[@]}" \
  "${TOKEN_ARGS[@]}"

echo "==> Pulling project settings"
"${VERCEL[@]}" pull --yes --environment=preview "${SCOPE_ARGS[@]}" "${TOKEN_ARGS[@]}"

echo "==> Setting dual-host env (preview + production)"
set_env() {
  local key="$1" value="$2" env_name="$3"
  "${VERCEL[@]}" env rm "$key" "$env_name" --yes "${SCOPE_ARGS[@]}" "${TOKEN_ARGS[@]}" 2>/dev/null || true
  printf '%s' "$value" | "${VERCEL[@]}" env add "$key" "$env_name" "${SCOPE_ARGS[@]}" "${TOKEN_ARGS[@]}"
}

for ENV_NAME in preview production; do
  set_env STORAGE_DRIVER blob "$ENV_NAME"
  set_env PDF_EXPORT_ENABLED 0 "$ENV_NAME"
done

if [[ -n "${DATABASE_URL:-}" ]]; then
  for ENV_NAME in preview production; do
    set_env DATABASE_URL "$DATABASE_URL" "$ENV_NAME"
  done
else
  echo "NOTE: DATABASE_URL not in shell — add Neon connection string in Vercel dashboard."
fi

if [[ -n "${BLOB_READ_WRITE_TOKEN:-}" ]]; then
  for ENV_NAME in preview production; do
    set_env BLOB_READ_WRITE_TOKEN "$BLOB_READ_WRITE_TOKEN" "$ENV_NAME"
  done
else
  echo "NOTE: Create a Blob store in the Vercel dashboard (Storage → Blob) and link it to this project."
fi

if [[ -n "${DEEPSEEK_API_KEY:-}" ]]; then
  for ENV_NAME in preview production; do
    set_env DEEPSEEK_API_KEY "$DEEPSEEK_API_KEY" "$ENV_NAME"
    set_env OPENAI_BASE_URL "${OPENAI_BASE_URL:-https://api.deepseek.com/v1}" "$ENV_NAME"
    set_env OPENAI_MODEL "${OPENAI_MODEL:-deepseek-chat}" "$ENV_NAME"
  done
fi

if [[ -n "${NEXT_PUBLIC_MAPBOX_TOKEN:-}" ]]; then
  for ENV_NAME in preview production; do
    set_env NEXT_PUBLIC_MAPBOX_TOKEN "$NEXT_PUBLIC_MAPBOX_TOKEN" "$ENV_NAME"
  done
fi

echo "==> Preview deploy"
"${VERCEL[@]}" deploy --yes "${SCOPE_ARGS[@]}" "${TOKEN_ARGS[@]}"

echo "Done. Open the preview URL above, then:"
echo "  1) Vercel → Storage → create Blob + Neon (or Marketplace Neon)"
echo "  2) npm run db:push:cloud  (with DATABASE_URL=postgres)"
echo "  3) vercel --prod   when ready"
