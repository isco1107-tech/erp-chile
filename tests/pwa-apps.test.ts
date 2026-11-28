import fs from 'node:fs';
import path from 'node:path';
import { PLATFORM_FAVICON, buildAppManifest, platformIcons } from '@/lib/apps/manifest';
import { installWorkerSource } from '@/lib/apps/install-worker';
import { APP_IDS, APP_LIST, APPS, appForPath, appIconPaths, pathInScope } from '@/lib/apps/registry';

const publicDir = path.join(__dirname, '..', 'public');
const read = (url: string) => fs.readFileSync(path.join(publicDir, url));

describe('apps instalables: cada una es independiente', () => {
  it('cada app tiene identidad, nombre y alcance propios', () => {
    for (const key of ['manifestId', 'scope', 'name', 'shortName', 'manifestPath', 'startUrl'] as const) {
      const values = APP_LIST.map((app) => app[key]);
      expect(new Set(values).size).toBe(values.length);
    }
  });

  it('ningún alcance contiene a otro (si no, el navegador da por instalada una app con tener la otra)', () => {
    for (const a of APP_LIST) {
      for (const b of APP_LIST) {
        if (a.id === b.id) continue;
        expect(pathInScope(b.scope, a.scope)).toBe(false);
        expect(pathInScope(b.startUrl, a.scope)).toBe(false);
      }
    }
  });

  it('el ERP no abarca la raíz del sitio', () => {
    expect(APPS.erp.scope).not.toBe('/');
    expect(buildAppManifest('erp').scope).toBe('/dashboard');
  });

  it('la dirección de inicio está dentro del alcance y el `id` es la ruta de la app', () => {
    for (const app of APP_LIST) {
      expect(pathInScope(app.startUrl.split(/[?#]/)[0], app.scope)).toBe(true);
      expect(app.manifestId).toBe(app.scope);
      for (const shortcut of app.shortcuts) expect(pathInScope(shortcut.url.split(/[?#]/)[0], app.scope)).toBe(true);
    }
  });

  it('pathInScope no confunde rutas con el mismo prefijo', () => {
    expect(pathInScope('/bodega', '/bodega')).toBe(true);
    expect(pathInScope('/bodega/ingresar', '/bodega')).toBe(true);
    expect(pathInScope('/bodegas', '/bodega')).toBe(false);
    expect(appForPath('/proveedor/cuenta/ingresar')?.id).toBe('seller');
    expect(appForPath('/proveedor/ABCD')).toBeNull();
    expect(appForPath('/login')).toBeNull();
  });

  it('cada app tiene sus íconos, del tamaño declarado, y no comparte ninguno con otra', () => {
    const seen = new Map<string, string>();
    for (const id of APP_IDS) {
      const icons = appIconPaths(id);
      const sizes: Record<string, number> = { any192: 192, any512: 512, maskable512: 512, apple180: 180 };
      for (const [kind, url] of Object.entries(icons)) {
        const file = read(url);
        // PNG: firma de 8 bytes y, en el bloque IHDR, ancho y alto.
        expect(file.subarray(1, 4).toString()).toBe('PNG');
        expect(file.readUInt32BE(16)).toBe(sizes[kind]);
        expect(file.readUInt32BE(20)).toBe(sizes[kind]);
        const previous = seen.get(file.toString('base64'));
        expect(previous).toBeUndefined();
        seen.set(file.toString('base64'), url);
      }
    }
  });

  it('el manifest separa los íconos «any» y «maskable» y apunta a archivos que existen', () => {
    for (const id of APP_IDS) {
      const manifest = buildAppManifest(id);
      expect(manifest.icons.some((icon) => icon.purpose === 'maskable')).toBe(true);
      expect(manifest.icons.some((icon) => icon.purpose === 'any' && icon.sizes === '512x512')).toBe(true);
      for (const icon of manifest.icons) {
        expect(icon.purpose).not.toContain(' ');
        expect(fs.existsSync(path.join(publicDir, icon.src))).toBe(true);
      }
    }
  });

  it('related_applications usa la dirección absoluta del manifest de la propia app', () => {
    const manifest = buildAppManifest('bodega', 'https://aether.example');
    expect(manifest.related_applications).toEqual([
      { platform: 'webapp', url: 'https://aether.example/bodega/manifest.webmanifest' },
    ]);
    expect(manifest.prefer_related_applications).toBe(false);
    expect('related_applications' in buildAppManifest('bodega')).toBe(false);
  });

  it('el nombre bajo el ícono cabe en la pantalla de inicio', () => {
    for (const app of APP_LIST) expect(app.shortName.length).toBeLessThanOrEqual(13);
  });

  it('el service worker de instalación no guarda nada y solo responde a navegaciones', () => {
    for (const id of ['control', 'pos', 'seller'] as const) {
      const source = installWorkerSource(id);
      expect(source).not.toMatch(/caches\.|cache\.put|\.addAll/);
      expect(source).toContain("event.request.mode !== 'navigate'");
      expect(source).toContain(APPS[id].name);
      // Es JavaScript válido.
      expect(() => new Function(source)).not.toThrow();
    }
  });

  it('el logo de la pestaña (favicon) es SIEMPRE el de Aether: el layout raíz declara `icon` y los archivos existen', () => {
    // Regresión: el layout raíz declaraba solo `icons.apple`, y Next ignora `src/app/icon.png` cuando el
    // mismo segmento exporta `metadata.icons`; la pestaña del panel quedaba con el globo del navegador.
    const layout = fs.readFileSync(path.join(__dirname, '..', 'src', 'app', 'layout.tsx'), 'utf8');
    expect(layout).toMatch(/icons:\s*platformIcons\(\)/);

    const icons = platformIcons();
    expect(icons.icon.length).toBeGreaterThan(0);
    expect(icons.apple[0].url).toBe(appIconPaths('erp').apple180);
    for (const icon of icons.icon) {
      expect(icon.url.startsWith('/')).toBe(true);
    }

    // El PNG de pestaña es un PNG de 192 × 192, existe en `public` y es el mismo dibujo que `src/app/icon.png`.
    const png = read(PLATFORM_FAVICON.png192);
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    expect(png.readUInt32BE(16)).toBe(192);
    expect(png.readUInt32BE(20)).toBe(192);
    expect(png.equals(fs.readFileSync(path.join(__dirname, '..', 'src', 'app', 'icon.png')))).toBe(true);

    // `favicon.ico` va en `public/` y NO en `src/app/`: Next antepone el de `src/app` a los íconos de
    // toda página y pisaría el logo propio de los certámenes y sitios web de clientes.
    expect(fs.existsSync(path.join(__dirname, '..', 'src', 'app', 'favicon.ico'))).toBe(false);
    // Cabecera ICO con las tres medidas de pestaña.
    const ico = read(PLATFORM_FAVICON.ico);
    expect(ico.readUInt16LE(0)).toBe(0); // reservado
    expect(ico.readUInt16LE(2)).toBe(1); // tipo: ícono
    const count = ico.readUInt16LE(4);
    const widths = Array.from({ length: count }, (_, i) => ico[6 + i * 16] || 256).sort((a, b) => a - b);
    expect(widths).toEqual([16, 32, 48]);
  });

  it('los archivos del logo de la pestaña los deja pasar la proxy sin sesión (login incluido)', () => {
    const proxy = fs.readFileSync(path.join(__dirname, '..', 'src', 'proxy.ts'), 'utf8');
    // `/favicon.ico` está en la lista pública y fuera del matcher; `/branding` es público.
    expect(proxy).toContain("'/favicon.ico'");
    expect(proxy).toContain("'/branding'");
    expect(PLATFORM_FAVICON.png192.startsWith('/branding/')).toBe(true);
  });

  it('cada ruta de manifest y service worker de las apps existe y la proxy la deja pasar sin sesión', () => {
    const proxy = fs.readFileSync(path.join(__dirname, '..', 'src', 'proxy.ts'), 'utf8');
    for (const app of APP_LIST) {
      const route = path.join(__dirname, '..', 'src', 'app', app.manifestPath, 'route.ts');
      expect(fs.existsSync(route)).toBe(true);
      if (app.id === 'erp') continue;
      // `/control` y `/proveedor` se resuelven por su propia regla; Bodega y POS están en la lista pública.
      const covered = [app.manifestPath, app.worker.url].every(
        (url) => proxy.includes(`'${url}'`) || url.startsWith('/proveedor') || url.startsWith('/control'),
      );
      expect(covered).toBe(true);
    }
  });
});
