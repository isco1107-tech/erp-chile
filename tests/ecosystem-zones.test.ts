// aetherp.online/epione y /hermes se reenvían a su propio despliegue y no
// heredan la CSP ni el acceso del ERP.
import { config as proxyConfig } from '@/proxy';

jest.mock('jose', () => ({ jwtVerify: jest.fn(), SignJWT: jest.fn() }));

// El mismo compilador de rutas que usa Next para `source` y `matcher`.
const { pathToRegexp } = require('next/dist/compiled/path-to-regexp') as {
  pathToRegexp: (path: string, keys: unknown[]) => RegExp;
};

type Rewrite = { source: string; destination: string };
type HeaderRule = { source: string; headers: { key: string; value: string }[] };

function loadConfig(env: Record<string, string | undefined>) {
  const saved = { EPIONE_ORIGIN: process.env.EPIONE_ORIGIN, HERMES_ORIGIN: process.env.HERMES_ORIGIN };
  Object.assign(process.env, env);
  for (const [key, value] of Object.entries(env)) if (value === undefined) delete process.env[key];
  let config: { rewrites: () => Promise<{ beforeFiles: Rewrite[] }>; headers: () => Promise<HeaderRule[]> };
  jest.isolateModules(() => {
    config = require('../next.config.js');
  });
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return config!;
}

describe('zonas del ecosistema (/epione, /hermes)', () => {
  test('Epione se reenvía con la ruta completa; Hermes solo si tiene despliegue', async () => {
    const { beforeFiles } = await loadConfig({ EPIONE_ORIGIN: undefined, HERMES_ORIGIN: undefined }).rewrites();
    expect(beforeFiles).toEqual([
      { source: '/epione', destination: 'https://agendasalud-plataforma-web-patient.vercel.app/epione' },
      { source: '/epione/:path*', destination: 'https://agendasalud-plataforma-web-patient.vercel.app/epione/:path*' },
    ]);

    const withHermes = await loadConfig({ EPIONE_ORIGIN: 'https://e.example/', HERMES_ORIGIN: 'https://h.example' }).rewrites();
    expect(withHermes.beforeFiles.map((r) => r.destination)).toEqual([
      'https://e.example/epione',
      'https://e.example/epione/:path*',
      'https://h.example/hermes',
      'https://h.example/hermes/:path*',
    ]);
  });

  test('la CSP global del ERP no se aplica a las zonas del ecosistema', async () => {
    const rules = await loadConfig({}).headers();
    const global = rules.find((rule) => rule.headers.some((h) => h.key === 'Content-Security-Policy') && rule.source !== '/web/:slug/raw');
    const re = pathToRegexp(global!.source, []);
    for (const path of ['/', '/login', '/dashboard', '/epionex']) expect(re.test(path)).toBe(true);
    for (const path of ['/epione', '/epione/clinica/', '/hermes', '/hermes/admin/']) expect(re.test(path)).toBe(false);
  });

  test('el proxy del ERP (sesión, dominios propios) no intercepta las zonas', () => {
    const re = pathToRegexp(proxyConfig.matcher[0]!, []);
    expect(re.test('/dashboard')).toBe(true);
    expect(re.test('/epione/ingresar')).toBe(false);
    expect(re.test('/hermes')).toBe(false);
  });
});
