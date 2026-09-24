---
description: Que Codex audite (solo lectura) los cambios que acabo de escribir
argument-hint: "[--base main | --commit <sha>] [foco opcional]"
---

Audita con Codex el trabajo hecho en esta sesión.

1. Corre primero `npm run typecheck` y `npm run lint`; si fallan, arréglalos antes de pedir auditoría (no gastes a Codex en errores que ya detecta el compilador).
2. Ejecuta el auditor desde PowerShell:
   - Sin argumentos: `powershell -File scripts/codex-audit.ps1`
   - Con `--base main`: `powershell -File scripts/codex-audit.ps1 -Base main`
   - Con `--commit <sha>`: `powershell -File scripts/codex-audit.ps1 -Commit <sha>`
   - Si el usuario dio un foco extra (p. ej. "revisa el IVA"), pásalo con `-Focus "..."`.
   Argumentos recibidos: $ARGUMENTS
3. Lee el informe (`.codex-audit/ultimo.md`) y clasifica CADA hallazgo tú mismo contra el código real: **confirmado**, **falso positivo** (explica por qué) o **discutible**. Codex puede equivocarse igual que tú; no aceptes ni descartes a ciegas.
4. Corrige los confirmados de severidad CRITICO/ALTO/MEDIO. Los BAJO y los discutibles, solo lístalos.
5. Si corregiste algo, vuelve a correr la auditoría UNA vez más. Máximo 2 rondas; si sigue habiendo desacuerdo, resume la discrepancia al usuario en vez de iterar.
6. Cierra con: veredicto final de Codex, qué corregiste, qué descartaste y por qué.
