#!/usr/bin/env bash
# Desfaz scripts/ligar-caddy-existente.sh: o Caddy do outro projeto volta a usar só o Caddyfile original.
# Uso: scripts/desligar-caddy-existente.sh
#
# Variáveis opcionais: CADDY_CONTAINER (padrão elevare-central-caddy-1), REDE_NOMADPLAN (padrão nomadplan_default).
set -euo pipefail

CADDY="${CADDY_CONTAINER:-elevare-central-caddy-1}"
REDE="${REDE_NOMADPLAN:-nomadplan_default}"

docker exec "$CADDY" caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
docker exec "$CADDY" rm -f /tmp/Caddyfile.nomadplan
docker network disconnect "$REDE" "$CADDY" 2>/dev/null || true
echo "Pronto: $CADDY voltou à configuração original e saiu da rede $REDE."
