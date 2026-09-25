import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import { ERP_ENTRY_COOKIE, ERP_ENTRY_COOKIE_OPTIONS } from '@/lib/auth/entry-preference';
import { customDomainRoute, domainFromHost, isPlatformHost, platformBaseUrl } from '@/lib/hosting/custom-domain';

/**
 * Rutas alcanzables sin sesión. `forgot-password` y `reset-password` tienen que
 * estar acá por definición: quien las necesita es justamente alguien que no
 * puede iniciar sesión.
 */
const PUBLIC_ROUTES = [
  '/login',
  '/favicon.ico',
  // Convención de ícono de Next.js 16 (src/app/icon.png) — el navegador la
  // pide directo, sin sesión, igual que /favicon.ico.
  '/icon.png',
  '/api/auth/login',
  '/api/auth/signin',
  '/api/auth/signout',
  '/accept-invitation',
  '/forgot-password',
  '/reset-password',
  // Acceso de jurado por link con token — el jurado no tiene cuenta ni sesión
  // ERP (ver JudgeAssignment.accessToken); la ruta valida el token ella misma.
  '/judging',
  // Portal público de la marca auspiciadora por link con token — mismo
  // criterio que /judging (ver SponsorshipContract.portalToken).
  '/sponsors',
  // Verificación pública de credenciales de staff/proveedores por QR — quien
  // controla el ingreso no tiene cuenta ERP; la ruta valida el token ella
  // misma (ver StaffAccreditation.qrToken).
  '/verify',
  // Auto-inscripción pública de candidatas por link de certamen — la
  // postulante no tiene cuenta ni contraseña ERP; la ruta valida el token
  // ella misma (ver Project.candidateRegistrationToken).
  '/register',
  // Venta pública de entradas y votación pagada del público, cada una por su
  // propio link de certamen — mismo criterio que `/register` (el comprador no
  // tiene cuenta ni sesión ERP; la ruta valida el token ella misma contra
  // `Project.ticketSalesToken` / `Project.voteSalesToken`).
  '/tickets',
  '/votar',
  // Micrositio público de cada certamen (`/certamen/[slug]`): lo ve
  // cualquiera en internet; la página solo publica si el certamen tiene el
  // sitio activado (`Project.publicSiteEnabled`) y la empresa está operativa.
  '/certamen',
  // Portal de pago de cuotas de candidatas (`/pagar/[token]`) y su página de
  // estado/comprobante (`/pagar/estado/[accessToken]`): quien paga (familia,
  // auspiciador) no tiene cuenta ERP; la ruta valida el token ella misma
  // contra `CompanySettings.installmentPortalToken` / la orden de pago.
  '/pagar',
  // Portal del trabajador (`/trabajador/[token]`): el trabajador no tiene
  // cuenta ERP; la ruta valida el token ella misma contra el hash guardado en
  // `Employee.portalTokenHash`.
  '/trabajador',
  // Seguimiento de servicio técnico (`/servicio/[token]`): el cliente no
  // tiene cuenta ERP; la ruta valida el token ella misma contra
  // `ServiceTicket.trackingToken`.
  '/servicio',
  // Portal de clientes (`/cliente/[token]`): el cliente no tiene cuenta ERP;
  // la ruta valida el token ella misma contra `Contact.portalTokenHash`.
  '/cliente',
  // Activos estáticos de marca (logo/ícono de Aether ERP en `public/branding`)
  // — deben verse en TODA la superficie del producto, incluida la pantalla de
  // login, que por definición no tiene sesión.
  '/branding',
  // Políticas de privacidad públicas: la de la empresa cliente (enlazada
  // desde el formulario público de postulación, sin sesión ERP) y la de la
  // propia plataforma Aether (enlazada desde `AetherBadge`, visible en toda
  // la app, login incluido).
  '/politica-privacidad',
  '/aether',
  // Metadatos de rastreo de la landing (`src/app/robots.ts` y
  // `src/app/sitemap.ts`): un buscador los pide sin cookies, así que si
  // cayeran en el redirect a /login la landing quedaría sin robots ni sitemap.
  '/robots.txt',
  '/sitemap.xml',
  // Imagen para compartir en redes (`src/app/opengraph-image.tsx`) y manifest
  // web: los piden WhatsApp, LinkedIn o el navegador, siempre sin sesión.
  '/opengraph-image',
  '/manifest.webmanifest',
];

/**
 * Petición que llegó por el dominio propio de un certamen (ej.
 * missuniversotemuco.cl): la raíz muestra su micrositio, los flujos públicos
 * que enlaza (postulación, entradas, votación, pagos) se sirven igual, y todo
 * lo demás (login, panel) se manda a la plataforma: el ERP nunca se sirve
 * bajo el dominio de un cliente. Sin base de datos: `/sitio/[host]` resuelve
 * qué certamen es.
 */
function routeCustomDomain(req: NextRequest, host: string): NextResponse {
  const { pathname, search } = req.nextUrl;
  const route = customDomainRoute(pathname);
  if (route.kind === 'site') {
    const url = req.nextUrl.clone();
    url.pathname = `/sitio/${encodeURIComponent(domainFromHost(host))}`;
    return NextResponse.rewrite(url);
  }
  if (route.kind === 'pass') return NextResponse.next();
  return NextResponse.redirect(`${platformBaseUrl()}${pathname}${search}`);
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const host = req.headers.get('host');
  if (!isPlatformHost(host)) return routeCustomDomain(req, host ?? '');

  // The application and returning customers enter the ERP. This preference
  // does not authorize anything: dashboard guards still validate the tenant.
  if (pathname === '/') {
    const token = req.cookies.get('session')?.value;
    const desktop = /\bAetherDesktop\//i.test(req.headers.get('user-agent') ?? '');
    if (token || desktop || req.cookies.get(ERP_ENTRY_COOKIE)?.value === 'erp') {
      let destination = '/login';
      if (token) {
        try {
          if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not set');
          const { payload } = await jwtVerify(token, new TextEncoder().encode(process.env.JWT_SECRET));
          if (payload.purpose !== 'session') throw new Error('Token de sesión inválido');
          destination = '/dashboard';
        } catch { /* An expired session still belongs at login, not marketing. */ }
      }
      const response = NextResponse.redirect(new URL(destination, req.url));
      response.headers.set('Cache-Control', 'private, no-store');
      response.cookies.set(ERP_ENTRY_COOKIE, 'erp', ERP_ENTRY_COOKIE_OPTIONS);
      if (token && destination === '/login') response.cookies.delete('session');
      return response;
    }
    return NextResponse.next();
  }

  if (
    pathname === '/conoce-aether' ||
    pathname === '/landing-v2' ||
    pathname.startsWith('/marketing/') ||
    pathname.startsWith('/downloads/') ||
    pathname.startsWith('/manual/screenshots/') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/static') ||
    PUBLIC_ROUTES.some((route) => pathname.startsWith(route))
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get('session')?.value;

  if (!token) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  try {
    if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not set');
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);
    // Defensa en profundidad: el token de challenge de 2FA (totp-challenge.ts)
    // ya está firmado con una clave distinta y por eso falla `jwtVerify` acá
    // mismo, pero este chequeo explícito no depende de que esa separación de
    // claves se mantenga para siempre.
    if (payload.purpose !== 'session') throw new Error('Token de sesión inválido');

    // Descarte temprano del portal de plataforma. Es solo una primera barrera:
    // el token podría ser anterior a una revocación, así que `requireSuperAdmin()`
    // vuelve a comprobar la bandera contra la base de datos en cada página.
    if (pathname.startsWith('/superadmin') && payload.isSuperAdmin !== true) {
      return NextResponse.redirect(new URL('/dashboard', req.url));
    }

    return NextResponse.next();
  } catch {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    const response = NextResponse.redirect(loginUrl);
    response.cookies.delete('session');
    return response;
  }
}

export const config = {
  // `/api` queda fuera a propósito: un 307 hacia el HTML de /login es una
  // respuesta inútil para un cliente que espera JSON. Cada route handler bajo
  // src/app/api/** DEBE llamar `requireAuthWithPermission()` (o `requireSuperAdmin()`)
  // por su cuenta y devolver 401/403 con cuerpo JSON. Si agregas una ruta API
  // nueva, ese guard no es opcional.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
