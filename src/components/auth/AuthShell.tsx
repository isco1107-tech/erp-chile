import type { ReactNode } from 'react';
import { CreditCard, MessageSquareText, Package, Users } from 'lucide-react';

/**
 * Marco compartido de las pantallas de autenticación (login, recuperar
 * contraseña, elegir contraseña nueva, cambio forzado, cuenta suspendida).
 *
 * Antes solo `/login` tenía el layout de dos paneles con la marca; el resto
 * eran tarjetas sueltas centradas sobre el fondo oscuro. Como todas viven en
 * el mismo flujo — se llega a ellas desde el login o desde un correo — la
 * inconsistencia se leía como "otra aplicación". Este componente centraliza
 * el fondo, el panel de marca y la tarjeta, para que cualquier pantalla del
 * flujo se vea igual con tres líneas.
 */

const HIGHLIGHTS = [
  { icon: Package, label: 'Inventario y ventas en tiempo real' },
  { icon: Users, label: 'Candidatas, staff y equipo en un solo lugar' },
  { icon: CreditCard, label: 'Cuotas, cobros y flujo de caja' },
  { icon: MessageSquareText, label: 'Mensajería interna cifrada' },
] as const;

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen overflow-hidden">
      <AuthBackdrop />

      <div className="relative z-10 flex w-full flex-col lg:flex-row">
        <div className="hidden flex-col justify-between p-12 lg:flex lg:w-1/2 xl:p-16">
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/branding/logo-on-dark.png" alt="" aria-hidden="true" className="size-7 object-contain" />
            <span className="text-sm font-semibold tracking-[0.18em] text-foreground">AETHER ERP</span>
          </div>

          <div className="max-w-md space-y-7">
            <h1 className="text-[2.75rem] leading-[1.08] font-bold tracking-tight text-balance text-foreground">
              Todo tu negocio,
              <br />
              <span className="bg-gradient-to-r from-primary via-cyan-200 to-indigo-300 bg-clip-text text-transparent">
                en un solo panel.
              </span>
            </h1>
            <p className="text-base leading-relaxed text-muted-foreground">
              Ventas, inventario, cobros, candidatas y mensajería interna — sin planillas sueltas ni sistemas que no se
              hablan entre sí.
            </p>
            <ul className="space-y-3.5">
              {HIGHLIGHTS.map(({ icon: Icon, label }) => (
                <li key={label} className="flex items-center gap-3 text-sm text-foreground/90">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
                    <Icon className="size-4" strokeWidth={1.75} />
                  </span>
                  {label}
                </li>
              ))}
            </ul>
          </div>

          <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} Aether ERP Solutions</p>
        </div>

        <div className="flex flex-1 items-center justify-center p-4">{children}</div>
      </div>
    </div>
  );
}

/** Tarjeta de vidrio del flujo de autenticación. */
export function AuthCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`w-full max-w-md rounded-2xl border border-white/10 bg-card/70 p-8 shadow-[0_32px_80px_-40px_rgba(0,0,0,0.95)] backdrop-blur-xl ${className}`}
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
    <div className="mb-6">
      {icon && (
        <div className="mb-5 flex size-11 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
          {icon}
        </div>
      )}
      <h2 className="text-2xl font-bold tracking-tight text-foreground">{title}</h2>
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
 * El isotipo de Aether de fondo más el resplandor de marca.
 *
 * `logo-on-dark.png` es `logo.png` con el azul marino recoloreado a blanco
 * (script de un solo uso sobre los canales RGB; la estrella dorada queda
 * intacta) — sobre el fondo oscuro el azul original tenía casi el mismo tono
 * que `--background` y se perdía. Transparencia real, sin caja ni overlay
 * pesado.
 */
function AuthBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 select-none">
      <div className="absolute -top-40 -left-32 size-[38rem] rounded-full bg-primary/12 blur-[120px]" />
      <div className="absolute -top-24 -right-40 size-[34rem] rounded-full bg-indigo-500/12 blur-[120px]" />

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/branding/logo-on-dark.png"
        alt=""
        className="absolute inset-0 m-auto h-auto w-[min(85vw,1250px)] object-contain opacity-80 lg:w-[min(58vw,1000px)]"
      />
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(ellipse at center, transparent 0%, transparent 60%, var(--background) 96%)' }}
      />
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />
    </div>
  );
}
