<#
.SYNOPSIS
  Restaura um backup do NomadPlan.
.DESCRIPTION
  Sem -BancoDestino, RESTAURA SOBRE O BANCO EM USO (apaga os dados atuais) e pede confirmação.
  Para só conferir um backup, informe outro nome (ex.: nomadplan_conferencia): ele é criado
  se não existir, sem tocar no banco real.
.EXAMPLE
  .\scripts\restaurar.ps1 -Dump backups\nomadplan-20261105-090000.dump -BancoDestino nomadplan_conferencia
#>
param(
  [Parameter(Mandatory = $true)][string]$Dump,
  [string]$BancoDestino = "",
  [string]$ArquivoUploads = "",
  [string]$Container = $(if ($env:POSTGRES_CONTAINER) { $env:POSTGRES_CONTAINER } else { "nomadplan-postgres" }),
  [string]$Usuario = $(if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { "nomadplan" }),
  [string]$BancoPadrao = $(if ($env:POSTGRES_DB) { $env:POSTGRES_DB } else { "nomadplan" }),
  [string]$Uploads = $(if ($env:UPLOADS_DIR) { $env:UPLOADS_DIR } else { "backend\uploads" })
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $Dump)) { throw "Arquivo não encontrado: $Dump" }
if (-not $BancoDestino) { $BancoDestino = $BancoPadrao }

if ($BancoDestino -eq $BancoPadrao) {
  Write-Host "ATENÇÃO: isto vai apagar os dados atuais do banco `"$BancoDestino`" e trocá-los pelo backup." -ForegroundColor Yellow
  $resposta = Read-Host "Digite o nome do banco para confirmar"
  if ($resposta -ne $BancoDestino) { Write-Host "Cancelado."; exit 1 }
}

$existe = docker exec $Container psql -U $Usuario -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$BancoDestino'"
if (($existe | Out-String).Trim() -ne "1") {
  docker exec $Container psql -U $Usuario -d postgres -c "CREATE DATABASE `"$BancoDestino`"" | Out-Null
  "Banco `"$BancoDestino`" criado."
}

# O PostGIS precisa existir antes de restaurar as colunas geográficas.
docker exec $Container psql -U $Usuario -d $BancoDestino -c "CREATE EXTENSION IF NOT EXISTS postgis" | Out-Null

$temporario = "/tmp/restaurar-nomadplan.dump"
docker cp (Resolve-Path $Dump).Path "${Container}:$temporario"
docker exec $Container pg_restore -U $Usuario -d $BancoDestino --clean --if-exists --no-owner $temporario
$codigo = $LASTEXITCODE
docker exec $Container rm -f $temporario | Out-Null
if ($codigo -ne 0) { throw "pg_restore terminou com código $codigo." }

"Banco `"$BancoDestino`" restaurado a partir de $Dump."

if ($ArquivoUploads) {
  if (-not (Test-Path $ArquivoUploads)) { throw "Arquivo de imagens não encontrado: $ArquivoUploads" }
  New-Item -ItemType Directory -Force -Path $Uploads | Out-Null
  Expand-Archive -Path $ArquivoUploads -DestinationPath $Uploads -Force
  "Imagens restauradas em $Uploads."
}
