/**
 * Dominios propios de los micrositios de certámenes (ej. `missuniversotemuco.cl`).
 *
 * Todo acá es puro (sin base de datos ni red) porque lo usa `src/proxy.ts`,
 * que en Next 16 no debe depender de módulos compartidos con estado: el proxy
 * decide solo con el host de la petición y las variables de entorno.
 */

/** Etiqueta DNS válida: letras, números y guiones, sin guion al borde, hasta 63 caracteres. */
const LABEL_RE = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;

/**
 * Normaliza lo que escribe el usuario ("https://www.MissUniversoTemuco.cl/")
 * al dominio que se guarda ("missuniversotemuco.cl"): sin protocolo, ruta,
 * puerto, punto final ni `www.`. El `www.` se sirve igual (el proxy lo quita).
 */
export function normalizeDomain(input: string): string {
  let value = input.trim().toLowerCase();
  value = value.replace(/^[a-z]+:\/\//, '');
  value = value.split(/[/?#]/)[0] ?? '';
  value = value.replace(/:\d+$/, '').replace(/\.$/, '');
  if (value.startsWith('www.')) value = value.slice(4);
  return value;
}

/** Hosts donde vive la propia plataforma: nunca pueden registrarse como dominio de un certamen. */
export function appHosts(env: Record<string, string | undefined> = process.env): string[] {
  const fromUrl = (raw: string | undefined): string | null => {
    if (!raw?.trim()) return null;
    try {
      return new URL(raw.includes('://') ? raw : `https://${raw}`).hostname.toLowerCase();
    } catch {
      return null;
    }
  };
  const hosts = [
    fromUrl(env.APP_URL),
    fromUrl(env.VERCEL_PROJECT_PRODUCTION_URL),
    fromUrl(env.VERCEL_URL),
    fromUrl(env.VERCEL_BRANCH_URL),
    ...(env.APP_HOSTS ?? '').split(',').map((host) => fromUrl(host)),
  ].filter((host): host is string => Boolean(host));
  return [...new Set(hosts.flatMap((host) => [host, host.startsWith('www.') ? host.slice(4) : `www.${host}`]))];
}

/**
 * `null` si el dominio sirve para un certamen, o el motivo (en español) si no.
 * Rechaza IPs, `localhost`, subdominios de Vercel y los hosts de la propia
 * plataforma: registrar uno de esos desviaría la app entera al micrositio.
 */
export function customDomainProblem(domain: string, env: Record<string, string | undefined> = process.env): string | null {
  if (!domain) return 'Escribe el dominio, por ejemplo missuniversotemuco.cl';
  if (domain.length > 253) return 'El dominio es demasiado largo';
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(domain) || domain.includes(':')) return 'Usa un nombre de dominio, no una dirección IP';
  const labels = domain.split('.');
  if (labels.length < 2) return 'El dominio debe incluir su terminación, por ejemplo .cl o .com';
  if (!labels.every((label) => LABEL_RE.test(label))) return 'El dominio tiene caracteres no válidos (solo letras, números, guiones y puntos)';
  if (!/^[a-z]{2,63}$/.test(labels[labels.length - 1]!)) return 'La terminación del dominio no es válida';
  if (domain === 'localhost' || domain.endsWith('.localhost')) return 'Ese dominio no es público';
  if (domain.endsWith('.vercel.app') || domain.endsWith('.vercel.sh')) return 'Usa un dominio propio, no uno de vercel.app';
  const platform = appHosts(env);
  if (platform.some((host) => host === domain || domain.endsWith(`.${host}`) || host.endsWith(`.${domain}`))) {
    return 'Ese dominio es el de la plataforma; usa uno propio del certamen';
  }
  return null;
}

/**
 * Dominio raíz ("ejemplo.cl") vs. subdominio ("miss.ejemplo.cl"): define el
 * registro DNS a crear (A en la raíz, CNAME en un subdominio) y si conviene
 * sumar `www.`. Heurística de dos etiquetas: cubre .cl, .com, .org, etc.
 */
export function isApexDomain(domain: string): boolean {
  return domain.split('.').length === 2;
}

/** Host de la petición sin puerto, en minúsculas. */
function cleanHost(host: string | null): string {
  return (host ?? '').trim().toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');
}

/**
 * `true` si la petición llegó por la propia plataforma (dominio principal,
 * vercel.app, localhost); `false` si llegó por el dominio propio de un
 * certamen. Ante la duda (sin host) se trata como plataforma.
 */
export function isPlatformHost(host: string | null, env: Record<string, string | undefined> = process.env): boolean {
  const value = cleanHost(host);
  if (!value) return true;
  if (value === 'localhost' || value.endsWith('.localhost') || /^\d{1,3}(\.\d{1,3}){3}$/.test(value) || value.startsWith('[')) return true;
  if (value.endsWith('.vercel.app') || value.endsWith('.vercel.sh')) return true;
  return appHosts(env).includes(value);
}

/** Dominio guardado correspondiente al host de la petición (quita `www.`). */
export function domainFromHost(host: string | null): string {
  return normalizeDomain(cleanHost(host));
}

/**
 * Rutas que un micrositio en dominio propio puede servir tal cual: los
 * recursos de Next, la imagen para redes, y los flujos públicos a los que
 * enlaza el sitio (postulación, entradas, votación, pago de cuotas y
 * política de privacidad). Todas validan su propio token o son públicas.
 */
const CUSTOM_DOMAIN_PASSTHROUGH = [
  '/_next',
  '/certamen/',
  '/register',
  '/tickets',
  '/votar',
  '/pagar',
  '/politica-privacidad',
  '/icon.png',
  '/favicon.ico',
  '/branding',
  '/robots.txt',
];

export type CustomDomainRoute =
  /** Raíz del dominio: se reescribe al micrositio del certamen. */
  | { kind: 'site' }
  /** Ruta pública que se sirve igual. */
  | { kind: 'pass' }
  /** Cualquier otra (panel, login…): va a la plataforma, nunca bajo el dominio del certamen. */
  | { kind: 'platform' };

export function customDomainRoute(pathname: string): CustomDomainRoute {
  if (pathname === '/' || pathname === '') return { kind: 'site' };
  if (CUSTOM_DOMAIN_PASSTHROUGH.some((prefix) => pathname === prefix || pathname.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`))) {
    return { kind: 'pass' };
  }
  return { kind: 'platform' };
}

/** URL base de la plataforma, misma regla que `getAppUrl()` del mailer (sin importar su módulo de servidor). */
export function platformBaseUrl(env: Record<string, string | undefined> = process.env): string {
  if (env.APP_URL) return env.APP_URL.replace(/\/$/, '');
  if (env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (env.VERCEL_URL) return `https://${env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

/**
 * Dominio canónico de la plataforma: en producción, una visita por una
 * dirección `*.vercel.app` (la del proyecto o la de un despliegue) se manda
 * al dominio de `APP_URL` (ej. aetherp.online), para que la plataforma viva
 * en un solo dominio y las sesiones y enlaces no se repartan entre dos.
 * Devuelve la URL base a la que redirigir, o `null` si no corresponde:
 * fuera de producción (los previews siguen en su vercel.app), sin `APP_URL`
 * o si `APP_URL` también es un vercel.app.
 */
export function canonicalPlatformBase(host: string | null, env: Record<string, string | undefined> = process.env): string | null {
  if (env.VERCEL_ENV !== 'production' || !env.APP_URL) return null;
  const value = cleanHost(host);
  if (!value.endsWith('.vercel.app')) return null;
  let target: URL;
  try {
    target = new URL(env.APP_URL);
  } catch {
    return null;
  }
  if (target.hostname.endsWith('.vercel.app') || target.hostname === value) return null;
  return target.origin;
}
