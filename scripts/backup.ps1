<#
.SYNOPSIS
  Backup do NomadPlan: dump do PostgreSQL (formato custom do pg_dump) + imagens enviadas.
.EXAMPLE
  .\scripts\backup.ps1
  .\scripts\backup.ps1 -Destino D:\backups-nomadplan -RetencaoDias 30
#>
param(
  [string]$Destino = "backups",
  [string]$Container = $(if ($env:POSTGRES_CONTAINER) { $env:POSTGRES_CONTAINER } else { "nomadplan-postgres" }),
  [string]$Usuario = $(if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { "nomadplan" }),
  [string]$Banco = $(if ($env:POSTGRES_DB) { $env:POSTGRES_DB } else { "nomadplan" }),
  [string]$Uploads = $(if ($env:UPLOADS_DIR) { $env:UPLOADS_DIR } else { "backend\uploads" }),
  [int]$RetencaoDias = 30
)

$ErrorActionPreference = "Stop"
$carimbo = Get-Date -Format "yyyyMMdd-HHmmss"

New-Item -ItemType Directory -Force -Path $Destino | Out-Null

# O dump é gerado dentro do contêiner e copiado depois: redirecionar a saída de um programa
# nativo pelo PowerShell converteria os bytes em texto e corromperia o arquivo binário.
$temporario = "/tmp/nomadplan-$carimbo.dump"
docker exec $Container pg_dump -U $Usuario -Fc -f $temporario $Banco
if ($LASTEXITCODE -ne 0) { throw "pg_dump falhou." }

$arquivoDump = Join-Path $Destino "nomadplan-$carimbo.dump"
docker cp "${Container}:$temporario" $arquivoDump
docker exec $Container rm -f $temporario | Out-Null
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $arquivoDump)) { throw "Não foi possível copiar o backup." }

"Banco salvo em $arquivoDump ({0:N0} KB)" -f ((Get-Item $arquivoDump).Length / 1KB)

if ((Test-Path $Uploads) -and (Get-ChildItem -Recurse -File $Uploads | Select-Object -First 1)) {
  $arquivoUploads = Join-Path $Destino "uploads-$carimbo.zip"
  Compress-Archive -Path (Join-Path $Uploads "*") -DestinationPath $arquivoUploads -Force
  "Imagens salvas em $arquivoUploads ({0:N0} KB)" -f ((Get-Item $arquivoUploads).Length / 1KB)
} else {
  "Nenhuma imagem enviada em $Uploads; nada a salvar."
}

$limite = (Get-Date).AddDays(-$RetencaoDias)
Get-ChildItem $Destino -File |
  Where-Object { ($_.Name -like "nomadplan-*.dump" -or $_.Name -like "uploads-*.zip") -and $_.LastWriteTime -lt $limite } |
  ForEach-Object { Remove-Item $_.FullName; "Removido (mais antigo que $RetencaoDias dias): $($_.Name)" }
