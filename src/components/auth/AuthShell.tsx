import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Boxes, Landmark, ReceiptText, ShieldCheck } from 'lucide-react';

/**
 * Marco compartido de las pantallas de autenticación (login, recuperar
 * contraseña, elegir contraseña nueva, cambio forzado, cuenta suspendida).
 *
 * Misma identidad que el landing (tinta + dorado, mismo titular), para que
 * pasar de la página comercial al login no se sienta como cambiar de
 * producto. El panel de marca va a la izquierda y el formulario sobre una
 * superficie limpia a la derecha: el logo ya no se dibuja detrás del
 * formulario (competía con los campos).
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
      {/* Panel de marca */}
      <aside className="relative hidden w-[46%] max-w-[720px] flex-col justify-between overflow-hidden border-r border-white/[0.06] bg-[#10131a] p-12 lg:flex xl:p-16">
        <AuthBackdrop />

        <Link href="/" className="relative flex w-fit items-center gap-2.5 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/branding/aether-icon.png" alt="" aria-hidden="true" className="h-8 w-7 object-contain" />
          <span className="text-2xl font-semibold tracking-tight text-white">
            aether<span className="ml-1.5 align-middle text-[10px] font-medium text-white/60">ERP</span>
          </span>
        </Link>

        <div className="relative max-w-md space-y-8">
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

        <div className="relative flex items-center justify-between gap-4 text-xs text-white/50">
          <p>© {new Date().getFullYear()} Aether ERP Solutions</p>
          <Link href="/aether/privacidad" className="transition-colors hover:text-white">
            Privacidad
          </Link>
        </div>
      </aside>

      {/* Formulario */}
      <main className="relative flex flex-1 flex-col">
        <div className="flex items-center justify-between p-5 lg:justify-end lg:p-8">
          <Link href="/" className="flex items-center gap-2 lg:hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/branding/aether-icon.png" alt="" aria-hidden="true" className="h-7 w-6 object-contain" />
            <span className="text-lg font-semibold tracking-tight text-foreground">aether</span>
          </Link>
          <Link
            href="/#cotizar"
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
 * Textura del panel de marca: halo dorado tenue, la constelación del landing y
 * el isotipo muy atenuado en la esquina. Decorativo, fuera del árbol accesible.
 */
function AuthBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 select-none">
      <div className="absolute -top-48 -left-40 size-[36rem] rounded-full bg-primary/[0.09] blur-[120px]" />
      <div className="absolute -right-48 bottom-0 size-[30rem] rounded-full bg-[#334d85]/20 blur-[120px]" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/branding/logo-on-dark.png"
        alt=""
        className="absolute -right-24 -bottom-16 w-[560px] max-w-none object-contain opacity-[0.07]"
      />
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
