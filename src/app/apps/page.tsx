import Link from 'next/link';
import { ArrowUpRight, LayoutGrid, Monitor, ShieldCheck } from 'lucide-react';
import { APP_CATALOG } from '@/lib/apps/catalog';
import { appIconPaths } from '@/lib/apps/registry';
import { PosDesktopDownload } from '@/components/pos/PosDesktopDownload';
import erpReleases from '../../../public/downloads/releases.json';
export const metadata = {
  title: 'Centro de aplicaciones · Aether',
  description:
    'Aplicaciones Aether para dirección, ventas, bodega y proveedores.',
};
export default function AppsPage() {
  return (
    <main className="theme-saas-light min-h-dvh bg-background px-4 py-8 text-foreground sm:px-8">
      <div className="mx-auto max-w-6xl space-y-10">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <Link href="/" className="font-bold tracking-wide">
            AETHER
          </Link>
          <Link
            href="/login"
            className="rounded-full border bg-card px-5 py-3 text-sm font-medium"
          >
            Ingresar al ERP
          </Link>
        </header>
        <section className="max-w-3xl py-6">
          <p className="mb-4 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <LayoutGrid className="size-4" /> CENTRO DE APLICACIONES
          </p>
          <h1
            data-tutorial="module-header"
            className="text-4xl font-semibold tracking-tight sm:text-6xl"
          >
            Tu equipo, conectado.
            <br />
            Cada tarea en su lugar.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            Una empresa, los mismos datos. Elige la app para tu trabajo,
            instálala y entra con tu propia cuenta.
          </p>
        </section>
        <section
          className="grid gap-5 md:grid-cols-2"
          aria-label="Aplicaciones disponibles"
        >
          {APP_CATALOG.map((app) => (
            <article
              key={app.id}
              className="flex min-w-0 flex-col rounded-3xl border bg-card p-6 shadow-card sm:p-8"
            >
              <div className="flex items-center gap-4">
                {/* El ícono real que quedará en la pantalla de inicio: cada app tiene el suyo. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={appIconPaths(app.id).any192}
                  alt=""
                  width={64}
                  height={64}
                  className="size-16 shrink-0 rounded-2xl shadow-card"
                />
                <div className="min-w-0">
                  <p className="text-xs font-semibold tracking-widest text-muted-foreground">
                    {app.eyebrow}
                  </p>
                  <h2 className="mt-1 text-2xl font-semibold [overflow-wrap:anywhere]">
                    {app.name}
                  </h2>
                </div>
              </div>
              <p className="mt-3 flex-1 text-muted-foreground">
                {app.description}
              </p>
              <ul className="my-5 flex flex-wrap gap-2">
                {app.features.map((feature) => (
                  <li
                    key={feature}
                    className="rounded-full bg-muted px-3 py-1 text-xs"
                  >
                    {feature}
                  </li>
                ))}
              </ul>
              <p className="mb-4 text-sm text-muted-foreground">{app.format}</p>
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href={app.href}
                  className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-primary px-5 py-3 font-medium text-primary-foreground"
                >
                  {app.id === 'pos' ? 'Abrir POS' : 'Abrir e instalar'}
                  <ArrowUpRight className="size-4" />
                </Link>
                {app.id === 'pos' && <PosDesktopDownload />}
              </div>
            </article>
          ))}
        </section>
        <section className="rounded-3xl border bg-card p-6 sm:p-8">
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <Monitor className="size-5" /> Aether ERP para escritorio
          </h2>
          <p className="mt-2 text-muted-foreground">
            El panel completo para administración y trabajo de oficina.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            {erpReleases.map((release) => (
              <a
                key={release.file}
                download
                href={`/downloads/${release.file}`}
                className="rounded-xl border px-4 py-3 text-sm font-medium"
              >
                Descargar{' '}
                {release.platform === 'windows'
                  ? 'Windows'
                  : release.platform === 'linux'
                    ? 'Linux'
                    : `Mac ${release.architecture === 'arm64' ? 'Apple Silicon' : 'Intel'}`}
              </a>
            ))}
          </div>
        </section>
        <footer className="flex gap-3 border-t pt-6 text-sm text-muted-foreground">
          <ShieldCheck className="size-5 shrink-0" />
          <p>
            Cada app se instala por separado y tiene su propio ícono: instalar
            una no hace pasar por instalada a otra. Instalar una app no amplía
            permisos ni módulos contratados. Bodega
            conserva envíos pendientes; POS, Control y portales necesitan
            conexión para confirmar o consultar datos.
          </p>
        </footer>
      </div>
    </main>
  );
}
