import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  CircleDollarSign,
  Crown,
  Gavel,
  Gift,
  Globe,
  Handshake,
  ListVideo,
  Target,
  Ticket,
  TrendingDown,
  TrendingUp,
  Vote,
  type LucideIcon,
} from 'lucide-react';
import { getPageantHubAction } from '@/modules/projects/actions/projects.actions';
import { PROJECT_STATUS_LABELS } from '@/modules/projects/schema';
import { formatCurrency } from '@/lib/chile/tax';
import { READINESS_AREA_LABELS, type ReadinessArea, type ReadinessStatus } from '@/lib/events/readiness';
import { buttonVariants } from '@/components/ui/button';
import { KpiCard } from '@/components/ui/KpiCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { can, getAuthContext } from '@/lib/auth/guards';
import type { Tone } from '@/components/ui/tone';
import type { ProjectStatus } from '@prisma/client';
import DeleteProjectButton from '@/components/projects/DeleteProjectButton';
import { ProjectFinanceCharts } from '@/components/projects/ProjectFinanceCharts';
import { PublicLinkRow } from '@/components/projects/PublicLinkRow';
import { SPONSORSHIP_TIER_LABELS } from '@/modules/sponsorships/schema';
import { cn } from '@/lib/utils';

export const metadata = { title: 'Centro de mando del certamen' };

const STATUS_TONE: Record<ProjectStatus, Tone> = {
  PLANNING: 'neutral',
  IN_PROGRESS: 'info',
  COMPLETED: 'success',
  CANCELLED: 'danger',
};

const READINESS_ICON: Record<ReadinessStatus, { icon: LucideIcon; className: string; label: string }> = {
  ok: { icon: CheckCircle2, className: 'text-success', label: 'Listo' },
  warn: { icon: AlertTriangle, className: 'text-warning', label: 'Revisar' },
  todo: { icon: CircleDashed, className: 'text-danger', label: 'Pendiente' },
};

const dateFmt = (d: Date) => d.toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Santiago' });

function ModuleCard({ title, icon: Icon, href, children }: { title: string; icon: LucideIcon; href: string; children: ReactNode }) {
  return (
    <section className="flex flex-col rounded-lg border border-border bg-card p-5 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
          {title}
        </h3>
        <Link href={href} className="text-xs text-primary hover:underline">
          Abrir
        </Link>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">{children}</dl>
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: 'danger' | 'warning' | 'success' }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn('font-semibold tabular-nums text-foreground', tone === 'danger' && 'text-danger', tone === 'warning' && 'text-warning', tone === 'success' && 'text-success')}>{value}</dd>
    </div>
  );
}

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [result, context] = await Promise.all([getPageantHubAction(id), getAuthContext()]);
  if (!result.success) notFound();

  const hub = result.data;
  const { project, finance: summary, readiness } = hub;
  const canWrite = can(context, 'projects:write');
  const marginTone: Tone = summary.marginAmount >= 0 ? 'success' : 'danger';
  const areas = [...new Set(readiness.items.map((i) => i.area))] as ReadinessArea[];
  const days = readiness.daysToGala;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/dashboard/projects" className={buttonVariants({ variant: 'outline' })}>
          ← Volver a certámenes
        </Link>
        {canWrite && (
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/dashboard/projects/${project.id}/site`} className={buttonVariants({ variant: 'outline' })}>
              <Globe aria-hidden="true" />
              Sitio público
            </Link>
            <Link href={`/dashboard/projects/${project.id}/edit`} className={buttonVariants({ variant: 'default' })}>
              Editar certamen
            </Link>
            <DeleteProjectButton projectId={project.id} projectName={project.name} />
          </div>
        )}
      </div>

      <section className="relative overflow-hidden rounded-xl border border-border bg-foreground text-background shadow-card">
        {project.coverImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={project.coverImageUrl} alt="" className="absolute inset-0 size-full object-cover opacity-30" aria-hidden="true" />
        )}
        <div className="relative flex flex-wrap items-end justify-between gap-6 p-6 sm:p-8">
          <div className="max-w-2xl">
            <p className="font-mono text-xs text-background/70">{project.code}</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl" data-tutorial="module-header">
              {project.name}
            </h1>
            <p className="mt-2 text-sm text-background/75">
              {dateFmt(project.startDate)}
              {project.endDate ? ` — ${dateFmt(project.endDate)}` : ''}
              {project.venueName && ` · ${project.venueName}`}
            </p>
            <div className="mt-3">
              <StatusBadge tone={STATUS_TONE[project.status]}>{PROJECT_STATUS_LABELS[project.status]}</StatusBadge>
            </div>
          </div>
          <div className="text-right">
            {project.galaDate ? (
              <>
                <p className="text-xs tracking-[0.2em] text-background/70 uppercase">Gala final</p>
                <p className="text-5xl font-bold tabular-nums text-chart-1">{days !== null && days >= 0 ? days : '✓'}</p>
                <p className="text-sm text-background/75">{days !== null && days > 0 ? `día${days === 1 ? '' : 's'} para la gala` : days === 0 ? 'La gala es hoy' : 'Gala realizada'}</p>
                <p className="mt-1 text-xs text-background/60">
                  {project.galaDate.toLocaleString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago' })}
                </p>
              </>
            ) : (
              canWrite && (
                <Link href={`/dashboard/projects/${project.id}/edit`} className="text-sm text-chart-1 underline">
                  Definir fecha de la gala
                </Link>
              )
            )}
          </div>
        </div>
      </section>

      {readiness.critical.length > 0 && (
        <div className="rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
          <p className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="size-4" aria-hidden="true" />
            Quedan {readiness.critical.length} pendiente(s) crítico(s) a {days} día(s) de la gala
          </p>
          <ul className="mt-1 list-inside list-disc">
            {readiness.critical.map((item) => (
              <li key={item.id}>
                <Link href={item.href} className="underline">
                  {item.label}
                </Link>
                : {item.detail}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_2fr]">
        <section className="rounded-lg border border-border bg-card p-5 shadow-card" aria-labelledby="readiness-title">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 id="readiness-title" className="text-base font-semibold text-foreground">
                ¿Listos para la gala?
              </h2>
              <p className="text-xs text-muted-foreground">Checklist calculado con los datos reales de cada módulo</p>
            </div>
            <p className="text-3xl font-bold tabular-nums">{readiness.score}%</p>
          </div>
          <div className="mt-3 h-2 rounded-full bg-muted" aria-hidden="true">
            <div className={cn('h-2 rounded-full', readiness.score >= 85 ? 'bg-success' : readiness.score >= 50 ? 'bg-warning' : 'bg-danger')} style={{ width: `${readiness.score}%` }} />
          </div>
          <div className="mt-4 space-y-4">
            {areas.map((area) => (
              <div key={area}>
                <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{READINESS_AREA_LABELS[area]}</p>
                <ul className="mt-1.5 space-y-1.5">
                  {readiness.items
                    .filter((item) => item.area === area)
                    .map((item) => {
                      const meta = READINESS_ICON[item.status];
                      return (
                        <li key={item.id}>
                          <Link href={item.href} className="flex items-start gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-muted/60">
                            <meta.icon className={cn('mt-0.5 size-4 shrink-0', meta.className)} aria-label={meta.label} />
                            <span className="min-w-0">
                              <span className="block text-foreground">{item.label}</span>
                              <span className="block text-xs text-muted-foreground">{item.detail}</span>
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <div className="grid grid-cols-1 content-start gap-5 md:grid-cols-2">
          {hub.candidates && (
            <ModuleCard title="Candidatas" icon={Crown} href="/dashboard/candidates/casting">
              <Stat label="Oficiales" value={hub.candidates.official} />
              <Stat label="Por revisar" value={hub.candidates.toReview} tone={hub.candidates.toReview > 0 ? 'warning' : undefined} />
              <Stat label="Contratos firmados" value={`${hub.candidates.contractsSigned}/${hub.candidates.official}`} tone={hub.candidates.contractsSigned < hub.candidates.official ? 'warning' : 'success'} />
              <Stat label="Numeradas" value={`${hub.candidates.numbered}/${hub.candidates.official}`} />
            </ModuleCard>
          )}
          {hub.sponsorships && (
            <ModuleCard title="Auspicios" icon={Handshake} href="/dashboard/sponsorships">
              <Stat label="Marcas confirmadas" value={hub.sponsorships.confirmed} />
              <Stat label="Canje comprometido" value={formatCurrency(hub.sponsorships.barter)} />
              <Stat label="Cobrado" value={`${formatCurrency(hub.sponsorships.cashCollected)} / ${formatCurrency(hub.sponsorships.cashCommitted)}`} />
              <Stat
                label="Entregables"
                value={`${hub.sponsorships.deliverablesDone}/${hub.sponsorships.deliverablesTotal}${hub.sponsorships.deliverablesOverdue > 0 ? ` · ${hub.sponsorships.deliverablesOverdue} vencidos` : ''}`}
                tone={hub.sponsorships.deliverablesOverdue > 0 ? 'danger' : undefined}
              />
            </ModuleCard>
          )}
          {hub.ticketing && (
            <ModuleCard title="Entradas" icon={Ticket} href="/dashboard/ticketing">
              <Stat label="Vendidas" value={hub.ticketing.capacity ? `${hub.ticketing.ticketsSold}/${hub.ticketing.capacity}` : hub.ticketing.ticketsSold} />
              <Stat label="Recaudado" value={formatCurrency(hub.ticketing.revenue)} />
              <Stat label="Pagos por confirmar" value={hub.ticketing.pendingOrders} tone={hub.ticketing.pendingOrders > 0 ? 'warning' : undefined} />
              <Stat label="Ingresaron al recinto" value={hub.ticketing.checkedIn} />
            </ModuleCard>
          )}
          {hub.voting && (
            <ModuleCard title="Votación del público" icon={Vote} href="/dashboard/voting">
              <Stat label="Votos pagados" value={hub.voting.votes.toLocaleString('es-CL')} />
              <Stat label="Recaudado" value={formatCurrency(hub.voting.revenue)} />
              <Stat label="Va ganando" value={hub.voting.leader ? `${hub.voting.leader.name} (${hub.voting.leader.votes.toLocaleString('es-CL')})` : '—'} />
            </ModuleCard>
          )}
          {hub.judging && (
            <ModuleCard title="Jurado y escrutinio" icon={Gavel} href="/dashboard/judging">
              <Stat label="Rondas completadas" value={`${hub.judging.completedRounds}/${hub.judging.rounds}`} />
              <Stat label="Jurados" value={hub.judging.judges} />
              <Stat label="Puntajes enviados" value={hub.judging.submittedScores} />
              <Stat label="Ganadora" value={hub.judging.winnerName ?? 'Por definir'} tone={hub.judging.winnerName ? 'success' : undefined} />
            </ModuleCard>
          )}
          {hub.production && (
            <ModuleCard title="Producción en vivo" icon={ListVideo} href={`/dashboard/production/timeline?projectId=${project.id}`}>
              <Stat label="Escaleta" value={`${hub.production.stageBlocks} bloques · ${Math.floor(hub.production.stageMinutes / 60)} h ${hub.production.stageMinutes % 60} min`} />
              <Stat label="Looks listos" value={`${hub.production.wardrobeReady}/${hub.production.wardrobeItems}`} />
              <Stat label="Credenciales" value={hub.production.accreditations} />
              <Stat label="Staff ingresado" value={hub.production.checkedIn} />
            </ModuleCard>
          )}
          {hub.crm && (
            <ModuleCard title="Negocios en el CRM" icon={Target} href="/dashboard/crm">
              <Stat label="Negocios abiertos" value={hub.crm.openDeals} />
              <Stat label="Monto abierto" value={formatCurrency(hub.crm.openAmount)} />
              <Stat label="Pronóstico ponderado" value={formatCurrency(hub.crm.weighted)} />
              <Stat label="Ganado" value={formatCurrency(hub.crm.wonAmount)} tone="success" />
            </ModuleCard>
          )}
          {hub.sponsorships && hub.sponsorships.topSponsors.length > 0 && (
            <section className="rounded-lg border border-border bg-card p-5 shadow-card">
              <h3 className="text-sm font-semibold text-foreground">Principales auspiciadores</h3>
              <ul className="mt-3 space-y-2 text-sm">
                {hub.sponsorships.topSponsors.map((s) => (
                  <li key={s.name} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate">
                      {s.name} <span className="text-xs text-muted-foreground">· {SPONSORSHIP_TIER_LABELS[s.tier as keyof typeof SPONSORSHIP_TIER_LABELS]}</span>
                    </span>
                    <span className="shrink-0 tabular-nums">{formatCurrency(s.amount)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>

      {(hub.links.site || hub.links.registration || hub.links.tickets || hub.links.voting) && (
        <section className="rounded-lg border border-border bg-card p-5 shadow-card">
          <h2 className="text-base font-semibold text-foreground">Enlaces públicos del certamen</h2>
          <p className="text-xs text-muted-foreground">Para compartir en redes, correos y WhatsApp.</p>
          <ul className="mt-2 divide-y divide-border">
            {hub.links.site && <PublicLinkRow label="Sitio del certamen" path={hub.links.site} hint={project.publicSiteEnabled ? undefined : 'Todavía no publicado: actívalo en "Sitio público".'} />}
            {hub.links.registration && <PublicLinkRow label="Postulación de candidatas" path={hub.links.registration} hint={hub.links.registrationOpen ? undefined : 'Las postulaciones no están abiertas.'} />}
            {hub.links.tickets && <PublicLinkRow label="Venta de entradas" path={hub.links.tickets} />}
            {hub.links.voting && <PublicLinkRow label="Votación del público" path={hub.links.voting} />}
          </ul>
        </section>
      )}

      <section className="space-y-5">
        <h2 className="text-base font-semibold text-foreground">Finanzas del certamen</h2>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="Ingresos reales (efectivo)" value={formatCurrency(summary.actualIncomeCash)} icon={CircleDollarSign} tone="accent" />
          <KpiCard label="Gastos reales" value={formatCurrency(summary.actualExpense)} icon={TrendingDown} tone="warning" />
          <KpiCard label="Margen" value={`${formatCurrency(summary.marginAmount)} (${summary.marginPercent}%)`} icon={TrendingUp} tone={marginTone} />
          <KpiCard label="Ingresos por canje (barter)" value={formatCurrency(summary.actualIncomeBarter)} icon={Gift} tone="info" />
        </div>
        <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-card p-4 text-sm shadow-card sm:grid-cols-4">
          {[
            ['Auspicios cobrados', summary.incomeBySource.sponsorships],
            ['Entradas', summary.incomeBySource.tickets],
            ['Votación del público', summary.incomeBySource.votes],
            ['Ventas facturadas', summary.incomeBySource.sales],
          ].map(([label, value]) => (
            <div key={label as string}>
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="font-semibold tabular-nums">{formatCurrency(value as number)}</p>
            </div>
          ))}
        </div>
        <ProjectFinanceCharts summary={summary} />
        <p className="text-xs text-muted-foreground">
          El ingreso incluye auspicios cobrados, entradas y votos con pago confirmado y ventas facturadas vinculadas; el gasto, compras y boletas de honorarios pagadas vinculadas a este certamen.
        </p>
      </section>

      {project.notes && (
        <section className="rounded-xl border border-border bg-card p-5 text-sm shadow-card">
          <h2 className="mb-2 text-base font-semibold text-foreground">Notas</h2>
          <p className="text-muted-foreground">{project.notes}</p>
        </section>
      )}
    </div>
  );
}
