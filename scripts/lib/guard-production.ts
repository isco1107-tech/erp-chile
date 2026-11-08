/**
 * Defensa en profundidad para scripts manuales (seed/backfill/purga), no
 * separación real de entornos (OP-01 del plan de auditoría 2026-09-14): la
 * `DATABASE_URL` local es la MISMA base que producción (CLAUDE.md Sección 5),
 * así que esto no puede distinguir "dev" de "prod" por la cadena de conexión.
 * Lo único que sí puede detectar es el runtime desplegado — Vercel define
 * `NODE_ENV=production` ahí y nunca en una ejecución manual con `npx tsx` — por
 * lo que esto bloquea que alguno de estos scripts termine corriendo como parte
 * de un build/deploy en vez de a mano desde un operador.
 */
export function assertScriptCanRun(scriptName: string): void {
  if (process.env.NODE_ENV === 'production') {
    console.error(`${scriptName}: este script no puede ejecutarse en el entorno de producción desplegado.`);
    process.exit(1);
  }
}

/**
 * Para scripts de verificación que CREAN datos de prueba o desactivan los
 * triggers de inmutabilidad del libro (afecta a todas las empresas mientras
 * corren): solo contra una base en esta máquina. Como la `DATABASE_URL` del
 * `.env` es la de producción, un `npx tsx` distraído escribiría ahí.
 */
export function assertLocalDatabase(scriptName: string): void {
  assertScriptCanRun(scriptName);
  let host = '';
  try {
    host = new URL(process.env.DATABASE_URL ?? '').hostname;
  } catch {
    // URL inválida: se trata igual que una remota.
  }
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
    console.error(`${scriptName}: solo corre contra una base local (DATABASE_URL apunta a "${host || 'desconocido'}"). Abortado.`);
    process.exit(1);
  }
}
