# TESTA restauracao SOMENTE num D1 LOCAL ISOLADO. Nunca usa --remote.
param([Parameter(Mandatory=$true)][string]$ArquivoBackup)
$ErrorActionPreference = 'Stop'
$projeto = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$origem = (Resolve-Path -LiteralPath $ArquivoBackup -ErrorAction Stop).Path
$isolado = Join-Path $projeto ("restauracao-local/teste-{0}" -f (Get-Date -Format 'yyyyMMdd_HHmmss'))
New-Item -ItemType Directory -Force -Path $isolado | Out-Null
Set-Location $projeto
Write-Host "Restaurando em banco LOCAL de teste: $isolado"
& npx.cmd wrangler d1 execute super-treino-prod --local --persist-to=$isolado --file=$origem --yes
if ($LASTEXITCODE -ne 0) { throw 'Importacao falhou. O banco de producao nao foi modificado.' }
& npx.cmd wrangler d1 execute super-treino-prod --local --persist-to=$isolado --command="SELECT COUNT(*) AS alunos FROM students" --yes
if ($LASTEXITCODE -ne 0) { throw 'Falha ao ler alunos restaurados.' }
& npx.cmd wrangler d1 execute super-treino-prod --local --persist-to=$isolado --command="SELECT COUNT(*) AS mensalidades, SUM(CASE WHEN status='paid' THEN 1 ELSE 0 END) AS pagas FROM invoices" --yes
if ($LASTEXITCODE -ne 0) { throw 'Falha ao ler mensalidades restauradas.' }
Write-Host 'Teste de restauracao local finalizado. COMPARE as contagens com as do sistema. Nao foi usado --remote.'
