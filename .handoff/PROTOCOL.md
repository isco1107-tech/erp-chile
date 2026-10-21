# Protocolo de traspaso entre agentes (Claude, Codex, Antigravity)

Los tres escriben código. No se hablan entre sí: se pasan **archivos** y cada uno trabaja en su propio worktree.

## Reglas para el agente que recibe un brief
1. Lee `.handoff-task/BRIEF.md` (en la raíz de tu worktree) y este `AGENTS.md`/`CLAUDE.md`.
2. Toca solo las rutas de `allow`. Todo lo demás se anota en "Pendiente".
3. NUNCA: correr migraciones, `prisma migrate`, `prisma db push`, seeds ni scripts destructivos. La `DATABASE_URL` real apunta a producción y tu worktree no tiene `.env`; no lo crees.
4. NUNCA: editar `prisma/schema.prisma`, `prisma/migrations/`, `package.json`, lockfiles ni `.env*` salvo que el brief lo permita (`allowSchema`, `allowDeps`).
5. Verifica antes de terminar: `npm run typecheck`, `npm run lint`, `npm test`.
6. Escribe `.handoff-task/RESULT.md` (formato en el brief). No hagas push ni merge.

## Flujo (lo ejecuta el coordinador con `npm run handoff -- ...`)
`new` → editar brief → `run` → `check` → revisión cruzada → `score` → integrar.

- **Revisión cruzada:** quien escribió el código no lo revisa. Si tocó rutas sensibles (ver `agents.json`), lo revisa Claude o una persona sí o sí.
- **Integrar:** desde el repo principal, `git merge --no-ff task/<slug>-<agent>` tras la revisión. Una migración, si hace falta, la crea y aplica solo el coordinador con el visto bueno del dueño.

## Cómo se decide quién hace qué
`.handoff/agents.json` trae una hipótesis inicial por tipo de tarea (`priors`). Cada `score` registra resultado, reproceso y consumo en `.handoff/resultados.jsonl`. Con `minSamples` muestras por (tipo, agente), `npm run handoff -- report` reemplaza la hipótesis por los datos reales.
