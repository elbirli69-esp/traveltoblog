#!/usr/bin/env bash
# Conecta Tailscale en Cloud Agents para alcanzar el Synology NAS.
set -euo pipefail

if ! command -v tailscale >/dev/null 2>&1; then
  exit 0
fi

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
  sudo tailscale up --auth-key="${TAILSCALE_AUTHKEY}" --hostname="traveltoblog-deploy" --accept-routes
fi
