// Aplica las migraciones pendientes ANTES de compilar, solo en el deploy de
// producción de Vercel (o si se fuerza con MIGRATE_ON_BUILD=1).
//
// Por qué existe: la base de datos es la misma que ve el código desplegado. Si
// el build sube código nuevo sin haber aplicado sus migraciones, cada request
// que toca una columna nueva falla (así cayó el inicio de sesión con
// `CompanyFeatures.hasWebSites`). Aplicar acá hace que, si una migración falla,
// el build falle también y Vercel deje viva la versión anterior.
//
// Las migraciones son idempotentes (IF NOT EXISTS / duplicate_object): la base
// de producción recibió parte del esquema con `prisma db push`, así que crear
// de nuevo lo que ya existe no debe romper. Si una corrida anterior quedó
// marcada como fallida (P3009), se marca como revertida y se reintenta: es
// seguro precisamente por esa idempotencia.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';

const enabled = process.env.VERCEL_ENV === 'production' || process.env.MIGRATE_ON_BUILD === '1';
if (!enabled) {
  console.log('[migrate] omitido (solo corre en producción de Vercel o con MIGRATE_ON_BUILD=1)');
  process.exit(0);
}
const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) {
  console.error('[migrate] falta DIRECT_DATABASE_URL / DATABASE_URL_UNPOOLED / DATABASE_URL: no se puede migrar. Build detenido.');
  process.exit(1);
}

const run = (args) => {
  const r = spawnSync('npx', ['prisma', ...args], { encoding: 'utf8', env: process.env });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  process.stdout.write(out);
  return { code: r.status ?? 1, out };
};

if (!process.env.DIRECT_DATABASE_URL && !process.env.DATABASE_URL_UNPOOLED) {
  console.warn('[migrate] sin conexión directa (DIRECT_DATABASE_URL / DATABASE_URL_UNPOOLED): se usa la del pooler, que puede colgar las migraciones.');
}

let res = run(['migrate', 'deploy']);

if (res.code !== 0 && res.out.includes('P3009')) {
  const failed = [...res.out.matchAll(/The `([^`]+)` migration started at/g)].map((m) => m[1]);
  const known = new Set(readdirSync('prisma/migrations').filter((d) => existsSync(`prisma/migrations/${d}/migration.sql`)));
  const resolvable = failed.filter((name) => known.has(name));
  if (resolvable.length === 0) {
    console.error('[migrate] hay migraciones fallidas que no se pueden reintentar solas. Build detenido.');
    process.exit(1);
  }
  for (const name of resolvable) {
    console.log(`[migrate] marcando como revertida la migración fallida ${name} para reintentarla`);
    if (run(['migrate', 'resolve', '--rolled-back', name]).code !== 0) process.exit(1);
  }
  res = run(['migrate', 'deploy']);
}

if (res.code !== 0) {
  console.error('[migrate] la migración falló: se detiene el build para no publicar código contra un esquema viejo.');
  process.exit(res.code);
}
console.log('[migrate] base de datos al día');
