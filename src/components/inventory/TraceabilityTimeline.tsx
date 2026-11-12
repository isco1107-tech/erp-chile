import { Barcode, History } from 'lucide-react';
import { isAllowedBlobUrl } from '@/lib/security/blob-url';
import { dayTimeLabel } from '@/lib/retail/live-metrics';
import { EmptyState } from '@/components/ui/EmptyState';
import type { TimelineEntry } from '@/lib/inventory/traceability';

/** Historia del producto, de lo más reciente a lo más antiguo: quién, cuándo, por qué y con qué respaldo. */
export default function TraceabilityTimeline({ entries }: { entries: TimelineEntry[] }) {
  if (entries.length === 0) {
    return <EmptyState title="Sin historia todavía" description="Este producto aún no tiene movimientos ni series registradas." />;
  }
  return (
    <ol className="space-y-0 border-l border-border pl-4">
      {entries.map((entry) => {
        const Icon = entry.source === 'serial' ? Barcode : History;
        return (
          <li key={entry.id} className="relative pb-4 last:pb-0">
            <span className="absolute -left-[25px] top-0.5 flex size-5 items-center justify-center rounded-full border border-border bg-card">
              <Icon className="size-3 text-primary" aria-hidden="true" />
            </span>
            <p className="break-words text-sm font-medium">{entry.title}</p>
            {entry.detail && <p className="break-words text-xs text-muted-foreground">{entry.detail}</p>}
            <p className="break-words text-xs text-muted-foreground">
              {[dayTimeLabel(entry.at), entry.actor, entry.reference].filter(Boolean).join(' · ')}
            </p>
            {entry.evidenceUrl && isAllowedBlobUrl(entry.evidenceUrl) && (
              <a href={entry.evidenceUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-primary underline">
                Ver foto de respaldo
              </a>
            )}
          </li>
        );
      })}
    </ol>
  );
}
