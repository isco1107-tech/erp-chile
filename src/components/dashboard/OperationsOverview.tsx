import Link from 'next/link';
import { ArrowDownRight, ArrowUpRight, CalendarDays, Orbit } from 'lucide-react';

interface OperationsOverviewProps {
  greeting: string;
  companyName: string;
  date: string;
  moduleCount: number;
  alertCount: number;
  action?: { href: string; label: string };
}

/** Resumen del contexto real del usuario. Las órbitas son una firma visual, no un gráfico. */
export function OperationsOverview({ greeting, companyName, date, moduleCount, alertCount, action }: OperationsOverviewProps) {
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-sm text-muted-foreground">{greeting}</p>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Centro de operaciones</h1>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-3.5 py-2 text-xs text-text-secondary">
          <CalendarDays className="size-3.5" aria-hidden />
          {date}
        </span>
      </div>

      <section className="aether-overview" aria-label="Resumen de tu operación">
        <div className="aether-orbits" aria-hidden="true"><i /><i /><i /><span /></div>
        <div className="relative z-1 flex flex-col justify-between gap-7">
          <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#cfdfc7]">
            <Orbit className="size-4" aria-hidden /> Aether / Visión general
          </p>
          <div>
            <h2 className="text-3xl font-medium leading-[1.08] tracking-[-0.045em] sm:text-[42px]">Todo conectado.<br /><span className="text-[#d7e9b4]">Tú al mando.</span></h2>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-[#b5c3bf]">La perspectiva de {companyName}, desde los números hasta tu próxima decisión.</p>
          </div>
          {action && (
            <Link href={action.href} className="inline-flex w-fit items-center gap-5 rounded-full bg-[#d7e9b4] px-5 py-2.5 text-sm font-semibold text-[#182d27] transition-colors hover:bg-[#e7f4ce]">
              {action.label}<ArrowUpRight className="size-4" aria-hidden />
            </Link>
          )}
        </div>
        <div className="aether-overview-status relative z-1">
          <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-[#b5c3bf]">Tu espacio de trabajo</span>
          <div className="mt-5 flex items-baseline gap-3">
            <span className="text-5xl font-light tracking-tighter tabular-nums">{String(moduleCount).padStart(2, '0')}</span>
            <span className="text-xs text-[#b5c3bf]">módulos contratados</span>
          </div>
          <div className="mt-5 border-t border-white/15 pt-4">
            {alertCount > 0 ? (
              <a href="#operational-priorities" className="flex items-center justify-between gap-3 text-sm text-[#e8d5ad] hover:underline">
                <span>{alertCount} {alertCount === 1 ? 'área requiere' : 'áreas requieren'} atención</span><ArrowDownRight className="size-4 shrink-0" aria-hidden />
              </a>
            ) : (
              <p className="flex items-center gap-2 text-xs text-[#d7e9b4]"><span className="size-1.5 rounded-full bg-current" />Sin alertas en los módulos revisados</p>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
