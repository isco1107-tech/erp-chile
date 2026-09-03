/**
 * Autenticación de rutas de cron (`src/app/api/**\/cron/route.ts`). Falla
 * CERRADO si `CRON_SECRET` no está seteado en el entorno — la versión previa
 * de este chequeo (repetida en cada ruta de cron) solo exigía el header
 * cuando la variable existía, así que un despliegue sin `CRON_SECRET`
 * configurado dejaba el endpoint abierto a cualquiera que adivinara la URL.
 * Vercel Cron siempre manda el secreto si está configurado en el proyecto,
 * así que exigirlo siempre es seguro para el uso real.
 */
export function isCronAuthorized(req: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  return req.headers.get('authorization') === `Bearer ${cronSecret}`;
}
