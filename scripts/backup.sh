#!/usr/bin/env bash
# Backup do NomadPlan: dump do PostgreSQL (formato custom do pg_dump) + imagens enviadas.
# Uso: scripts/backup.sh [pasta-de-destino]        (padrão: ./backups)
#
# Variáveis opcionais: POSTGRES_CONTAINER, POSTGRES_USER, POSTGRES_DB, UPLOADS_DIR,
# RETENCAO_DIAS (backups mais antigos que isso são apagados; padrão 30).
set -euo pipefail

CONTAINER="${POSTGRES_CONTAINER:-nomadplan-postgres}"
USUARIO="${POSTGRES_USER:-nomadplan}"
BANCO="${POSTGRES_DB:-nomadplan}"
UPLOADS="${UPLOADS_DIR:-backend/uploads}"
DESTINO="${1:-backups}"
RETENCAO_DIAS="${RETENCAO_DIAS:-30}"
CARIMBO="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$DESTINO"

ARQUIVO_DUMP="$DESTINO/nomadplan-$CARIMBO.dump"
# Grava num arquivo temporário e só renomeia ao final: um backup interrompido não
# fica parecendo um backup válido.
docker exec "$CONTAINER" pg_dump -U "$USUARIO" -Fc "$BANCO" > "$ARQUIVO_DUMP.parcial"
mv "$ARQUIVO_DUMP.parcial" "$ARQUIVO_DUMP"
echo "Banco salvo em $ARQUIVO_DUMP ($(du -h "$ARQUIVO_DUMP" | cut -f1))"

if [ -d "$UPLOADS" ] && [ -n "$(ls -A "$UPLOADS" 2>/dev/null)" ]; then
  ARQUIVO_UPLOADS="$DESTINO/uploads-$CARIMBO.tar.gz"
  tar -czf "$ARQUIVO_UPLOADS" -C "$UPLOADS" .
  echo "Imagens salvas em $ARQUIVO_UPLOADS ($(du -h "$ARQUIVO_UPLOADS" | cut -f1))"
else
  echo "Nenhuma imagem enviada em $UPLOADS; nada a salvar."
fi

find "$DESTINO" -maxdepth 1 \( -name 'nomadplan-*.dump' -o -name 'uploads-*.tar.gz' \) -mtime +"$RETENCAO_DIAS" -print -delete \
  | sed 's/^/Removido (mais antigo que '"$RETENCAO_DIAS"' dias): /'
