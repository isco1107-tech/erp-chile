import { notFound } from 'next/navigation';
import PrintButton from '@/components/PrintButton';
import { requireAuthWithPermission } from '@/lib/auth/guards';
import { prisma } from '@/lib/prisma';
import { listStageItems } from '@/modules/production/services/production.service';
import { STAGE_ITEM_STATUS_LABELS, STAGE_SEGMENT_META } from '@/modules/production/schema';
import { candidateLabel } from '@/components/production/stage-ui';

export const metadata = { title: 'Escaleta — impresión' };

const time = (d: Date) => d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago' });

/**
 * Escaleta en formato de hoja para cabina, piso y conductores: una fila por
 * bloque con hora, segmento, candidata, pie y pies técnicos. Server Component
 * con la misma validación de tenant que el resto del módulo.
 */
export default async function PrintTimelinePage({ searchParams }: { searchParams: Promise<{ projectId?: string }> }) {
  const session = await requireAuthWithPermission('production:read');
  const { projectId } = await searchParams;
  if (!projectId) notFound();
  const project = await prisma.project.findFirst({
    where: { id: projectId, companyId: session.companyId },
    select: { id: true, name: true, code: true, galaDate: true, venueName: true },
  });
  if (!project) notFound();
  const items = await listStageItems(session.companyId, project.id);
  const totalMinutes = items.filter((i) => i.status !== 'SKIPPED').reduce((s, i) => s + i.durationMinutes, 0);

  return (
    <div className="space-y-4 bg-card p-6 print:p-0 print:text-[11px]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs tracking-wide text-muted-foreground uppercase">Escaleta · {project.code}</p>
          <h1 className="text-2xl font-semibold">{project.name}</h1>
          <p className="text-sm text-muted-foreground">
            {project.galaDate ? project.galaDate.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Santiago' }) : 'Fecha de gala por definir'}
            {project.venueName && ` · ${project.venueName}`} · {items.length} bloques · {Math.floor(totalMinutes / 60)} h {totalMinutes % 60} min
          </p>
        </div>
        <PrintButton />
      </div>

      <table className="w-full border-collapse text-sm print:text-[11px]">
        <thead>
          <tr className="border-b-2 border-foreground text-left">
            <th className="py-1.5 pr-2">#</th>
            <th className="py-1.5 pr-2">Hora</th>
            <th className="py-1.5 pr-2">Min</th>
            <th className="py-1.5 pr-2">Bloque</th>
            <th className="py-1.5 pr-2">Candidata</th>
            <th className="py-1.5 pr-2">Pie</th>
            <th className="py-1.5 pr-2">Audio</th>
            <th className="py-1.5 pr-2">Luces</th>
            <th className="py-1.5">Pantalla</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b border-border align-top break-inside-avoid">
              <td className="py-1.5 pr-2 tabular-nums">{item.blockOrder}</td>
              <td className="py-1.5 pr-2 font-mono tabular-nums">{time(item.startTime)}</td>
              <td className="py-1.5 pr-2 tabular-nums">{item.durationMinutes}</td>
              <td className="py-1.5 pr-2">
                <p className="font-semibold">{item.title}</p>
                <p className="text-xs text-muted-foreground">
                  {STAGE_SEGMENT_META[item.segmentType].label}
                  {item.status !== 'PENDING' && ` · ${STAGE_ITEM_STATUS_LABELS[item.status]}`}
                </p>
                {item.description && <p className="mt-0.5 text-xs whitespace-pre-line">{item.description}</p>}
              </td>
              <td className="py-1.5 pr-2">{candidateLabel(item.candidate)}</td>
              <td className="py-1.5 pr-2">{item.responsible ?? ''}</td>
              <td className="py-1.5 pr-2">{item.audioCue ?? ''}</td>
              <td className="py-1.5 pr-2">{item.lightingCue ?? ''}</td>
              <td className="py-1.5">{item.videoCue ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {items.length === 0 && <p className="text-sm text-muted-foreground">La escaleta no tiene bloques todavía.</p>}
    </div>
  );
}
