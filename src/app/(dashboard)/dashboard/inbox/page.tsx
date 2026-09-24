import Link from 'next/link';
import { AlertTriangle, ArrowRight, CheckCircle2, Info } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { getAuthContext } from '@/lib/auth/guards';
import { formatCurrency } from '@/lib/chile/tax';
import { cn } from '@/lib/utils';
import { getInbox, type InboxSeverity } from '@/modules/inbox/inbox.service';

export const metadata = { title: 'Pendientes' };
export const dynamic = 'force-dynamic';

const SEVERITY: Record<InboxSeverity, { icon: typeof AlertTriangle; className: string; label: string }> = {
  danger: { icon: AlertTriangle, className: 'bg-danger-soft text-danger', label: 'Urgente' },
  warning: { icon: AlertTriangle, className: 'bg-warning-soft text-warning', label: 'Importante' },
  info: { icon: Info, className: 'bg-info-soft text-info', label: 'Por hacer' },
};

export default async function InboxPage() {
  const context = await getAuthContext();
  const items = await getInbox(context);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Principal" title="Pendientes" description="Lo que requiere tu atención en toda la empresa, ordenado por urgencia." />
      {items.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 className="size-10 text-success" aria-hidden="true" />}
          title="Nada pendiente por ahora"
          description="Cuando haya aprobaciones, cobros vencidos, borradores por emitir o movimientos por conciliar, aparecerán aquí."
        />
      ) : (
        <ul className="space-y-3">
          {items.map((item) => {
            const severity = SEVERITY[item.severity];
            const Icon = severity.icon;
            return (
              <li key={item.id}>
                <Link href={item.href} className="group flex items-center gap-4 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted/40">
                  <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-lg', severity.className)}>
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs uppercase tracking-wide text-muted-foreground">
                      {item.area} · {severity.label}
                    </span>
                    <span className="block font-medium">
                      {item.title} <span className="tabular-nums">({item.count})</span>
                    </span>
                    <span className="block text-sm text-muted-foreground">{item.detail}</span>
                  </span>
                  {item.amount !== null && <span className="hidden text-right font-semibold tabular-nums sm:block">{formatCurrency(item.amount)}</span>}
                  <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
