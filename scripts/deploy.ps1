<#
  Deploy a producción con compuerta de auditoría de Codex.  Uso: npm run deploy

  1. El árbol de trabajo debe estar limpio (vercel --prod sube lo que hay en disco,
     y lo no commiteado nunca pasó por la auditoría).
  2. Todo commit desde el último deploy debe tener informe de Codex (si falta, se
     audita ahora). Si alguno dice RECHAZADO, no se despliega.
  3. npm run ci (prisma validate + typecheck + lint + test).
  4. vercel --prod. Al terminar bien, se anota el commit como "último desplegado".

  -Force  despliega igual pese a RECHAZADO / árbol sucio (queda en pantalla).
#>
param(
  [switch]$Force,
  [string]$Scope = 'team_M0UOdtmjiD46XOhk1xbmh4aY'
)

$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
New-Item -ItemType Directory -Force .codex-audit | Out-Null
$marker = '.codex-audit\last-deployed'

function Stop-Deploy($msg) {
  if ($Force) { Write-Warning "$msg (continúo por -Force)"; return }
  Write-Host "`nDEPLOY BLOQUEADO: $msg" -ForegroundColor Red
  exit 1
}

# --- 1. Árbol limpio
if (git status --porcelain) {
  Stop-Deploy 'hay cambios sin commitear; commitea (y deja que Codex los audite) o descártalos.'
}

# --- 2. Commits pendientes de deploy
$head = (git rev-parse HEAD).Trim()
$last = if (Test-Path $marker) { (Get-Content $marker -Raw).Trim() } else { $null }
$lastValido = if ($last) { git rev-parse --verify --quiet "$last^{commit}" } else { $null }
if ($lastValido) {
  $commits = @(git rev-list --reverse "$last..HEAD")
} else {
  Write-Host 'Sin registro de deploy previo: audito solo HEAD.'
  $commits = @($head)
}
if ($commits.Count -eq 0) { Write-Host 'No hay commits nuevos desde el último deploy.' }

$rechazados = @()
foreach ($c in $commits) {
  $id = (git rev-parse --short=12 $c).Trim()
  $report = ".codex-audit\$id.md"
  if (-not (Test-Path $report)) {
    Write-Host "Auditando $id con Codex (no había informe)..."
    & "$PSScriptRoot\codex-audit.ps1" -Commit $c -Quiet
  }
  $verdict = (Get-Content $report | Where-Object { $_.Trim() } | Select-Object -First 1)
  Write-Host ("  {0}  {1}" -f $id, $verdict)
  if ($verdict -match 'RECHAZADO') { $rechazados += $id }
}
if ($rechazados) {
  Stop-Deploy ("Codex RECHAZÓ: {0}. Lee .codex-audit\<sha>.md, corrige y vuelve a commitear." -f ($rechazados -join ', '))
}

# --- 3. CI
npm run ci
if ($LASTEXITCODE -ne 0) { Stop-Deploy 'npm run ci falló.' }

# --- 4. Deploy
npx vercel --prod --yes --scope $Scope
if ($LASTEXITCODE -ne 0) { throw "vercel terminó con código $LASTEXITCODE" }
Set-Content $marker $head
Write-Host "`nDesplegado $head" -ForegroundColor Green
