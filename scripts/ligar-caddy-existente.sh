#!/usr/bin/env bash
# Liga um Caddy que JÁ roda no servidor (em outro projeto) ao NomadPlan, sem editar nenhum arquivo do outro projeto.
# Junta o Caddyfile dele com os dois endereços do NomadPlan num arquivo temporário dentro do contêiner e recarrega o
# Caddy com ele (recarga sem derrubar conexões; se a configuração for inválida, o Caddy segue com a anterior).
# Uso: scripts/ligar-caddy-existente.sh            (na pasta do projeto, com o .env.prod preenchido)
#
# Variáveis opcionais: CADDY_CONTAINER (padrão elevare-central-caddy-1), CADDYFILE_ORIGINAL (padrão
# /opt/elevare/deploy/vps/Caddyfile), REDE_NOMADPLAN (padrão nomadplan_default), ENV_FILE (padrão .env.prod),
# SEM_REDE=1 (não conecta o contêiner à rede do NomadPlan; só para testes).
#
# A ligação vale até o Caddy do outro projeto ser recriado ou reiniciado; nesse caso, rode o script de novo.
# Para desfazer: scripts/desligar-caddy-existente.sh
set -euo pipefail

CADDY="${CADDY_CONTAINER:-elevare-central-caddy-1}"
ORIGINAL="${CADDYFILE_ORIGINAL:-/opt/elevare/deploy/vps/Caddyfile}"
REDE="${REDE_NOMADPLAN:-nomadplan_default}"
ENV_FILE="${ENV_FILE:-.env.prod}"

[ -f "$ORIGINAL" ] || { echo "Caddyfile do outro projeto não encontrado: $ORIGINAL" >&2; exit 1; }
[ -f "$ENV_FILE" ] || { echo "Arquivo de configuração não encontrado: $ENV_FILE" >&2; exit 1; }

DOMINIO_WEB="$(grep -E '^DOMINIO_WEB=' "$ENV_FILE" | head -1 | cut -d= -f2-)"
DOMINIO_API="$(grep -E '^DOMINIO_API=' "$ENV_FILE" | head -1 | cut -d= -f2-)"
[ -n "$DOMINIO_WEB" ] && [ -n "$DOMINIO_API" ] || { echo "Defina DOMINIO_WEB e DOMINIO_API em $ENV_FILE." >&2; exit 1; }

if [ "${SEM_REDE:-0}" != "1" ]; then
  docker network connect "$REDE" "$CADDY" 2>/dev/null || true   # já conectado também é sucesso
fi

TEMP="$(mktemp)"
trap 'rm -f "$TEMP"' EXIT
{
  cat "$ORIGINAL"
  printf '\n# --- NomadPlan (acrescentado em memória por ligar-caddy-existente.sh; o arquivo original não é alterado) ---\n'
  printf '%s {\n\treverse_proxy nomadplan-web:80\n}\n\n' "$DOMINIO_WEB"
  printf '%s {\n\tencode zstd gzip\n\treverse_proxy nomadplan-api:3333\n}\n' "$DOMINIO_API"
} > "$TEMP"

docker cp "$TEMP" "$CADDY":/tmp/Caddyfile.nomadplan
docker exec "$CADDY" caddy validate --config /tmp/Caddyfile.nomadplan --adapter caddyfile > /dev/null
docker exec "$CADDY" caddy reload --config /tmp/Caddyfile.nomadplan --adapter caddyfile
echo "Pronto: $DOMINIO_WEB e $DOMINIO_API passam a ser atendidos por $CADDY."
