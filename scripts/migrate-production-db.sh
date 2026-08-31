#!/usr/bin/env bash
# Migrate production SQLite on NAS without full redeploy
set -euo pipefail
cd "$(dirname "$0")/.."

NAS_HOST="${NAS_TAILSCALE_HOST:-syno-nas}"
NAS_USER="${NAS_SSH_USER:-rodri_adm}"
NAS_PORT="${NAS_SSH_PORT:-2222}"
REMOTE_DIR="${NAS_REMOTE_DIR:-/volume1/docker/traveltoblog}"

SSH_OPTS=(-p "$NAS_PORT" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 -o BatchMode=yes)
KEY_FILE="$(mktemp)"
trap 'rm -f "$KEY_FILE" /tmp/traveltoblog-migrate.db' EXIT

python3 - "$KEY_FILE" <<'PY'
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
open(sys.argv[1], "w").write(key)
PY
chmod 600 "$KEY_FILE"
SSH_OPTS+=(-i "$KEY_FILE")
SSH_TARGET="${NAS_USER}@${NAS_HOST}"
SSH=(ssh "${SSH_OPTS[@]}")

echo "→ Logs recientes del contenedor…"
"${SSH[@]}" "$SSH_TARGET" 'export PATH="/usr/local/bin:/usr/sbin:/usr/bin:$PATH"; docker logs traveltoblog --tail 25 2>&1' || true

echo "→ Extrayendo BD de producción…"
if ! "${SSH[@]}" "$SSH_TARGET" 'export PATH="/usr/local/bin:/usr/sbin:/usr/bin:$PATH"; docker exec traveltoblog test -f /app/data/travel.db'; then
  echo "❌ No existe /app/data/travel.db en el contenedor"
  "${SSH[@]}" "$SSH_TARGET" 'export PATH="/usr/local/bin:/usr/sbin:/usr/bin:$PATH"; docker exec traveltoblog ls -la /app/data/ 2>&1 || true'
  exit 1
fi

"${SSH[@]}" "$SSH_TARGET" "export PATH=\"/usr/local/bin:/usr/sbin:/usr/bin:\$PATH\"; docker cp traveltoblog:/app/data/travel.db ${REMOTE_DIR}/travel.db.migrate"
"${SSH[@]}" "$SSH_TARGET" "cat ${REMOTE_DIR}/travel.db.migrate" > /tmp/traveltoblog-migrate.db

echo "→ Aplicando schema Prisma (db push)…"
DATABASE_URL="file:/tmp/traveltoblog-migrate.db" npx prisma db push --skip-generate

echo "→ Subiendo BD migrada…"
cat /tmp/traveltoblog-migrate.db | "${SSH[@]}" "$SSH_TARGET" "cat > ${REMOTE_DIR}/travel.db.migrate"
"${SSH[@]}" "$SSH_TARGET" bash -s <<REMOTE
set -euo pipefail
export PATH="/usr/local/bin:/usr/sbin:/usr/bin:\$PATH"
cd "${REMOTE_DIR}"
docker cp travel.db.migrate traveltoblog:/app/data/travel.db
docker exec -u root traveltoblog sh -c 'chown nextjs:nodejs /app/data/travel.db && chmod 664 /app/data/travel.db'
docker compose restart traveltoblog 2>/dev/null || docker-compose restart traveltoblog
REMOTE

echo "✅ Migración completada"
sleep 3
curl -sS -w "\nAPI travel: HTTP %{http_code}\n" "https://syno-nas.tailf9872a.ts.net/api/travels/cmth0ju9s0002oz01pvm6bjos" -o /dev/null
