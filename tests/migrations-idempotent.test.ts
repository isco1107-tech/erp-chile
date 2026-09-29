import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

// Producción recibió parte del esquema con `prisma db push`, así que toda
// migración desde 2026-09-27 debe poder correr aunque el objeto ya exista.
// Sin esto, `prisma migrate deploy` falla con "already exists" (P3018), el
// deploy queda sin migrar y las escrituras a columnas nuevas se caen.
const FIRST_IDEMPOTENT = '20260927';
const dir = path.join(process.cwd(), 'prisma', 'migrations');

const migrations = readdirSync(dir)
  .filter((name) => /^\d{14}_/.test(name) && name >= FIRST_IDEMPOTENT)
  .sort();

// Sentencia por línea de inicio; los DO $$ se validan aparte.
const stripComments = (sql: string) => sql.replace(/^\s*--.*$/gm, '');

describe('migraciones idempotentes', () => {
  it('hay migraciones que revisar', () => {
    expect(migrations.length).toBeGreaterThan(0);
  });

  it.each(migrations)('%s no falla si el objeto ya existe', (name) => {
    const sql = stripComments(readFileSync(path.join(dir, name, 'migration.sql'), 'utf8'));
    const offenders: string[] = [];
    const check = (re: RegExp, guard: RegExp, label: string) => {
      for (const m of sql.matchAll(re)) if (!guard.test(m[0])) offenders.push(`${label}: ${m[0].slice(0, 90)}`);
    };
    check(/^CREATE TABLE [^\n]*/gm, /IF NOT EXISTS/, 'CREATE TABLE');
    check(/^CREATE (UNIQUE )?INDEX [^\n]*/gm, /IF NOT EXISTS/, 'CREATE INDEX');
    check(/^DROP (INDEX|TABLE) [^\n]*/gm, /IF EXISTS/, 'DROP');
    check(/^ALTER TYPE [^\n]* ADD VALUE [^\n]*/gm, /IF NOT EXISTS/, 'ADD VALUE');
    check(/^\s*ADD COLUMN [^\n]*/gm, /IF NOT EXISTS/, 'ADD COLUMN');
    check(/^ALTER TABLE [^\n]* ADD COLUMN [^\n]*/gm, /IF NOT EXISTS/, 'ADD COLUMN');
    // CREATE TYPE y ADD CONSTRAINT solo valen dentro de un DO con duplicate_object.
    for (const m of sql.matchAll(/^(CREATE TYPE|ALTER TABLE [^\n]* ADD CONSTRAINT)[^\n]*/gm)) {
      offenders.push(`sin bloque DO: ${m[0].slice(0, 90)}`);
    }
    expect(offenders).toEqual([]);
  });
});
