#!/usr/bin/env bash
# Download WeasyPrint + deps as .deb for offline Docker build on Synology (no DNS in docker build).
set -euo pipefail

cd "$(dirname "$0")/.."
OUT_DIR="docker/debian-debs"
MARKER="${OUT_DIR}/.bundle-complete"

if [[ -f "$MARKER" ]] && ls "${OUT_DIR}"/*.deb >/dev/null 2>&1; then
  echo "   WeasyPrint debs ya empaquetados ($(ls "${OUT_DIR}"/*.deb | wc -l) paquetes)"
  exit 0
fi

if ! command -v debootstrap >/dev/null 2>&1; then
  echo "→ Instalando debootstrap para empaquetar WeasyPrint…"
  sudo apt-get update -qq
  sudo apt-get install -y -qq debootstrap
fi

CHROOT="/tmp/ttb-bookworm-weasyprint"
sudo rm -rf "$CHROOT"
mkdir -p "$OUT_DIR"

echo "→ Descargando paquetes WeasyPrint (Debian bookworm, ~180 MB)…"
sudo debootstrap --variant=minbase --include=apt bookworm "$CHROOT" http://deb.debian.org/debian
sudo chroot "$CHROOT" apt-get update -qq
sudo chroot "$CHROOT" bash -c 'mkdir -p /deb-cache/partial && apt-get install -y --download-only -o Dir::Cache::archives=/deb-cache -o Dir::Cache::archives/partial=/deb-cache/partial weasyprint python3'
sudo rm -f "${OUT_DIR}"/*.deb 2>/dev/null || true
sudo cp "${CHROOT}/deb-cache/"*.deb "$OUT_DIR/"
sudo chown -R "$(id -u):$(id -g)" "$OUT_DIR"
sudo rm -rf "$CHROOT"
(
  cd "$OUT_DIR"
  dpkg-scanpackages . /dev/null 2>/dev/null | gzip -9c > Packages.gz
)
date -Iseconds > "$MARKER"
echo "   $(ls "${OUT_DIR}"/*.deb | wc -l) paquetes en ${OUT_DIR} ($(du -sh "$OUT_DIR" | cut -f1))"
