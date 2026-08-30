#!/usr/bin/env bash
# Despliegue en Synology NAS — mismo patrón que rodrigo-cv/deploy.sh
set -euo pipefail

cd "$(dirname "$0")/.."

NAS_USER="${NAS_USER:-rodri_adm}"
NAS_HOST="${NAS_HOST:-192.168.1.137}"
NAS_PORT="${NAS_PORT:-2222}"
REMOTE_DIR="${REMOTE_DIR:-/volume1/docker/traveltoblog}"
APP_PORT="${APP_PORT:-3000}"
APP_URL="${NEXT_PUBLIC_APP_URL:-http://${NAS_HOST}:${APP_PORT}}"

SSH_OPTS=(-p "$NAS_PORT" -o StrictHostKeyChecking=accept-new)
SSH_TARGET="${NAS_USER}@${NAS_HOST}"

echo "→ Synology: ${SSH_TARGET}:${NAS_PORT}"
echo "→ Directorio remoto: ${REMOTE_DIR}"

if [[ ! -f .env ]] && [[ -z "${DEEPSEEK_API_KEY:-}" ]]; then
  echo "⚠️  Crea .env con DEEPSEEK_API_KEY o exporta la variable antes de desplegar."
  exit 1
fi

DEEPSEEK_API_KEY="${DEEPSEEK_API_KEY:-$(grep -E '^DEEPSEEK_API_KEY=' .env | cut -d= -f2- | tr -d '"')}"

echo "→ Sincronizando código (excluye node_modules, .next, .git)…"
rsync -avz --delete \
  --exclude node_modules \
  --exclude .next \
  --exclude .git \
  --exclude prisma/data \
  --exclude 'public/uploads/*' \
  --exclude .env \
  -e "ssh ${SSH_OPTS[*]}" \
  ./ "${SSH_TARGET}:${REMOTE_DIR}/"

echo "→ Escribiendo .env en el NAS…"
ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "cat > ${REMOTE_DIR}/.env" <<EOF
DATABASE_URL=file:/app/data/travel.db
DEEPSEEK_API_KEY=${DEEPSEEK_API_KEY}
OPENAI_BASE_URL=https://api.deepseek.com/v1
OPENAI_MODEL=deepseek-chat
NEXT_PUBLIC_APP_URL=${APP_URL}
EOF

echo "→ Construyendo y levantando contenedor Docker…"
ssh "${SSH_OPTS[@]}" "$SSH_TARGET" bash -s <<REMOTE
set -euo pipefail
cd "${REMOTE_DIR}"
export PATH="/usr/local/bin:/usr/sbin:/usr/bin:\$PATH"

if ! command -v docker >/dev/null 2>&1; then
  echo "❌ Docker no encontrado. Instala Container Manager en el Synology."
  exit 1
fi

if docker compose version >/dev/null 2>&1; then
  COMPOSE="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE="docker-compose"
else
  echo "❌ docker compose no disponible."
  exit 1
fi

\$COMPOSE down 2>/dev/null || true
\$COMPOSE up -d --build

echo ""
echo "✅ TravelToBlog desplegado"
echo "   URL LAN: ${APP_URL}"
\$COMPOSE ps
REMOTE

echo ""
echo "✅ Despliegue completado → ${APP_URL}"
