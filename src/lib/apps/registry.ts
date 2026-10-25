/**
 * Registro ÚNICO de las apps instalables de Aether. Cada una es una app
 * independiente para el teléfono: su propia identidad (`id`), su propio
 * alcance (`scope`), su propio ícono y su propio nombre. Manifests, service
 * workers, metadatos de cada layout, el centro de apps (`/apps`) y las
 * pruebas salen de aquí.
 *
 * REGLA QUE NO SE ROMPE: los alcances no se anidan. Un navegador (sobre todo
 * Chrome en Android) da por «ya instalada» cualquier página que cae dentro del
 * alcance de una app instalada. Antes el manifest del ERP no tenía `scope` y
 * abarcaba `/`: con el ERP instalado, Bodega, Control y Seller Center parecían
 * instaladas y no ofrecían su propia instalación. Por eso el ERP vive en
 * `/dashboard` y `tests/pwa-apps.test.ts` exige que ningún alcance contenga a
 * otro y que ningún `id` se repita.
 *
 * Los íconos de cada app los genera `scripts/generate-app-icons.mjs` (un color
 * y un símbolo distintos por app) y se guardan en `public/branding/apps/`.
 */

export const APP_IDS = ['erp', 'control', 'pos', 'bodega', 'seller'] as const;
export type AppId = (typeof APP_IDS)[number];

export interface AppShortcut {
  name: string;
  url: string;
}

export interface AppDefinition {
  id: AppId;
  /** Nombre completo (pantalla de instalación, título). */
  name: string;
  /** Nombre bajo el ícono en la pantalla de inicio (corto: se corta cerca de los 12 caracteres). */
  shortName: string;
  description: string;
  /** Identidad de la app para el navegador: dos apps con el mismo `id` serían la misma. */
  manifestId: string;
  startUrl: string;
  scope: string;
  manifestPath: string;
  /** Service worker que activa la instalación. `productionOnly`: solo se registra en producción. */
  worker: { url: string; productionOnly: boolean };
  orientation: 'any' | 'portrait';
  /**
   * Barra de estado en iOS. `black-translucent` deja la app DEBAJO de la barra: solo para
   * una app cuyas pantallas ya respetan `env(safe-area-inset-top)` (Bodega). Las demás
   * usan `default`, que empuja el contenido bajo la barra.
   */
  statusBar: 'default' | 'black-translucent';
  /** Color de la barra del sistema. */
  themeColor: string;
  /** Color de la pantalla de arranque (el de fondo de la primera pantalla de la app). */
  backgroundColor: string;
  /** Color del ícono (lo usa el generador de íconos y la tarjeta del centro de apps). */
  iconColor: string;
  categories: string[];
  shortcuts: AppShortcut[];
}

const INK = '#12161f';

export const APPS: Record<AppId, AppDefinition> = {
  erp: {
    id: 'erp',
    name: 'Aether ERP',
    shortName: 'Aether ERP',
    description: 'Ventas, inventario, finanzas y eventos en un solo lugar. ERP hecho para Chile.',
    manifestId: '/dashboard',
    startUrl: '/dashboard',
    scope: '/dashboard',
    manifestPath: '/manifest.webmanifest',
    // El ERP solo usa el service worker de avisos (`/sw.js`) si la persona activa las notificaciones.
    worker: { url: '/sw.js', productionOnly: true },
    orientation: 'any',
    statusBar: 'default',
    themeColor: '#10131a',
    backgroundColor: '#10131a',
    iconColor: '#ffffff',
    categories: ['business', 'productivity'],
    shortcuts: [],
  },
  control: {
    id: 'control',
    name: 'Aether Control',
    shortName: 'Control',
    description: 'Tu empresa de un vistazo: ventas, cobros, cajas y actividad reciente. Acceso exclusivo del dueño.',
    manifestId: '/control',
    startUrl: '/control',
    scope: '/control',
    manifestPath: '/control/manifest.webmanifest',
    worker: { url: '/control/install-sw.js', productionOnly: false },
    orientation: 'any',
    statusBar: 'default',
    themeColor: INK,
    backgroundColor: '#ffffff',
    iconColor: '#14305a',
    categories: ['business', 'finance'],
    shortcuts: [
      { name: 'Cajas', url: '/control#control-cajas' },
      { name: 'Actividad', url: '/control#control-actividad' },
    ],
  },
  pos: {
    id: 'pos',
    name: 'Aether POS',
    shortName: 'Aether POS',
    description: 'Punto de venta conectado al ERP: apertura de caja, venta, ingresos, retiros y cierre por cajero.',
    manifestId: '/pos',
    startUrl: '/pos',
    scope: '/pos',
    manifestPath: '/pos/manifest.webmanifest',
    worker: { url: '/pos/install-sw.js', productionOnly: false },
    orientation: 'any',
    statusBar: 'default',
    themeColor: INK,
    backgroundColor: '#ffffff',
    iconColor: '#0f6b4f',
    categories: ['business', 'shopping'],
    shortcuts: [],
  },
  bodega: {
    id: 'bodega',
    name: 'Aether Bodega',
    shortName: 'Bodega',
    description: 'Ingresa, descuenta y traslada productos de tu bodega desde el celular. Identifica productos con una foto.',
    manifestId: '/bodega',
    startUrl: '/bodega',
    scope: '/bodega',
    manifestPath: '/bodega/manifest.webmanifest',
    // Este sí guarda archivos estáticos y la página para abrir sin señal (ver `public/bodega-sw.js`).
    worker: { url: '/bodega-sw.js', productionOnly: true },
    orientation: 'portrait',
    statusBar: 'black-translucent',
    themeColor: INK,
    backgroundColor: '#12161f',
    iconColor: '#c2570c',
    categories: ['business', 'productivity'],
    shortcuts: [],
  },
  seller: {
    id: 'seller',
    name: 'Seller Center',
    shortName: 'Seller Center',
    description: 'Tus ventas, existencias y mermas en consignación, según los accesos que te dio cada empresa.',
    manifestId: '/proveedor/cuenta',
    startUrl: '/proveedor/cuenta',
    scope: '/proveedor/cuenta',
    manifestPath: '/proveedor/cuenta/manifest.webmanifest',
    worker: { url: '/proveedor/cuenta/install-sw.js', productionOnly: false },
    orientation: 'any',
    statusBar: 'default',
    themeColor: INK,
    backgroundColor: '#ffffff',
    iconColor: '#5a3d9a',
    categories: ['business', 'shopping'],
    shortcuts: [],
  },
};

export const APP_LIST: AppDefinition[] = APP_IDS.map((id) => APPS[id]);

/** Rutas públicas de los íconos de una app (los genera `scripts/generate-app-icons.mjs`). */
export function appIconPaths(id: AppId) {
  const base = `/branding/apps/${id}`;
  return {
    any192: `${base}-192.png`,
    any512: `${base}-512.png`,
    maskable512: `${base}-maskable-512.png`,
    apple180: `${base}-180.png`,
  };
}

/** ¿La ruta cae dentro del alcance de la app? (`/bodega` y `/bodega/x` sí; `/bodegas` no). */
export function pathInScope(pathname: string, scope: string): boolean {
  return pathname === scope || pathname.startsWith(`${scope}/`);
}

/** La app a la que pertenece una ruta, o `null` si no es de ninguna (login, landing…). */
export function appForPath(pathname: string): AppDefinition | null {
  return APP_LIST.find((app) => pathInScope(pathname, app.scope)) ?? null;
}
