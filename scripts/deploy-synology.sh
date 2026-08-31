#!/usr/bin/env bash
# Despliegue en Synology NAS — LAN o Tailscale (mismo patrón que rodrigo-cv)
set -euo pipefail

cd "$(dirname "$0")/.."

NAS_USER="${NAS_USER:-rodri_adm}"
NAS_PORT="${NAS_PORT:-2222}"
REMOTE_DIR="${REMOTE_DIR:-/volume1/docker/traveltoblog}"
APP_PORT="${APP_PORT:-3000}"

# Conectar Tailscale si hay auth key (cloud agent / CI)
if command -v tailscale >/dev/null 2>&1; then
  if ! sudo tailscale status >/dev/null 2>&1; then
    sudo mkdir -p /var/run/tailscale /var/lib/tailscale
    if ! pgrep -x tailscaled >/dev/null 2>&1; then
      sudo tailscaled \
        --state=/var/lib/tailscale/tailscaled.state \
        --socket=/var/run/tailscale/tailscaled.sock >/tmp/tailscaled.log 2>&1 &
      sleep 2
    fi
  fi
  if [[ -n "${TAILSCALE_AUTHKEY:-}" ]] && ! sudo tailscale status >/dev/null 2>&1; then
    echo "→ Uniendo tailnet con Tailscale…"
    sudo tailscale up --auth-key="${TAILSCALE_AUTHKEY}" --hostname="traveltoblog-deploy" --accept-routes
  fi
fi

resolve_nas_host() {
  if [[ -n "${NAS_TAILSCALE_HOST:-}" ]]; then
    echo "$NAS_TAILSCALE_HOST"
    return
  fi
  if [[ -n "${NAS_HOST:-}" ]]; then
    echo "$NAS_HOST"
    return
  fi
  if command -v tailscale >/dev/null 2>&1 && sudo tailscale status >/dev/null 2>&1; then
    # Busca el NAS en la tailnet (synology, nas, diskstation…)
    local peer
    peer=$(sudo tailscale status 2>/dev/null | awk '
      /synology|diskstation|nas|ds[0-9]/ { print $1; exit }
    ')
    if [[ -n "$peer" ]]; then
      echo "$peer"
      return
    fi
    # Fallback: primer peer con IP 100.x
    peer=$(sudo tailscale status 2>/dev/null | awk '/100\./ { print $1; exit }')
    if [[ -n "$peer" ]]; then
      echo "$peer"
      return
    fi
  fi
  echo "192.168.1.137"
}

NAS_HOST="$(resolve_nas_host)"
APP_URL="${NEXT_PUBLIC_APP_URL:-http://${NAS_HOST}:${APP_PORT}}"

SSH_OPTS=(-p "$NAS_PORT" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 -o BatchMode=yes)
KEY_FILE=""
write_ssh_key_file() {
  local dest="$1"
  python3 - "$dest" <<'PY'
import os, re, sys, textwrap

raw = os.environ.get("NAS_SSH_KEY", "").strip()
if not raw:
    sys.exit("NAS_SSH_KEY vacío")

if "BEGIN" in raw:
    key = raw if raw.endswith("\n") else raw + "\n"
else:
    body = re.sub(r"\s+", "", raw)
    lines = "\n".join(textwrap.wrap(body, 70))
    key = f"-----BEGIN OPENSSH PRIVATE KEY-----\n{lines}\n-----END OPENSSH PRIVATE KEY-----\n"

with open(sys.argv[1], "w", encoding="utf-8") as fh:
    fh.write(key)
PY
}
if [[ -n "${NAS_SSH_KEY:-}" ]]; then
  KEY_FILE="$(mktemp)"
  trap 'rm -f "$KEY_FILE"' EXIT
  write_ssh_key_file "$KEY_FILE"
  chmod 600 "$KEY_FILE"
  SSH_OPTS+=(-i "$KEY_FILE")
elif [[ -n "${NAS_SSH_KEY_FILE:-}" ]] && [[ -f "$NAS_SSH_KEY_FILE" ]]; then
  SSH_OPTS+=(-i "$NAS_SSH_KEY_FILE")
elif [[ -n "${NAS_SSH_KEY_FILE:-}" ]]; then
  echo "⚠️  NAS_SSH_KEY_FILE apunta a un archivo inexistente; ignorando."
  if [[ -z "${NAS_SSH_KEY:-}" ]]; then
    echo "❌ Falta NAS_SSH_KEY. Guarda el entorno en Cursor y reinicia el agente"
    echo "   para que el secreto SSH se inyecte en el pod."
    exit 1
  fi
else
  echo "❌ Falta credencial SSH para el NAS."
  echo "   Tailscale alcanza el NAS, pero el despliegue usa SSH (puerto ${NAS_PORT})."
  echo "   Añade NAS_SSH_KEY en los secrets del entorno y reinicia el agente."
  exit 1
fi
SSH_TARGET="${NAS_USER}@${NAS_HOST}"

echo "→ Synology: ${SSH_TARGET}:${NAS_PORT}"
echo "→ Directorio remoto: ${REMOTE_DIR}"

if [[ ! -f .env ]] && [[ -z "${DEEPSEEK_API_KEY:-}" ]]; then
  echo "⚠️  DEEPSEEK_API_KEY no definido localmente; se conservará el .env remoto si existe."
fi

DEEPSEEK_API_KEY="${DEEPSEEK_API_KEY:-$(grep -E '^DEEPSEEK_API_KEY=' .env 2>/dev/null | cut -d= -f2- | tr -d '"' || true)}"
SSH_CMD=(ssh "${SSH_OPTS[@]}")

echo "→ Generando Prisma Client (incluye binario musl para Alpine)…"
npx prisma generate

# Reuse DogTrainer Mapbox token if missing locally (same NAS / same account)
if [[ -z "${NEXT_PUBLIC_MAPBOX_TOKEN:-}" ]]; then
  NEXT_PUBLIC_MAPBOX_TOKEN="$(grep -E '^NEXT_PUBLIC_MAPBOX_TOKEN=' .env 2>/dev/null | cut -d= -f2- | tr -d '"' || true)"
fi
if [[ -z "${NEXT_PUBLIC_MAPBOX_TOKEN:-}" ]]; then
  echo "→ Obteniendo token Mapbox desde DogTrainer en el NAS…"
  NEXT_PUBLIC_MAPBOX_TOKEN="$("${SSH_CMD[@]}" "$SSH_TARGET" python3 - <<'PY' || true
from pathlib import Path
import re
path = Path("/volume1/docker/dogaze/dogtrainer-api/.env")
if not path.exists():
    raise SystemExit(0)
for line in path.read_text().splitlines():
    m = re.match(r"^VITE_MAPBOX_TOKEN=(.*)$", line.strip())
    if not m:
        continue
    val = m.group(1).strip().strip('"').strip("'")
    if val.startswith("pk.") and len(val) > 20:
        print(val)
        break
PY
)"
  NEXT_PUBLIC_MAPBOX_TOKEN="${NEXT_PUBLIC_MAPBOX_TOKEN//$'\r'/}"
fi
if [[ -n "${NEXT_PUBLIC_MAPBOX_TOKEN:-}" ]]; then
  export NEXT_PUBLIC_MAPBOX_TOKEN
  if grep -q '^NEXT_PUBLIC_MAPBOX_TOKEN=' .env 2>/dev/null; then
    sed -i "s|^NEXT_PUBLIC_MAPBOX_TOKEN=.*|NEXT_PUBLIC_MAPBOX_TOKEN=${NEXT_PUBLIC_MAPBOX_TOKEN}|" .env
  else
    echo "NEXT_PUBLIC_MAPBOX_TOKEN=${NEXT_PUBLIC_MAPBOX_TOKEN}" >> .env
  fi
  echo "   Mapbox token listo para el build del cliente"
else
  echo "⚠️  Sin NEXT_PUBLIC_MAPBOX_TOKEN — el mapa de Lugares no cargará"
fi

# HTTPS MagicDNS URL baked into client (GPS requires secure context)
NEXT_PUBLIC_HTTPS_APP_URL="${NEXT_PUBLIC_HTTPS_APP_URL:-https://syno-nas.tailf9872a.ts.net}"
export NEXT_PUBLIC_HTTPS_APP_URL
if grep -q '^NEXT_PUBLIC_HTTPS_APP_URL=' .env 2>/dev/null; then
  sed -i "s|^NEXT_PUBLIC_HTTPS_APP_URL=.*|NEXT_PUBLIC_HTTPS_APP_URL=${NEXT_PUBLIC_HTTPS_APP_URL}|" .env
else
  echo "NEXT_PUBLIC_HTTPS_APP_URL=${NEXT_PUBLIC_HTTPS_APP_URL}" >> .env
fi

echo "→ Compilando Next.js localmente (evita build pesado en el NAS)…"
if [[ ! -f public/releases/traveltoblog-latest.apk ]]; then
  if [[ -d "${ANDROID_HOME:-/opt/android-sdk}/platform-tools" ]]; then
    echo "→ Generando APK Android (no encontrado en public/releases)…"
    npm run build:android || echo "⚠️  No se pudo generar el APK"
  else
    echo "   ⚠️  Sin APK en public/releases — ejecuta npm run build:android antes del deploy"
  fi
elif [[ -f public/releases/traveltoblog-latest.apk ]]; then
  echo "   APK Android: public/releases/traveltoblog-latest.apk ($(du -h public/releases/traveltoblog-latest.apk | cut -f1))"
fi
npm ci
npm run build

echo "→ Preparando base de datos SQLite local…"
mkdir -p prisma/data
DATABASE_URL="file:./prisma/data/travel.db" npx prisma db push --skip-generate 2>/dev/null || true

echo "→ Sincronizando código (tar por SSH, incluye .next standalone)…"
"${SSH_CMD[@]}" "$SSH_TARGET" "mkdir -p ${REMOTE_DIR}"
tar \
  --exclude='./node_modules' \
  --exclude='./.git' \
  --exclude='./android/.gradle' \
  --exclude='./android/build' \
  --exclude='./android/app/build' \
  --exclude='./prisma/data/*.db-journal' \
  --exclude='./public/uploads' \
  --exclude='./.env' \
  -czf - \
  . \
  node_modules/.prisma \
  node_modules/@prisma \
  node_modules/prisma \
  | "${SSH_CMD[@]}" "$SSH_TARGET" "tar xzf - -C ${REMOTE_DIR}"

# Manifest ahora es dinámico (src/app/manifest.ts); borrar estático obsoleto en el NAS
"${SSH_CMD[@]}" "$SSH_TARGET" "rm -f ${REMOTE_DIR}/public/manifest.webmanifest"

echo "→ Detectando IP Tailscale del NAS (URL pública)…"
TAILSCALE_IP="$("${SSH_CMD[@]}" "$SSH_TARGET" bash -s <<'TSIP'
set -euo pipefail
export PATH="/usr/local/bin:/usr/sbin:/usr/bin:$PATH"
for bin in /var/packages/Tailscale/target/bin/tailscale /usr/local/bin/tailscale tailscale; do
  if [[ -x "$bin" ]] || command -v "$bin" >/dev/null 2>&1; then
    ip="$("$bin" ip -4 2>/dev/null | head -1 || true)"
    if [[ -n "$ip" ]]; then
      echo "$ip"
      exit 0
    fi
  fi
done
exit 1
TSIP
)" || true
TAILSCALE_IP="${TAILSCALE_IP//$'\r'/}"
if [[ -z "$TAILSCALE_IP" ]]; then
  echo "❌ No se pudo obtener la IP Tailscale del NAS. Activa Tailscale en el Synology."
  exit 1
fi
echo "   App en 127.0.0.1:${APP_PORT} (LAN bloqueada; acceso vía Tailscale)"
APP_URL="http://${TAILSCALE_IP}:${APP_PORT}"

# Prefer Tailscale HTTPS (MagicDNS) when Serve is active — required for mobile GPS
HTTPS_DNS="$("${SSH_CMD[@]}" "$SSH_TARGET" bash -s <<'HTTPSDNS' || true
export PATH="/usr/local/bin:/usr/sbin:/usr/bin:$PATH"
TS=/var/packages/Tailscale/target/bin/tailscale
$TS serve status --json 2>/dev/null | python3 -c 'import json,sys
try:
  d=json.load(sys.stdin)
  # non-empty config means serve is on
  if d: print("yes")
except Exception:
  pass
' 2>/dev/null || true
$TS status --json 2>/dev/null | python3 -c 'import json,sys; print(json.load(sys.stdin)["Self"]["DNSName"].rstrip("."))'
HTTPSDNS
)"
HTTPS_DNS="$(echo "$HTTPS_DNS" | tr -d '\r')"
SERVE_ON="$(echo "$HTTPS_DNS" | head -1)"
MAGIC_DNS="$(echo "$HTTPS_DNS" | tail -1)"
if [[ -z "$MAGIC_DNS" || "$MAGIC_DNS" == "yes" ]]; then
  MAGIC_DNS="syno-nas.tailf9872a.ts.net"
fi
HTTPS_APP_URL="https://${MAGIC_DNS}"
export NEXT_PUBLIC_HTTPS_APP_URL="$HTTPS_APP_URL"

if [[ "$SERVE_ON" == "yes" ]]; then
  echo "   Tailscale Serve activo → ${HTTPS_APP_URL}"
  APP_URL="$HTTPS_APP_URL"
else
  echo "⚠️  Tailscale Serve NO activo — el GPS del móvil fallará en http://…"
  echo "   1) Activa Serve: https://login.tailscale.com/f/serve?node=nZWPX2mcyT11CNTRL"
  echo "   2) En el NAS: sudo /var/packages/Tailscale/target/bin/tailscale serve --bg ${APP_PORT}"
  echo "   3) Usa ${HTTPS_APP_URL}"
fi

echo "→ Escribiendo .env en el NAS…"
if [[ -n "$DEEPSEEK_API_KEY" ]]; then
  ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "cat > ${REMOTE_DIR}/.env" <<EOF
DATABASE_URL=file:/app/data/travel.db
DEEPSEEK_API_KEY=${DEEPSEEK_API_KEY}
OPENAI_BASE_URL=https://api.deepseek.com/v1
OPENAI_MODEL=deepseek-chat
NEXT_PUBLIC_APP_URL=${APP_URL}
NEXT_PUBLIC_HTTPS_APP_URL=${HTTPS_APP_URL}
NEXT_PUBLIC_MAPBOX_TOKEN=${NEXT_PUBLIC_MAPBOX_TOKEN:-}
EOF
else
  echo "   (sin DEEPSEEK_API_KEY local — actualizando URL y Mapbox)"
  ssh "${SSH_OPTS[@]}" "$SSH_TARGET" bash -s <<ENVPATCH
set -euo pipefail
ENV_FILE="${REMOTE_DIR}/.env"
touch "\$ENV_FILE"
sed -i '/^TAILSCALE_BIND_IP=/d' "\$ENV_FILE" 2>/dev/null || true
if grep -q '^NEXT_PUBLIC_APP_URL=' "\$ENV_FILE" 2>/dev/null; then
  sed -i "s|^NEXT_PUBLIC_APP_URL=.*|NEXT_PUBLIC_APP_URL=${APP_URL}|" "\$ENV_FILE"
else
  echo "NEXT_PUBLIC_APP_URL=${APP_URL}" >> "\$ENV_FILE"
fi
if grep -q '^NEXT_PUBLIC_HTTPS_APP_URL=' "\$ENV_FILE" 2>/dev/null; then
  sed -i "s|^NEXT_PUBLIC_HTTPS_APP_URL=.*|NEXT_PUBLIC_HTTPS_APP_URL=${HTTPS_APP_URL}|" "\$ENV_FILE"
else
  echo "NEXT_PUBLIC_HTTPS_APP_URL=${HTTPS_APP_URL}" >> "\$ENV_FILE"
fi
if [[ -n "${NEXT_PUBLIC_MAPBOX_TOKEN:-}" ]]; then
  if grep -q '^NEXT_PUBLIC_MAPBOX_TOKEN=' "\$ENV_FILE" 2>/dev/null; then
    sed -i "s|^NEXT_PUBLIC_MAPBOX_TOKEN=.*|NEXT_PUBLIC_MAPBOX_TOKEN=${NEXT_PUBLIC_MAPBOX_TOKEN}|" "\$ENV_FILE"
  else
    echo "NEXT_PUBLIC_MAPBOX_TOKEN=${NEXT_PUBLIC_MAPBOX_TOKEN}" >> "\$ENV_FILE"
  fi
fi
ENVPATCH
fi

echo "→ Construyendo y levantando contenedor Docker…"
ssh "${SSH_OPTS[@]}" "$SSH_TARGET" bash -s <<REMOTE
set -euo pipefail
cd "${REMOTE_DIR}"
export PATH="/usr/local/bin:/usr/sbin:/usr/bin:\$PATH"
rm -f public/manifest.webmanifest

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
\$COMPOSE build
\$COMPOSE up -d

# Asegurar permisos de escritura en el volumen SQLite
docker exec -u root traveltoblog sh -c 'chown -R nextjs:nodejs /app/data /app/public/uploads && chmod 775 /app/data && chmod 664 /app/data/travel.db 2>/dev/null || true' 2>/dev/null || true
\$COMPOSE restart traveltoblog 2>/dev/null || true

# Copiar BD inicial al volumen Docker si aún no existe
if [ -f prisma/data/travel.db ]; then
  if ! \$COMPOSE exec -T traveltoblog test -f /app/data/travel.db 2>/dev/null; then
    echo "→ Copiando base de datos inicial al volumen…"
    docker cp prisma/data/travel.db traveltoblog:/app/data/travel.db 2>/dev/null || true
    \$COMPOSE restart traveltoblog 2>/dev/null || true
  fi
fi

echo ""
echo "✅ TravelToBlog desplegado"
echo "   URL (Tailscale): ${APP_URL}"
echo "   Puerto ${APP_PORT} escucha solo en 127.0.0.1 — no accesible desde la LAN"
\$COMPOSE ps
REMOTE

if [[ "${MIGRATE_DB:-}" == "1" ]]; then
  echo "→ Migrando schema SQLite (db push vía agente, sin pérdida de datos)…"
  "${SSH_CMD[@]}" "$SSH_TARGET" 'export PATH="/usr/local/bin:/usr/sbin:/usr/bin:$PATH"; docker cp traveltoblog:/app/data/travel.db '"${REMOTE_DIR}"'/travel.db.migrate 2>/dev/null || true'
  if "${SSH_CMD[@]}" "$SSH_TARGET" "test -f ${REMOTE_DIR}/travel.db.migrate"; then
    "${SSH_CMD[@]}" "$SSH_TARGET" "cat ${REMOTE_DIR}/travel.db.migrate" > /tmp/traveltoblog-migrate.db
    if DATABASE_URL="file:/tmp/traveltoblog-migrate.db" npx prisma db push --skip-generate; then
      cat /tmp/traveltoblog-migrate.db | "${SSH_CMD[@]}" "$SSH_TARGET" "cat > ${REMOTE_DIR}/travel.db.migrate"
      "${SSH_CMD[@]}" "$SSH_TARGET" bash -s <<MIGRATE
set -euo pipefail
export PATH="/usr/local/bin:/usr/sbin:/usr/bin:\$PATH"
cd "${REMOTE_DIR}"
docker cp travel.db.migrate traveltoblog:/app/data/travel.db
docker exec -u root traveltoblog sh -c 'chown nextjs:nodejs /app/data/travel.db && chmod 664 /app/data/travel.db' 2>/dev/null || true
docker compose restart traveltoblog 2>/dev/null || true
MIGRATE
      echo "   Schema actualizado en el volumen de producción"
    else
      echo "   ⚠️  db push falló — se conserva la BD de producción sin cambios"
    fi
    rm -f /tmp/traveltoblog-migrate.db
  else
    echo "   (sin BD en volumen — nada que migrar)"
  fi
else
  echo "→ Migración de schema omitida (los datos en Docker volumes se conservan)"
  echo "   Para aplicar cambios de schema: MIGRATE_DB=1 npm run deploy:synology"
fi

echo ""
echo "✅ Despliegue completado → ${APP_URL}"
