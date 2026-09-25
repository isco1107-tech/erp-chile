import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Boxes, Landmark, ReceiptText, ShieldCheck } from 'lucide-react';
import AuthSky from './AuthSky';
import LoginVideo from './LoginVideo';

/**
 * Marco compartido de las pantallas de autenticación (login, recuperar
 * contraseña, elegir contraseña nueva, cambio forzado, cuenta suspendida).
 *
 * Misma identidad que el landing (tinta + dorado, mismo titular), para que
 * pasar de la página comercial al login no se sienta como cambiar de
 * producto. El panel de marca va a la izquierda y el formulario a la derecha;
 * el logo grande de Aether va de fondo, centrado en la pantalla
 * (`LogoBackdrop`).
 *
 * Todo el fondo se mueve de forma constante y lenta (cielo de `AuthSky`,
 * auroras y el logo que "respira"). El login usa su propio marco con video
 * (`LoginShell`, más abajo); este queda para recuperar y cambiar contraseña,
 * cuenta suspendida, etc.
 */

const HIGHLIGHTS = [
  { icon: ReceiptText, label: 'Ventas, folios y documentos tributarios' },
  { icon: Boxes, label: 'Inventario multibodega con costo PMP' },
  { icon: Landmark, label: 'Cobranza, flujo de caja y F29' },
  { icon: ShieldCheck, label: 'Permisos por rol y registro de auditoría' },
] as const;

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="auth-shell relative flex min-h-screen">
      <AuthSky />
      <LogoBackdrop />

      {/* Panel de marca */}
      <aside className="relative hidden w-[46%] max-w-[720px] flex-col justify-between overflow-hidden border-r border-white/[0.06] bg-[#10131a]/75 p-12 backdrop-blur-[2px] lg:flex xl:p-16">
        <AuthBackdrop />

        <Link href="/" className="relative z-[2] flex w-fit items-center gap-2.5 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/branding/logo-on-dark.png" alt="" aria-hidden="true" className="size-7 object-contain" />
          <span className="text-2xl font-semibold tracking-tight text-white">
            Aether<span className="ml-1.5 align-middle text-[10px] font-medium text-white/60">ERP</span>
          </span>
        </Link>

        <div className="relative z-[2] max-w-md space-y-8">
          <div className="space-y-5">
            <p className="flex items-center gap-2 text-[11px] font-medium tracking-[0.14em] text-white/60 uppercase">
              <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" /> Hecho para Chile
            </p>
            <h1 className="text-[2.6rem] leading-[1.06] font-medium tracking-[-0.035em] text-balance text-white">
              Menos caos.
              <br />
              Más control.
              <br />
              <span className="text-primary">Mejor negocio.</span>
            </h1>
          </div>
          <ul className="space-y-3">
            {HIGHLIGHTS.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-3 text-sm text-white/80">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-primary">
                  <Icon className="size-4" strokeWidth={1.75} aria-hidden="true" />
                </span>
                {label}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative z-[2] flex items-center justify-between gap-4 text-xs text-white/50">
          <p>© {new Date().getFullYear()} Aether ERP Solutions</p>
          <Link href="/aether/privacidad" className="transition-colors hover:text-white">
            Privacidad
          </Link>
        </div>
      </aside>

      {/* Formulario */}
      <main className="relative z-[2] flex flex-1 flex-col">
        <div className="flex items-center justify-between p-5 lg:justify-end lg:p-8">
          <Link href="/" className="flex items-center gap-2 lg:hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/branding/logo-on-dark.png" alt="" aria-hidden="true" className="size-7 object-contain" />
            <span className="text-lg font-semibold tracking-tight text-foreground">Aether</span>
          </Link>
          <Link
            href="/conoce-aether"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            ¿Aún no usas Aether? <span className="font-medium text-foreground">Conócelo</span>
            <ArrowUpRight className="size-3.5" aria-hidden="true" />
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center px-4 pb-16">{children}</div>
      </main>
    </div>
  );
}

/**
 * Marco del login: el video de Aether (v1 + v2 de la landing) de fondo en su
 * propio panel, a la izquierda en escritorio y arriba en el teléfono, y el
 * formulario en un panel aparte. Así el video nunca pasa por encima de los
 * campos, y la imagen final "AETHER · ERP SOLUTIONS", que queda fija, se ve
 * entera en vez de quedar cortada detrás de la tarjeta.
 */
export function LoginShell({ children }: { children: ReactNode }) {
  const year = new Date().getFullYear();
  return (
    <div className="auth-shell flex min-h-screen flex-col bg-[#10131a] lg:flex-row">
      {/* Video */}
      <section className="relative h-[44vh] min-h-[280px] shrink-0 lg:sticky lg:top-0 lg:h-screen lg:flex-1" aria-label="Aether ERP Solutions">
        <LoginVideo className="absolute inset-0" />
        <Link
          href="/"
          className="absolute top-4 left-4 z-[3] flex items-center gap-2 rounded-full bg-black/40 py-1.5 pr-3.5 pl-2 backdrop-blur-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary lg:top-8 lg:left-8"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/branding/logo-on-dark.png" alt="" aria-hidden="true" className="size-6 object-contain" />
          <span className="text-base font-semibold tracking-tight text-white">
            Aether<span className="ml-1 align-middle text-[9px] font-medium text-white/60">ERP</span>
          </span>
        </Link>
        {/* Bajada de marca sobre un degradé propio: se lee igual sobre el cielo oscuro y sobre la imagen final clara. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] hidden h-[20%] bg-gradient-to-t from-[#070910]/85 to-transparent lg:block" />
        <div className="absolute bottom-8 left-8 z-[3] hidden max-w-[60%] lg:block">
          <p className="text-lg leading-snug font-medium tracking-tight text-white">
            Menos caos. Más control. <span className="text-primary">Mejor negocio.</span>
          </p>
          <p className="mt-1 text-xs text-white/60">Hecho para Chile · © {year} Aether ERP Solutions</p>
        </div>
      </section>

      {/* Formulario */}
      <main className="relative z-[2] flex flex-1 flex-col border-white/[0.06] bg-[#10131a] lg:w-[500px] lg:flex-none lg:border-l xl:w-[560px]">
        <div className="flex items-center justify-end p-5 lg:p-8">
          <Link href="/conoce-aether" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
            ¿Aún no usas Aether? <span className="font-medium text-foreground">Conócelo</span>
            <ArrowUpRight className="size-3.5" aria-hidden="true" />
          </Link>
        </div>
        <div className="flex flex-1 items-start justify-center px-4 pb-10 sm:items-center">{children}</div>
        <div className="flex items-center justify-between gap-4 px-5 pb-6 text-xs text-white/50 lg:px-8">
          <p className="lg:hidden">© {year} Aether ERP Solutions</p>
          <Link href="/aether/privacidad" className="ml-auto transition-colors hover:text-white">
            Privacidad
          </Link>
        </div>
      </main>
    </div>
  );
}

/** Tarjeta del flujo de autenticación. */
export function AuthCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`w-full max-w-[420px] rounded-2xl border border-white/[0.08] bg-card p-8 shadow-[0_32px_80px_-40px_rgba(0,0,0,0.9)] sm:p-9 ${className}`}
    >
      {children}
    </div>
  );
}

/** Encabezado de la tarjeta: icono opcional, título y bajada. */
export function AuthCardHeader({
  icon,
  title,
  description,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
}) {
  return (
    <div className="mb-7">
      {icon && (
        <div className="mb-5 flex size-11 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary">
          {icon}
        </div>
      )}
      <h2 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h2>
      {description && <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{description}</p>}
    </div>
  );
}

/** Mensaje de error del flujo, con el mismo tratamiento en todas las pantallas. */
export function AuthError({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="mb-5 rounded-xl border border-destructive/25 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive"
    >
      {children}
    </div>
  );
}

/**
 * El isotipo de Aether de fondo, centrado en toda la pantalla.
 *
 * `logo-on-dark.png` es `logo.png` con el azul marino recoloreado a blanco
 * (script de un solo uso sobre los canales RGB; la estrella dorada queda
 * intacta) — sobre el fondo oscuro el azul original tenía casi el mismo tono
 * que `--background` y se perdía. Transparencia real, sin caja ni overlay
 * pesado. Va sobre el fondo del panel de marca (z-[1]) y bajo el contenido
 * (z-[2]), para cruzar ambos paneles sin que el `aside` lo tape.
 */
function LogoBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-[1] overflow-hidden select-none">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/branding/logo-on-dark.png"
        alt=""
        className="auth-logo-breathe absolute inset-0 m-auto h-auto w-[min(85vw,1250px)] object-contain opacity-80 lg:w-[min(58vw,1000px)]"
      />
    </div>
  );
}

/**
 * Textura del panel de marca: halo dorado tenue y la constelación del landing.
 * Decorativo, fuera del árbol accesible.
 */
function AuthBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 select-none">
      <div className="auth-aurora-a absolute -top-48 -left-40 size-[36rem] rounded-full bg-primary/[0.09] blur-[120px]" />
      <div className="auth-aurora-b absolute -right-48 bottom-0 size-[30rem] rounded-full bg-[#334d85]/20 blur-[120px]" />
      <div
        className="absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage: 'radial-gradient(rgb(255 255 255 / 0.07) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
          maskImage: 'linear-gradient(180deg, black 0%, transparent 75%)',
        }}
      />
    </div>
  );
}
