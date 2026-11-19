#!/usr/bin/env bash
# Implantação na VPS: backup, código no commit pedido, reconstrução dos contêineres e verificação de saúde.
# Se a API não ficar saudável, volta sozinho ao commit que estava no ar.
#
# Quem chama é o GitHub Actions (.github/workflows/deploy.yml), no runner instalado na VPS, depois que o CI
# da main passou. Também serve à mão, em emergência:  scripts/implantar.sh [commit]   (padrão: origin/main)
#
# Variáveis opcionais: PASTA_NOMADPLAN (padrão /opt/nomadplan), SEM_BACKUP=1 (testes), ESPERA_SAUDE (padrão 120 s).
# Voltar de versão: rode o workflow "Deploy" com o commit anterior (ou este script com ele). Atenção: as
# migrações do banco só andam para frente; a volta de código funciona porque elas só acrescentam colunas e
# tabelas, e o backup tirado antes de cada implantação fica em backups/ para o caso extremo.
set -euo pipefail

PASTA="${PASTA_NOMADPLAN:-/opt/nomadplan}"
ESPERA="${ESPERA_SAUDE:-120}"
ALVO="${1:-origin/main}"

# Só endereço de commit, nome de branch ou origin/...: nada que o shell possa interpretar.
[[ "$ALVO" =~ ^[A-Za-z0-9._/-]+$ ]] || { echo "Referência inválida: $ALVO" >&2; exit 2; }

cd "$PASTA"

COMPOSE=(docker compose -p nomadplan --env-file .env.prod -f docker-compose.prod.yml -f docker-compose.compartilhado.yml)
# O painel de monitoramento entra junto, quando o endereço dele foi configurado no .env.prod.
if [[ -f docker-compose.monitoramento.yml ]] && grep -qE '^DOMINIO_GRAFANA=.+' .env.prod; then
  COMPOSE+=(-f docker-compose.monitoramento.yml)
fi

saudavel() {
  docker exec nomadplan-api node -e "fetch('http://localhost:3333/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))" 2>/dev/null
}

esperar_saude() {
  local limite=$((SECONDS + ESPERA))
  until saudavel; do
    [[ "$SECONDS" -lt "$limite" ]] || return 1
    sleep 3
  done
}

ANTERIOR="$(git rev-parse HEAD)"
git fetch --prune origin
NOVO="$(git rev-parse "${ALVO}^{commit}")"

echo "No ar: ${ANTERIOR:0:7}. Implantando: ${NOVO:0:7}."

if [[ "${SEM_BACKUP:-0}" != "1" ]]; then
  bash scripts/backup.sh
fi

git checkout --detach "$NOVO"
"${COMPOSE[@]}" up -d --build

if esperar_saude; then
  echo "Implantação concluída: ${NOVO:0:7} está no ar e saudável."
  exit 0
fi

echo "A API não ficou saudável em ${ESPERA}s. Voltando para ${ANTERIOR:0:7}." >&2
"${COMPOSE[@]}" logs --tail 40 api >&2 || true
git checkout --detach "$ANTERIOR"
"${COMPOSE[@]}" up -d --build

if esperar_saude; then
  echo "Voltou para ${ANTERIOR:0:7}, que está saudável. A implantação de ${NOVO:0:7} FALHOU." >&2
else
  echo "Nem a versão anterior ficou saudável: intervenção manual necessária." >&2
fi

exit 1
