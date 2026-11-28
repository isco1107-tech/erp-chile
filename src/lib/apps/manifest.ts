import type { Metadata, Viewport } from 'next';
import { APPS, appIconPaths, type AppId } from './registry';

/**
 * Manifest web de una app instalable, armado desde el registro
 * (`registry.ts`): así todas llevan `id` y `scope` propios, y sus íconos
 * separados por propósito (`any` y `maskable` nunca juntos en un mismo
 * archivo: Android recorta el maskable y el `any` se vería con borde).
 *
 * `origin` agrega `related_applications` (la propia app web, con la URL
 * absoluta de su manifest): es lo que permite a `navigator.getInstalledRelatedApps()`
 * saber si la app ya está instalada cuando se la visita desde el navegador.
 */
export function buildAppManifest(id: AppId, origin?: string) {
  const app = APPS[id];
  const icons = appIconPaths(id);
  return {
    id: app.manifestId,
    name: app.name,
    short_name: app.shortName,
    description: app.description,
    start_url: app.startUrl,
    scope: app.scope,
    display: 'standalone' as const,
    orientation: app.orientation,
    background_color: app.backgroundColor,
    theme_color: app.themeColor,
    lang: 'es-CL',
    dir: 'ltr' as const,
    categories: app.categories,
    icons: [
      { src: icons.any192, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: icons.any512, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: icons.maskable512, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    ...(app.shortcuts.length
      ? {
          shortcuts: app.shortcuts.map((shortcut) => ({
            name: shortcut.name,
            url: shortcut.url,
            icons: [{ src: icons.any192, sizes: '192x192', type: 'image/png' }],
          })),
        }
      : {}),
    ...(origin
      ? {
          prefer_related_applications: false,
          related_applications: [{ platform: 'webapp', url: new URL(app.manifestPath, origin).toString() }],
        }
      : {}),
  };
}

/** Respuesta de la ruta `…/manifest.webmanifest` de una app. */
export function appManifestResponse(id: AppId, request: Request): Response {
  const origin = new URL(request.url).origin;
  return new Response(JSON.stringify(buildAppManifest(id, origin)), {
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

/**
 * Íconos de la plataforma: lo que se ve en la pestaña del navegador (y en
 * favoritos, el historial y la pantalla de inicio de iOS) en TODA página de
 * Aether que no declare el suyo — el panel, el login, la landing, los accesos
 * públicos. Siempre es el logo de Aether.
 *
 * Los dos archivos de pestaña son el logo recortado (sin el aire del ícono de
 * app: a 16–32 px el logo completo se ve diminuto) y se mantienen juntos:
 * `public/branding/favicon-192.png` es el mismo dibujo que `src/app/icon.png` y
 * `public/favicon.ico` (16, 32 y 48 px).
 *
 * El `.ico` va en `public/`, NO en `src/app/favicon.ico`: Next antepone un
 * `favicon.ico` de la raíz de `src/app` a los íconos de TODA página, incluso a
 * las que declaran el suyo, y competiría con el logo propio de un certamen o
 * sitio web de cliente (`faviconUrl`), que debe reemplazar al de Aether.
 *
 * POR QUÉ SE DECLARA `icon` AQUÍ y no basta `src/app/icon.png`: Next.js ignora
 * los íconos de archivo del segmento si ese mismo segmento exporta
 * `metadata.icons`, y el layout raíz ya declara el de iOS. Con solo `apple`
 * la página no llevaba ningún `<link rel="icon">` y la pestaña mostraba el
 * globo por defecto del navegador. Las páginas con logo propio (certámenes,
 * sitios web) y las apps instaladas (`appMetadata`) lo reemplazan a propósito.
 */
export const PLATFORM_FAVICON = {
  ico: '/favicon.ico',
  png192: '/branding/favicon-192.png',
} as const;

export function platformIcons() {
  return {
    icon: [
      { url: PLATFORM_FAVICON.ico, sizes: '48x48' },
      { url: PLATFORM_FAVICON.png192, sizes: '192x192', type: 'image/png' },
    ],
    shortcut: [{ url: PLATFORM_FAVICON.ico }],
    apple: [{ url: appIconPaths('erp').apple180, sizes: '180x180', type: 'image/png' }],
  };
}

/**
 * Metadatos del layout de una app: su manifest, su ícono en la pestaña y el de
 * iOS («Agregar a pantalla de inicio»), y el nombre que iOS pone bajo el ícono.
 * Cada app tiene los suyos: ninguna hereda el logo de otra.
 */
export function appMetadata(id: AppId, overrides: Partial<Metadata> = {}): Metadata {
  const app = APPS[id];
  const icons = appIconPaths(id);
  return {
    title: app.name,
    description: app.description,
    manifest: app.manifestPath,
    robots: { index: false, follow: false },
    applicationName: app.shortName,
    appleWebApp: { capable: true, title: app.shortName, statusBarStyle: app.statusBar },
    formatDetection: { telephone: false },
    icons: {
      icon: [{ url: icons.any192, sizes: '192x192', type: 'image/png' }],
      apple: [{ url: icons.apple180, sizes: '180x180', type: 'image/png' }],
    },
    ...overrides,
  };
}

/** Viewport de una app: pantalla completa en el teléfono (con muesca) y el color de la barra del sistema. */
export function appViewport(id: AppId): Viewport {
  return {
    themeColor: APPS[id].themeColor,
    width: 'device-width',
    initialScale: 1,
    viewportFit: 'cover',
  };
}
