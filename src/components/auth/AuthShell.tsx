import type { ReactNode } from 'react';
import { CreditCard, MessageSquareText, Package, Users, Orbit, ArrowUpRight } from 'lucide-react';
import { WorkspaceTheme } from '@/components/shared/WorkspaceTheme';

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
    <WorkspaceTheme>
    <div className="theme-saas-light aether-auth relative flex min-h-screen overflow-hidden">

      <div className="relative z-10 flex w-full flex-col lg:flex-row">
        <div className="relative hidden overflow-hidden bg-[#203a31] p-12 text-[#f5f6ee] lg:flex lg:w-[52%] lg:flex-col lg:justify-between xl:p-16">
          <AuthBackdrop />
          <div className="relative z-1 flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/branding/logo-on-dark.png" alt="" aria-hidden="true" className="size-10 object-contain" />
            <span className="text-base font-semibold tracking-[0.22em]">AETHER<span className="ml-2 text-xs font-normal tracking-normal text-[#b5c3bf]">ERP</span></span>
          </div>

          <div className="relative z-1 my-16 max-w-lg space-y-7">
            <p className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.22em] text-[#d7e9b4]"><Orbit className="size-4" /> Un universo de posibilidades</p>
            <h1 className="text-[clamp(2.75rem,4.5vw,4.5rem)] leading-[1.04] font-medium tracking-[-0.055em] text-balance">
              Tu negocio.
              <br />
              <span className="text-[#d7e9b4]">
                Una nueva perspectiva.
              </span>
            </h1>
            <p className="max-w-sm text-base leading-relaxed text-[#b5c3bf]">
              Conecta tu operación. Encuentra claridad en tus números. Haz espacio para lo que viene.
            </p>
            <ul className="space-y-3.5 border-t border-white/15 pt-7">
              {HIGHLIGHTS.map(({ icon: Icon, label }) => (
                <li key={label} className="flex items-center gap-3 text-sm text-[#e4e9df]">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-white/15 text-[#d7e9b4]">
                    <Icon className="size-4" strokeWidth={1.75} />
                  </span>
                  {label}
                </li>
              ))}
            </ul>
          </div>

          <div className="relative z-1 flex items-center justify-between text-[11px] text-[#b5c3bf]"><span>© {new Date().getFullYear()} Aether ERP Solutions</span><ArrowUpRight className="size-5" aria-hidden /></div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col items-center justify-center px-5 py-12 sm:px-10">
          <div className="mb-10 flex items-center gap-2 text-sm font-semibold tracking-[0.2em] text-foreground lg:hidden"><Orbit className="size-6 text-primary" /> AETHER ERP</div>
          {children}
          <p className="mt-8 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">Conecta · Gestiona · Crece</p>
        </div>
      </div>
    </div>
    </WorkspaceTheme>
  );
}

/** Superficie del flujo de autenticación. */
export function AuthCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-[0_16px_64px_-32px_rgba(35,59,52,0.2)] sm:p-9 ${className}`}
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
      <h2 className="text-2xl font-semibold tracking-[-0.04em] text-foreground">{title}</h2>
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

/** Órbitas decorativas compartidas con el centro de operaciones. */
function AuthBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 select-none">
      <div className="aether-orbits !-right-64 !-top-28 !size-[680px] opacity-60"><i /><i /><i /><span /></div>
      <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-[#192e28] to-transparent" />
    </div>
  );
}
