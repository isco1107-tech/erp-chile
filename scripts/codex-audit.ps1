<#
  Auditoría con Codex de los cambios que escribió Claude.

  Uso:
    .\scripts\codex-audit.ps1                 # cambios sin commitear (staged + unstaged + nuevos)
    .\scripts\codex-audit.ps1 -Base main      # todo lo que la rama actual agrega sobre main
    .\scripts\codex-audit.ps1 -Commit HEAD    # un commit puntual

  Codex corre en sandbox de SOLO LECTURA: puede leer el repo para dar contexto pero no
  modifica nada. El informe queda en .codex-audit/<sha12>.md para un commit, o en
  .codex-audit/ultimo.md para los demás modos (carpeta ignorada por git).
#>
param(
  [string]$Base,
  [string]$Commit,
  [string]$Focus = '',
  [switch]$Quiet     # no imprime el informe (lo usa el hook post-commit)
)

$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)

# --- 1. Ubicar codex.exe: PATH primero, luego la extensión de VS Code más reciente.
$codex = (Get-Command codex -ErrorAction SilentlyContinue).Source
if (-not $codex) {
  $codex = Get-ChildItem "$env:USERPROFILE\.vscode\extensions" -Recurse -Filter codex.exe -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName
}
if (-not $codex) { throw 'No encuentro codex.exe. Instala la extensión de Codex en VS Code o `npm i -g @openai/codex`.' }

# --- 2. Reunir el diff a auditar.
$id = 'ultimo'
if ($Commit) {
  $id = (git rev-parse --short=12 $Commit).Trim()   # informe por commit: .codex-audit/<sha>.md
  $scope = "commit $Commit"
  $diff = git show $Commit --stat --patch
  $gitCmd = "git show $Commit -- <archivo>"
  $statArgs = @('show', $Commit, '--stat')
} elseif ($Base) {
  $scope = "rama actual vs $Base"
  $diff = git diff "$Base...HEAD" --stat --patch
  $gitCmd = "git diff $Base...HEAD -- <archivo>"
  $statArgs = @('diff', "$Base...HEAD", '--stat')
} else {
  $scope = 'cambios sin commitear'
  git add -N . 2>$null   # marca archivos nuevos para que entren en el diff (sin stagear contenido)
  $diff = git diff HEAD --stat --patch
  $gitCmd = "git diff HEAD -- <archivo>"
  $statArgs = @('diff', 'HEAD', '--stat')
}
if (-not $diff) { Write-Host "No hay cambios que auditar ($scope)."; exit 0 }

# Codex rechaza entradas de más de 1.048.576 caracteres: si el diff no cabe, va solo el
# resumen de archivos y Codex lee cada cambio por su cuenta (git funciona en solo lectura).
if (($diff -join "`n").Length -gt 600000) {
  $stat = (& git @statArgs) -join "`n"
  $diff = "EL DIFF ES DEMASIADO GRANDE PARA ENVIARLO ENTERO. Resumen de archivos:`n$stat`n`nLee cada cambio con ``$gitCmd`` empezando por los archivos de mayor riesgo (auth, ventas, tesorería, DTE, esquema Prisma, server actions, rutas públicas)."
  Write-Host 'Diff grande: Codex leerá los archivos por su cuenta.'
}

# --- 3. Prompt de auditoría (las reglas completas están en CLAUDE.md / AGENTS.md).
$prompt = @"
Eres el AUDITOR independiente de un ERP chileno (Next.js 16, Prisma 7, multi-tenant). El código fue escrito por otro agente (Claude); tu trabajo es encontrar lo que se le escapó, NO reescribirlo. No modifiques archivos.

Lee AGENTS.md y CLAUDE.md del repo: son las reglas obligatorias. Audita el diff (alcance: $scope) que recibes por stdin, abriendo los archivos completos cuando el diff no baste para entender el contexto.

Revisa, en este orden de prioridad:
1. Aislamiento multi-tenant: toda query Prisma filtra por companyId de la sesión; updateMany/deleteMany en vez de update/delete por id solo.
2. Autorización: toda Server Action empieza con requireAuthWithPermission(permission); nunca requireAuth(roles).
3. Tributario chileno: IVA 19% con el reparto de src/modules/sales/calc.ts, Product.isExempt leído del catálogo (nunca del cliente), RUT módulo 11, CLP en enteros, códigos DTE solo desde src/lib/chile/dte/codes.ts.
4. Integridad de datos: transacciones prisma.`$transaction, locks FOR UPDATE donde hay carrera (folios, stock/PMP), idempotencyKey en emisiones, emitWorkflowEvent NUNCA dentro de una transacción.
5. Seguridad: secretos/credenciales expuestos, datos personales de candidatas en superficies públicas, SSRF en URLs salientes, validación Zod en el servidor.
6. Contrato: ActionResult<T>, errores en español accionables, captureException (no console.error), sin any ni @ts-ignore.
7. Migraciones Prisma: la base local ES la de producción — señala cualquier cambio no aditivo (DROP, NOT NULL sobre tabla con datos).

$Focus

Formato de salida (en español, sin relleno):
- Un veredicto en la primera línea: APROBADO, APROBADO CON OBSERVACIONES o RECHAZADO.
- Luego una lista de hallazgos ordenados por severidad (CRITICO / ALTO / MEDIO / BAJO), cada uno con: archivo:línea, qué falla, escenario concreto que lo rompe y arreglo sugerido en una línea.
- Si no hay hallazgos reales, dilo. No inventes problemas para llenar la lista.
"@

# --- 4. Ejecutar Codex en solo lectura y guardar el informe.
New-Item -ItemType Directory -Force .codex-audit | Out-Null
$out = ".codex-audit\$id.md"
$utf8 = New-Object System.Text.UTF8Encoding $false   # sin esto PS 5.1 rompe tildes/ñ del diff al pasarlo por el pipe
$OutputEncoding = $utf8
[Console]::OutputEncoding = $utf8
$diff | & $codex exec -s read-only --ephemeral -o $out $prompt
if ($LASTEXITCODE -ne 0) { throw "Codex terminó con código $LASTEXITCODE" }

if (-not $Quiet) {
  Write-Host "`n=== Informe de Codex ($out) ===`n"
  Get-Content $out
}
