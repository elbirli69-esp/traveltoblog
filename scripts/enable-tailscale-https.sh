#!/usr/bin/env bash
# Activa HTTPS de Tailscale Serve para TravelToBlog (necesario para GPS en el móvil).
# Requisitos:
#   1. Activar Serve en la cola Tailscale: https://login.tailscale.com/f/serve?node=nZWPX2mcyT11CNTRL
#   2. Ejecutar este script en el Synology (como admin con sudo)
set -euo pipefail

TS="${TAILSCALE_BIN:-/var/packages/Tailscale/target/bin/tailscale}"
PORT="${APP_PORT:-3000}"

if [[ ! -x "$TS" ]]; then
  if command -v tailscale >/dev/null 2>&1; then
    TS="$(command -v tailscale)"
  else
    echo "❌ No se encontró el binario de Tailscale"
    exit 1
  fi
fi

echo "→ Configurando Tailscale Serve → http://127.0.0.1:${PORT}"
if sudo -n "$TS" serve --bg "$PORT" 2>/dev/null; then
  true
elif sudo "$TS" serve --bg "$PORT"; then
  true
else
  echo "❌ No se pudo activar Serve."
  echo "   1) Abre https://login.tailscale.com/f/serve?node=nZWPX2mcyT11CNTRL"
  echo "   2) Activa HTTPS Certificates / Serve en el nodo syno-nas"
  echo "   3) Vuelve a ejecutar: sudo $TS serve --bg $PORT"
  exit 1
fi

echo ""
"$TS" serve status || true
DNS="$("$TS" status --json 2>/dev/null | python3 -c 'import json,sys; print(json.load(sys.stdin)["Self"]["DNSName"].rstrip("."))' 2>/dev/null || echo "syno-nas.tailf9872a.ts.net")"
echo ""
echo "✅ TravelToBlog por HTTPS:"
echo "   https://${DNS}"
echo ""
echo "Abre esa URL en el móvil, reinstala la PWA y prueba «Mi ubicación»."
