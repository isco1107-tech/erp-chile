#!/usr/bin/env node
// Genera AGENTS.md (Codex y Antigravity) desde CLAUDE.md, que es la fuente única.
// Quita lo que solo aplica a Claude (herramienta de delegación) y agrega el protocolo de traspaso.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8').replace(/\r\n/g, '\n');

let out = src
  .replace(/^# CLAUDE\.md/m, '# AGENTS.md')
  .replace('(Cline, Claude Code, Gemini)', '(Claude Code, Codex, Antigravity, Gemini)');

// Sección 8 (delegación con mcp__model-delegate) es exclusiva de Claude Code.
out = out.replace(/\n---\n\n## 8\. Delegar tareas mecánicas[\s\S]*?(?=\n<!-- BEGIN:nextjs-agent-rules -->|$)/, '\n');

const protocol = `
---

## Trabajo en conjunto con otros agentes

Si recibes un brief en \`.handoff-task/BRIEF.md\`, sigue \`.handoff/PROTOCOL.md\`: toca solo las rutas de \`allow\`, no corras migraciones ni seeds (la base es la de producción), no edites \`prisma/\`, \`package.json\` ni \`.env*\`, y termina escribiendo \`.handoff-task/RESULT.md\`.
`;

out = `<!-- GENERADO desde CLAUDE.md con \`npm run sync:agents\`. No editar a mano. -->\n${out.trimEnd()}\n${protocol}`;
fs.writeFileSync(path.join(root, 'AGENTS.md'), out);
console.log('AGENTS.md regenerado desde CLAUDE.md');
