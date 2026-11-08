// Exige secretos con largo suficiente ANTES de compilar, solo en el deploy de
// producción de Vercel (o con CHECK_SECRETS_ON_BUILD=1).
//
// `JWT_SECRET` firma las sesiones de TODAS las empresas (y de él se derivan la
// sesión del Seller Center, el desafío TOTP y los tokens del asistente): uno
// corto o adivinable permite forjar la sesión de un Dueño de cualquier empresa.
// Si falla, el build falla y Vercel deja viva la versión anterior (mismo
// criterio que scripts/migrate-deploy.mjs): nunca se publica con un secreto débil.
const enabled = process.env.VERCEL_ENV === 'production' || process.env.CHECK_SECRETS_ON_BUILD === '1';
if (!enabled) {
  console.log('[secrets] omitido (solo corre en producción de Vercel o con CHECK_SECRETS_ON_BUILD=1)');
  process.exit(0);
}

const MIN_LENGTH = 32;
const required = ['JWT_SECRET'];
const problems = [];
for (const name of required) {
  const value = process.env[name] ?? '';
  if (!value) problems.push(`${name} no está configurada`);
  else if (value.length < MIN_LENGTH) problems.push(`${name} tiene ${value.length} caracteres; debe tener al menos ${MIN_LENGTH} (genera una con: openssl rand -base64 48)`);
}

if (problems.length > 0) {
  for (const problem of problems) console.error(`[secrets] ${problem}`);
  console.error('[secrets] Build detenido: corrige la variable en Vercel → Settings → Environment Variables. Cambiar JWT_SECRET cierra todas las sesiones abiertas.');
  process.exit(1);
}
console.log('[secrets] ok');
