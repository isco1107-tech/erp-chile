#!/usr/bin/env node
// Coordinador de traspasos entre Claude, Codex y Antigravity. Ver .handoff/PROTOCOL.md.
// Uso: npm run handoff -- <new|run|check|score|report|status|suggest> ...
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const HANDOFF = path.join(ROOT, '.handoff');
const TASKS = path.join(HANDOFF, 'tasks');
const RESULTS = path.join(HANDOFF, 'resultados.jsonl');
const IS_WIN = process.platform === 'win32';
const config = JSON.parse(fs.readFileSync(path.join(HANDOFF, 'agents.json'), 'utf8'));

// ---------- utilidades ----------
function die(msg) {
  console.error(`✖ ${msg}`);
  process.exit(1);
}

function git(cwd, ...args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${(r.stderr || '').trim()}`);
  return r.stdout.trim();
}

function parseArgs(argv) {
  const pos = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) flags[key] = true;
      else {
        flags[key] = next;
        i++;
      }
    } else pos.push(a);
  }
  return { pos, flags };
}

function parseBrief(file) {
  const text = fs.readFileSync(file, 'utf8');
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) die(`${file} no tiene encabezado --- ... ---`);
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (kv) meta[kv[1]] = kv[2].trim();
  }
  meta.allowList = (meta.allow || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return { meta, text };
}

function globToRegex(glob) {
  const g = glob.replace(/\\/g, '/');
  let re = '';
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*' && g[i + 1] === '*') {
      re += '.*';
      i++;
      if (g[i + 1] === '/') i++;
    } else if (c === '*') re += '[^/]*';
    else re += c.replace(/[.+^${}()|[\]\\?]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

function worktreeFor(agent) {
  const def = config.agents[agent];
  if (!def) die(`Agente desconocido "${agent}". Opciones: ${Object.keys(config.agents).join(', ')}`);
  const out = git(ROOT, 'worktree', 'list', '--porcelain');
  let cur = null;
  for (const line of out.split(/\r?\n/)) {
    if (line.startsWith('worktree ')) cur = line.slice(9);
    if (line.startsWith('branch ') && line.slice(7) === `refs/heads/${def.branch}`) return path.normalize(cur);
  }
  return die(
    `No hay worktree con la rama ${def.branch}. Créalo: git worktree add ../repo-${agent} -b ${def.branch} main`,
  );
}

function taskDir(slug) {
  return path.join(TASKS, slug);
}

function readResults() {
  if (!fs.existsSync(RESULTS)) return [];
  return fs
    .readFileSync(RESULTS, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

// Con suficientes muestras manda el dato; si no, la hipótesis inicial.
function stats() {
  const by = {};
  for (const r of readResults()) {
    const k = `${r.type}|${r.agent}`;
    const s = (by[k] ??= { type: r.type, agent: r.agent, n: 0, ok: 0, rework: 0 });
    s.n++;
    if (r.ci) s.ok++;
    s.rework += r.rework ?? 0;
  }
  return Object.values(by);
}

function suggest(type) {
  const rows = stats().filter((s) => s.type === type && s.n >= config.minSamples);
  if (rows.length >= 2) {
    rows.sort((a, b) => b.ok / b.n - a.ok / a.n || a.rework / a.n - b.rework / b.n);
    return { agent: rows[0].agent, why: `datos propios (${rows[0].ok}/${rows[0].n} sin fallar CI)` };
  }
  const prior = config.priors[type];
  if (!prior) die(`Tipo "${type}" sin hipótesis. Tipos: ${Object.keys(config.priors).join(', ')}`);
  return { agent: prior, why: 'hipótesis inicial (aún sin muestras suficientes)' };
}

// ---------- comandos ----------
function cmdNew(pos, flags) {
  const [slug, title] = pos;
  if (!slug || !title) die('Uso: new <slug> "<título>" --type <tipo> [--agent a] [--allow "glob,glob"]');
  if (!/^[a-z0-9-]+$/.test(slug)) die('El slug solo admite minúsculas, números y guiones.');
  const type = flags.type;
  if (!type) die(`Falta --type (${Object.keys(config.priors).join(', ')})`);
  const pick = flags.agent ? { agent: flags.agent, why: 'indicado a mano' } : suggest(type);
  const dir = taskDir(slug);
  if (fs.existsSync(dir)) die(`La tarea ${slug} ya existe.`);
  fs.mkdirSync(dir, { recursive: true });
  const tpl = fs.readFileSync(path.join(HANDOFF, 'templates', 'brief.md'), 'utf8');
  const body = tpl
    .replaceAll('{{slug}}', slug)
    .replaceAll('{{title}}', title)
    .replaceAll('{{type}}', type)
    .replaceAll('{{agent}}', pick.agent)
    .replaceAll('{{allow}}', typeof flags.allow === 'string' ? flags.allow : 'src/**');
  fs.writeFileSync(path.join(dir, 'brief.md'), body);
  console.log(`✔ ${path.relative(ROOT, path.join(dir, 'brief.md'))}`);
  console.log(`  Agente sugerido: ${pick.agent} — ${pick.why}`);
  console.log('  Completa Objetivo/Contexto/Criterios y acota `allow`; luego: npm run handoff -- run ' + `${slug} ${pick.agent}`);
}

function cmdRun(pos, flags) {
  const [slug, agent] = pos;
  if (!slug || !agent) die('Uso: run <slug> <agent> [--dry] [--base main]');
  const briefFile = path.join(taskDir(slug), 'brief.md');
  if (!fs.existsSync(briefFile)) die(`No existe ${briefFile}`);
  const { meta, text } = parseBrief(briefFile);
  if (meta.allowList.length === 0 || meta.allowList.includes('src/**')) {
    console.warn('⚠ `allow` está en src/** (o vacío): acótalo para que `check` pueda detectar invasiones.');
  }
  const wt = worktreeFor(agent);
  if (git(wt, 'status', '--porcelain')) die(`El worktree ${wt} tiene cambios sin guardar. Límpialo antes.`);
  const base = typeof flags.base === 'string' ? flags.base : meta.base || 'main';
  const branch = `task/${slug}-${agent}`;
  git(wt, 'switch', '-C', branch, base);

  // El worktree no trae node_modules: se enlaza al del repo principal (solo para typecheck/lint/test).
  const nm = path.join(wt, 'node_modules');
  if (!fs.existsSync(nm) && fs.existsSync(path.join(ROOT, 'node_modules'))) {
    fs.symlinkSync(path.join(ROOT, 'node_modules'), nm, IS_WIN ? 'junction' : 'dir');
  }
  const exclude = path.resolve(wt, git(wt, 'rev-parse', '--git-path', 'info/exclude'));
  fs.mkdirSync(path.dirname(exclude), { recursive: true });
  const cur = fs.existsSync(exclude) ? fs.readFileSync(exclude, 'utf8') : '';
  if (!cur.includes('.handoff-task')) fs.appendFileSync(exclude, '\n.handoff-task/\nnode_modules\n');

  const inbox = path.join(wt, '.handoff-task');
  fs.mkdirSync(inbox, { recursive: true });
  fs.writeFileSync(path.join(inbox, 'BRIEF.md'), text);
  fs.rmSync(path.join(inbox, 'RESULT.md'), { force: true });

  const prompt =
    'Lee .handoff-task/BRIEF.md y ejecutalo siguiendo AGENTS.md y .handoff/PROTOCOL.md. No toques nada fuera de allow. Al terminar escribe .handoff-task/RESULT.md.';
  const log = path.join(taskDir(slug), `${agent}.log`);
  console.log(`▶ ${agent} en ${wt} (rama ${branch}, base ${base})`);

  const runner = config.agents[agent].runner;
  let cmd = null;
  if (runner === 'codex') cmd = `codex exec --sandbox workspace-write -C "${wt}" "${prompt}"`;
  else if (runner === 'claude') cmd = `claude -p "${prompt}" --permission-mode acceptEdits`;

  if (!cmd) {
    // Antigravity es un IDE: se abre la carpeta y la persona pega el prompt en su agente.
    console.log(`\nAbre ${wt} en Antigravity y pega esto en su agente:\n\n  ${prompt}\n`);
    if (!flags.dry) {
      const r = spawnSync('antigravity', [wt], { shell: IS_WIN, stdio: 'ignore' });
      if (r.error || r.status) console.log('(No pude abrir Antigravity desde la terminal: ábrelo a mano.)');
    }
  } else if (flags.dry) {
    console.log(`(dry) ${cmd}`);
  } else {
    const r = spawnSync(cmd, { cwd: wt, shell: true, encoding: 'utf8', maxBuffer: 1 << 28 });
    fs.writeFileSync(log, `${r.stdout || ''}\n${r.stderr || ''}`);
    if (r.error) die(`No pude ejecutar ${runner}: ${r.error.message} (¿está instalado y en el PATH?)`);
    console.log(`  Terminó con código ${r.status}. Log: ${path.relative(ROOT, log)}`);
  }
  console.log(`\nSiguiente: npm run handoff -- check ${slug} ${agent}`);
}

function runStep(wt, name, script) {
  const t0 = Date.now();
  const r = spawnSync('npm', ['run', script, '--silent'], { cwd: wt, shell: IS_WIN, encoding: 'utf8', maxBuffer: 1 << 28 });
  const ok = r.status === 0;
  console.log(`  ${ok ? '✔' : '✖'} ${name} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  return { name, ok, tail: ok ? '' : `${r.stdout || ''}${r.stderr || ''}`.split(/\r?\n/).slice(-25).join('\n') };
}

function cmdCheck(pos, flags) {
  const [slug, agent] = pos;
  if (!slug || !agent) die('Uso: check <slug> <agent> [--skip-lint] [--commit]');
  const { meta } = parseBrief(path.join(taskDir(slug), 'brief.md'));
  const wt = worktreeFor(agent);
  const base = meta.base || 'main';

  const changed = new Set([
    ...git(wt, 'diff', '--name-only', base).split(/\r?\n/),
    ...git(wt, 'ls-files', '--others', '--exclude-standard').split(/\r?\n/),
  ]);
  changed.delete('');
  const files = [...changed].map((f) => f.replace(/\\/g, '/')).sort();

  const allow = meta.allowList.map(globToRegex);
  const outside = files.filter((f) => !allow.some((re) => re.test(f)));
  const forbidden = files.filter(
    (f) =>
      /(^|\/)\.env/.test(f) ||
      (f.startsWith('prisma/') && meta.allowSchema !== 'true') ||
      (/^(package\.json|package-lock\.json)$/.test(f) && meta.allowDeps !== 'true'),
  );
  const sensitive = files.filter((f) => config.sensitivePaths.some((p) => f.startsWith(p)));

  console.log(`\n${agent} · ${slug} · ${files.length} archivo(s)`);
  files.forEach((f) => console.log(`   ${f}`));
  if (forbidden.length) console.log(`\n✖ PROHIBIDOS tocados:\n   ${forbidden.join('\n   ')}`);
  if (outside.length) console.log(`\n⚠ Fuera de \`allow\`:\n   ${outside.join('\n   ')}`);
  if (sensitive.length) console.log(`\n⚠ Rutas sensibles: exige revisión de Claude/persona antes de integrar:\n   ${sensitive.join('\n   ')}`);

  console.log('\nVerificación:');
  const steps = [runStep(wt, 'typecheck', 'typecheck')];
  if (!flags['skip-lint']) steps.push(runStep(wt, 'lint', 'lint'));
  steps.push(runStep(wt, 'test', 'test'));
  steps.filter((s) => !s.ok).forEach((s) => console.log(`\n--- ${s.name} ---\n${s.tail}`));

  const resultSrc = path.join(wt, '.handoff-task', 'RESULT.md');
  if (fs.existsSync(resultSrc)) fs.copyFileSync(resultSrc, path.join(taskDir(slug), `${agent}.result.md`));
  else console.log('\n⚠ El agente no dejó RESULT.md.');

  const ci = steps.every((s) => s.ok) && forbidden.length === 0;
  fs.writeFileSync(
    path.join(taskDir(slug), `${agent}.check.json`),
    JSON.stringify({ at: new Date().toISOString(), ci, files, outside, forbidden, sensitive, steps: steps.map(({ name, ok }) => ({ name, ok })) }, null, 2),
  );

  if (flags.commit && ci) {
    git(wt, 'add', '-A');
    git(wt, 'commit', '-m', `${meta.title} (${agent})`);
    console.log(`\n✔ Commit en la rama task/${slug}-${agent}`);
  }
  console.log(`\n${ci ? '✔ Listo para revisión cruzada' : '✖ No pasa: devuélvelo al agente o corrígelo'}.`);
  console.log(`Luego: npm run handoff -- score ${slug} ${agent} --rework <n> --tokens "<consumo>"`);
  process.exit(ci ? 0 : 1);
}

function cmdScore(pos, flags) {
  const [slug, agent] = pos;
  if (!slug || !agent) die('Uso: score <slug> <agent> [--rework N] [--tokens "..."] [--notes "..."]');
  const { meta } = parseBrief(path.join(taskDir(slug), 'brief.md'));
  const checkFile = path.join(taskDir(slug), `${agent}.check.json`);
  if (!fs.existsSync(checkFile)) die('Corre `check` antes de calificar.');
  const check = JSON.parse(fs.readFileSync(checkFile, 'utf8'));
  const row = {
    date: new Date().toISOString().slice(0, 10),
    slug,
    type: meta.type,
    agent,
    ci: check.ci,
    outside: check.outside.length,
    rework: Number(flags.rework ?? 0),
    tokens: typeof flags.tokens === 'string' ? flags.tokens : '',
    notes: typeof flags.notes === 'string' ? flags.notes : '',
  };
  fs.appendFileSync(RESULTS, `${JSON.stringify(row)}\n`);
  console.log('✔ Registrado. Ver resumen: npm run handoff -- report');
}

function cmdReport() {
  const rows = readResults();
  if (rows.length === 0) return console.log('Aún no hay resultados. Califica tareas con `score`.');
  const lines = ['| Tipo | Agente | Tareas | CI a la primera | Reproceso medio |', '|---|---|---|---|---|'];
  for (const s of stats().sort((a, b) => a.type.localeCompare(b.type) || a.agent.localeCompare(b.agent))) {
    lines.push(`| ${s.type} | ${s.agent} | ${s.n} | ${s.ok}/${s.n} | ${(s.rework / s.n).toFixed(1)} |`);
  }
  const log = ['', '| Fecha | Tarea | Tipo | Agente | CI | Reproceso | Consumo | Notas |', '|---|---|---|---|---|---|---|---|'];
  for (const r of rows) {
    log.push(`| ${r.date} | ${r.slug} | ${r.type} | ${r.agent} | ${r.ci ? 'sí' : 'no'} | ${r.rework} | ${r.tokens} | ${r.notes} |`);
  }
  const out = `# Resultados por agente (generado, no editar)\n\n${lines.join('\n')}\n\n## Historial\n${log.join('\n')}\n`;
  fs.writeFileSync(path.join(HANDOFF, 'resultados.md'), out);
  console.log(lines.join('\n'));
  console.log('\nQuién gana por tipo (mín. muestras: ' + config.minSamples + '):');
  for (const type of new Set(rows.map((r) => r.type))) {
    const s = suggest(type);
    console.log(`  ${type}: ${s.agent} — ${s.why}`);
  }
}

function cmdStatus() {
  if (!fs.existsSync(TASKS)) return console.log('Sin tareas.');
  for (const slug of fs.readdirSync(TASKS)) {
    const files = fs.readdirSync(taskDir(slug));
    const checks = files.filter((f) => f.endsWith('.check.json')).map((f) => {
      const c = JSON.parse(fs.readFileSync(path.join(taskDir(slug), f), 'utf8'));
      return `${f.split('.')[0]}:${c.ci ? 'ok' : 'falla'}`;
    });
    console.log(`${slug}  ${checks.length ? checks.join(' ') : '(sin check)'}`);
  }
}

const [cmd, ...rest] = process.argv.slice(2);
const { pos, flags } = parseArgs(rest);
const commands = {
  new: () => cmdNew(pos, flags),
  run: () => cmdRun(pos, flags),
  check: () => cmdCheck(pos, flags),
  score: () => cmdScore(pos, flags),
  report: () => cmdReport(),
  status: () => cmdStatus(),
  suggest: () => {
    const s = suggest(pos[0] ?? '');
    console.log(`${s.agent} — ${s.why}`);
  },
};
if (!commands[cmd]) die(`Comandos: ${Object.keys(commands).join(', ')}`);
commands[cmd]();
