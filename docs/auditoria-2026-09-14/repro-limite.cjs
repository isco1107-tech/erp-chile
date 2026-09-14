// Reproducción local de SEG-09. No carga .env, Prisma ni realiza solicitudes.
// Desde la raíz: node docs/auditoria-2026-09-14/repro-limite.cjs
// Salida 0 significa defecto reproducido en la versión auditada.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');

const sourcePath = path.resolve(__dirname, '../../src/lib/security/rate-limiter.ts');
const source = fs.readFileSync(sourcePath, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

let clockMs = 1_000_000;
class AuditDate extends Date {
  static now() { return clockMs; }
}
const exportsObject = {};
const sandbox = {
  exports: exportsObject,
  module: { exports: exportsObject },
  Date: AuditDate,
  require() { throw new Error('La reproducción no permite importar módulos desde el código auditado.'); },
};
vm.runInNewContext(compiled, sandbox, { timeout: 1000, filename: sourcePath });
const limiter = exportsObject;

const firstFive = Array.from({ length: 5 }, () =>
  limiter.checkRateLimit('synthetic-candidate', limiter.CANDIDATE_APPLICATION_RATE_LIMIT).allowed);
const sixthBeforeCleanup = limiter.checkRateLimit('synthetic-candidate', limiter.CANDIDATE_APPLICATION_RATE_LIMIT).allowed;
clockMs += 121_000;
limiter.checkRateLimit('synthetic-unrelated-login', limiter.LOGIN_RATE_LIMIT);
const sixthAfterCleanup = limiter.checkRateLimit('synthetic-candidate', limiter.CANDIDATE_APPLICATION_RATE_LIMIT).allowed;

assert(firstFive.every(Boolean));
assert.equal(sixthBeforeCleanup, false);
assert.equal(sixthAfterCleanup, true, 'El defecto auditado dejó de reproducirse: revisar si fue corregido.');
const result = {
  finding: 'SEG-09',
  source: 'src/lib/security/rate-limiter.ts',
  isolated: true,
  elapsedMs: 121_000,
  configuredWindowMs: limiter.CANDIDATE_APPLICATION_RATE_LIMIT.windowMs,
  firstFiveAllowed: firstFive,
  sixthAllowedBeforeUnrelatedCleanup: sixthBeforeCleanup,
  sixthAllowedAfterUnrelatedCleanup: sixthAfterCleanup,
  expectedSixthAllowedAfterCleanup: false,
  defectReproduced: true,
};
fs.writeFileSync(path.join(__dirname, 'repro-limite.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
