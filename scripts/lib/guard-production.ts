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
