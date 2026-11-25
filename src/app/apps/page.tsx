import Link from 'next/link';
import { ArrowDown, ArrowRight, ArrowUpRight, Download, Monitor, Smartphone } from 'lucide-react';
import { APP_CATALOG } from '@/lib/apps/catalog';
import { APPS, appIconPaths, type AppId } from '@/lib/apps/registry';
import { PosDesktopDownload } from '@/components/pos/PosDesktopDownload';
import erpReleases from '../../../public/downloads/releases.json';

export const metadata = {
  title: 'Centro de aplicaciones · Aether',
  description: 'Accede al ERP, Control, POS, Bodega y Seller Center. Encuentra la aplicación y el instalador para tu dispositivo.',
};

const focusClass = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
const primaryLink = `inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-center text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/85 ${focusClass}`;
const secondaryLink = `inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-center text-sm font-medium transition-colors hover:bg-muted ${focusClass}`;

function AppIcon({ app }: { app: AppId }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={appIconPaths(app).any192} alt="" width={56} height={56} className="size-12 shrink-0 rounded-xl sm:size-14 sm:rounded-2xl" />
  );
}

function platformName(platform: string, architecture: string) {
  if (platform === 'windows') return 'Windows';
  if (platform === 'linux') return 'Linux';
  return architecture === 'arm64' ? 'Mac Apple Silicon' : 'Mac Intel';
}

export default function AppsPage() {
  return (
    <div className="theme-saas-light min-h-dvh">
      <a href="#contenido-principal" className="skip-link">Ir al contenido</a>
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex min-h-16 max-w-6xl flex-wrap items-center justify-between gap-x-4 px-3 sm:px-6 lg:px-8">
          <Link href="/" className={`inline-flex min-h-11 items-center rounded-lg text-lg font-semibold tracking-[0.14em] ${focusClass}`} aria-label="Aether, inicio">
            AETHER
          </Link>
          <a href="#descargas" className={`inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-medium text-text-secondary hover:text-foreground ${focusClass}`}>
            <Download className="size-4" aria-hidden="true" />
            Descargas
          </a>
        </div>
      </header>

      <main id="contenido-principal" tabIndex={-1} className="mx-auto max-w-6xl space-y-10 px-3 py-5 outline-none sm:px-6 sm:py-8 lg:space-y-12 lg:px-8">
        <section className="grid items-center gap-6 rounded-2xl bg-brand-ink bg-[radial-gradient(ellipse_at_100%_0%,#343144_0%,transparent_60%)] p-5 text-white sm:rounded-3xl sm:p-9 lg:grid-cols-[1.25fr_0.75fr] lg:gap-12 lg:p-11">
          <div>
            <h1 data-tutorial="module-header" className="max-w-[16ch] text-balance text-3xl font-semibold tracking-tight sm:text-5xl">Centro de aplicaciones</h1>
            <p className="mt-3 max-w-md text-pretty text-sm leading-relaxed text-white/75 sm:text-base">
              Accede al ERP de tu empresa o abre la aplicación que usas para trabajar.
            </p>
            <a href="#aplicaciones" className={`mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-semibold text-brand-gold hover:underline sm:mt-5 ${focusClass}`}>
              Ver aplicaciones <ArrowDown className="size-4" aria-hidden="true" />
            </a>
          </div>

          <article className="min-w-0 rounded-2xl border border-white/15 bg-white/[0.07] p-4 backdrop-blur-sm sm:p-5">
            <div className="flex items-center gap-3">
              <AppIcon app="erp" />
              <div className="min-w-0">
                <h2 className="text-lg font-semibold sm:text-xl">Aether ERP</h2>
                <p className="mt-0.5 text-sm leading-snug text-white/75">Ventas, inventario y administración</p>
              </div>
            </div>
            <Link href={APPS.erp.startUrl} className={`mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-gold px-4 py-2 text-sm font-semibold text-brand-ink transition-colors hover:bg-[#efd794] ${focusClass}`}>
              Abrir ERP <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </article>
        </section>

        <section id="aplicaciones" aria-labelledby="aplicaciones-titulo">
          <h2 id="aplicaciones-titulo" className="text-2xl font-semibold tracking-tight sm:text-3xl">Aplicaciones por equipo</h2>
          <div className="mt-4 grid gap-3 sm:mt-5 sm:grid-cols-2 sm:gap-4">
            {APP_CATALOG.map((app) => (
              <article key={app.id} id={app.id === 'pos' ? 'pos' : undefined} className="flex min-w-0 flex-col rounded-2xl border border-border bg-card p-4 shadow-card sm:p-6">
                <div className="flex items-center gap-3 sm:gap-4">
                  <AppIcon app={app.id} />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-muted-foreground sm:text-sm">{app.audience}</p>
                    <h3 className="mt-0.5 text-lg font-semibold tracking-tight sm:text-xl">{app.name}</h3>
                  </div>
                </div>
                <p className="mt-3 flex-1 text-sm leading-relaxed text-text-secondary">{app.description}</p>
                <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                  <Smartphone className="size-4 shrink-0" aria-hidden="true" />{app.devices}
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Link href={APPS[app.id].startUrl} className={primaryLink}>
                    {app.action} <ArrowUpRight className="size-4 shrink-0" aria-hidden="true" />
                  </Link>
                  {app.id === 'pos' && <PosDesktopDownload className="min-h-11 px-4 text-sm" />}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section id="descargas" aria-labelledby="descargas-titulo" className="grid gap-5 rounded-2xl border border-border bg-card p-4 sm:p-6 md:grid-cols-[1fr_0.7fr] lg:p-8">
          <div>
            <h2 id="descargas-titulo" className="flex items-center gap-2 text-xl font-semibold tracking-tight sm:text-2xl">
              <Monitor className="size-5 shrink-0" aria-hidden="true" /> Aether ERP para escritorio
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">Elige el instalador que corresponde a tu computador.</p>
            <ul className="mt-4 flex flex-wrap gap-2">
              {erpReleases.map((release) => (
                <li key={release.file}>
                  <a download href={`/downloads/${release.file}`} className={secondaryLink}>
                    <Download className="size-4 shrink-0" aria-hidden="true" />
                    {platformName(release.platform, release.architecture)}
                  </a>
                </li>
              ))}
            </ul>
            <a href="#pos" className={`mt-2 inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-medium text-text-secondary underline underline-offset-4 hover:text-foreground ${focusClass}`}>
              Ir a las descargas de POS <ArrowUpRight className="size-4" aria-hidden="true" />
            </a>
          </div>
          <div className="border-t border-border pt-4 md:border-t-0 md:border-l md:pt-0 md:pl-6">
            <h3 className="flex items-center gap-2 text-base font-semibold">
              <Smartphone className="size-5 shrink-0" aria-hidden="true" /> Instalación en celular o tablet
            </h3>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
              Abre Control, POS, Bodega o Seller Center en tu navegador. Busca «Instalar» en la aplicación para ver los pasos de Android o de iPhone y iPad.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
