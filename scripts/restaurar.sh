#!/usr/bin/env bash
# Restaura um backup do NomadPlan.
# Uso: scripts/restaurar.sh <arquivo.dump> [banco-de-destino] [uploads.tar.gz]
#
# Sem o banco de destino, RESTAURA SOBRE O BANCO EM USO (apaga os dados atuais) e pede
# confirmação. Para só conferir um backup, informe outro nome de banco (ex.: nomadplan_conferencia):
# ele é criado se não existir, sem tocar no banco real.
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Uso: $0 <arquivo.dump> [banco-de-destino] [uploads.tar.gz]" >&2
  exit 1
fi

DUMP="$1"
CONTAINER="${POSTGRES_CONTAINER:-nomadplan-postgres}"
USUARIO="${POSTGRES_USER:-nomadplan}"
BANCO_PADRAO="${POSTGRES_DB:-nomadplan}"
DESTINO_BANCO="${2:-$BANCO_PADRAO}"
UPLOADS_ARQUIVO="${3:-}"
UPLOADS="${UPLOADS_DIR:-backend/uploads}"

[ -f "$DUMP" ] || { echo "Arquivo não encontrado: $DUMP" >&2; exit 1; }

if [ "$DESTINO_BANCO" = "$BANCO_PADRAO" ]; then
  echo "ATENÇÃO: isto vai apagar os dados atuais do banco \"$DESTINO_BANCO\" e trocá-los pelo backup."
  read -r -p "Digite o nome do banco para confirmar: " RESPOSTA
  [ "$RESPOSTA" = "$DESTINO_BANCO" ] || { echo "Cancelado."; exit 1; }
fi

EXISTE="$(docker exec "$CONTAINER" psql -U "$USUARIO" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$DESTINO_BANCO'")"
if [ "$EXISTE" != "1" ]; then
  docker exec "$CONTAINER" psql -U "$USUARIO" -d postgres -c "CREATE DATABASE \"$DESTINO_BANCO\"" > /dev/null
  echo "Banco \"$DESTINO_BANCO\" criado."
fi

# O PostGIS precisa existir antes de restaurar as colunas geográficas.
docker exec "$CONTAINER" psql -U "$USUARIO" -d "$DESTINO_BANCO" -c "CREATE EXTENSION IF NOT EXISTS postgis" > /dev/null

docker exec -i "$CONTAINER" pg_restore -U "$USUARIO" -d "$DESTINO_BANCO" --clean --if-exists --no-owner < "$DUMP"
echo "Banco \"$DESTINO_BANCO\" restaurado a partir de $DUMP."

if [ -n "$UPLOADS_ARQUIVO" ]; then
  [ -f "$UPLOADS_ARQUIVO" ] || { echo "Arquivo de imagens não encontrado: $UPLOADS_ARQUIVO" >&2; exit 1; }
  mkdir -p "$UPLOADS"
  tar -xzf "$UPLOADS_ARQUIVO" -C "$UPLOADS"
  echo "Imagens restauradas em $UPLOADS."
fi
