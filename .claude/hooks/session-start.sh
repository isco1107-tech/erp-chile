#!/bin/bash
# Prepara el repo para sesiones de Claude Code en la nube: instala
# dependencias npm (postinstall corre `prisma generate`) para que
# typecheck/lint/test funcionen sin más pasos.
#
# Deliberadamente NO toca la base de datos: DATABASE_URL apunta a la misma
# instancia Neon que producción (ver Sección 5 de CLAUDE.md), así que
# `prisma migrate`/`seed` nunca corren automáticamente acá.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

npm install
