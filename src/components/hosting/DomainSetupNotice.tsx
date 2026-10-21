/**
 * Qué le falta a un dominio propio para mostrar el sitio, en palabras claras.
 * Lo comparten el panel de dominio de sitios web y academia (`DomainPanel`) y
 * el de certámenes (`CustomDomainSection`).
 *
 * El caso que más confundía: los DNS ya apuntan a la plataforma pero Vercel no
 * tiene agregado el dominio (no hay conexión automática), así que el dominio
 * muestra un error de Vercel por más que se «actualice todo». Eso se dice
 * explícito, con quién lo resuelve y cómo.
 */
export function DomainSetupNotice({ domain, automatic, dnsOk, serving }: { domain: string; automatic: boolean; dnsOk: boolean; serving: boolean }) {
  if (serving) return null;
  const apex = domain.split('.').length === 2;
  if (dnsOk && !automatic) {
    return (
      <div role="status" className="space-y-1 rounded-md bg-warning-soft px-3 py-2 text-xs text-warning">
        <p className="font-semibold">Los DNS ya apuntan bien, pero el dominio todavía no muestra el sitio.</p>
        <p>
          Falta agregar {domain}
          {apex ? ` (y www.${domain})` : ''} en el servidor de la plataforma: el administrador debe entrar a Vercel → el proyecto → Settings → Domains y agregarlo, o activar la conexión automática (variable de entorno VERCEL_API_TOKEN) para que se agregue solo. Después pulsa «Revisar estado».
        </p>
      </div>
    );
  }
  if (dnsOk && automatic) {
    return <p className="text-xs text-muted-foreground">Los DNS ya apuntan bien y el dominio quedó registrado en el servidor; falta que se emita su certificado de seguridad (suele tardar unos minutos). Pulsa «Revisar estado» más tarde.</p>;
  }
  if (!automatic) {
    return (
      <p className="rounded-md bg-warning-soft px-3 py-2 text-xs text-warning">
        Además de crear los registros DNS, el administrador de la plataforma debe agregar {domain}
        {apex ? ` y www.${domain}` : ''} en Vercel (el proyecto → Settings → Domains), porque la conexión automática no está configurada. Sin eso el dominio no mostrará el sitio.
      </p>
    );
  }
  return null;
}
