'use client';

import { useState, useTransition } from 'react';
import { FolderOpen, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useConfirm } from '@/components/ui/confirm-provider';
import { cn } from '@/lib/utils';
import { POSTER_FORMAT_SPECS } from '@/lib/posters/formats';
import type { PosterRequestBody } from '@/lib/posters/overrides';
import { POSTER_PIECE_INFO } from '@/lib/posters/pieces';
import { POSTER_STYLE_INFO } from '@/lib/posters/styles';
import { deletePosterDesignAction, savePosterDesignAction } from '@/modules/projects/actions/poster-designs.actions';
import type { PosterDesignView } from '@/modules/projects/services/poster-designs.service';

/**
 * Diseños guardados del certamen: abrir uno carga su pieza, estilo, formato y
 * personalización en el estudio; guardar crea uno nuevo o actualiza el abierto.
 * Los datos del certamen no se guardan: se vuelven a leer al abrirlo.
 */

// Hora de Chile y reloj de 24 h, armada por partes: igual en el servidor y en el navegador (sin "p. m.", cuyo
// espacio cambia entre versiones de ICU, ni la zona horaria del servidor), así no hay desajuste al hidratar.
const dateParts = new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'America/Santiago' });

function updatedLabel(iso: string): string {
  const parts = dateParts.formatToParts(new Date(iso));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('day')} ${get('month').replace('.', '')} · ${get('hour')}:${get('minute')}`;
}

export interface PosterDesignsProps {
  projectId: string;
  canWrite: boolean;
  designs: PosterDesignView[];
  onDesignsChange: (designs: PosterDesignView[]) => void;
  current: { id: string; name: string } | null;
  onOpen: (design: PosterDesignView) => void;
  onCurrentChange: (current: { id: string; name: string } | null) => void;
  /** El pedido actual del estudio (lo que se guarda). */
  request: PosterRequestBody;
  dirty: boolean;
  onSaved: () => void;
}

export function PosterDesigns({ projectId, canWrite, designs, onDesignsChange, current, onOpen, onCurrentChange, request, dirty, onSaved }: PosterDesignsProps) {
  const confirm = useConfirm();
  const [name, setName] = useState('');
  const [pending, startTransition] = useTransition();

  function save(asNew: boolean) {
    const designName = asNew ? name.trim() : (current?.name ?? name.trim());
    startTransition(async () => {
      const result = await savePosterDesignAction(projectId, { ...request, name: designName }, asNew ? null : (current?.id ?? null));
      if (!result.success) return void toast.error(result.error);
      toast.success(result.message ?? 'Diseño guardado');
      const others = designs.filter((d) => d.id !== result.data.id);
      onDesignsChange([result.data, ...others]);
      onCurrentChange({ id: result.data.id, name: result.data.name });
      setName('');
      onSaved();
    });
  }

  async function remove(design: PosterDesignView) {
    if (!(await confirm({ title: `¿Eliminar "${design.name}"?`, description: 'El diseño guardado se borra; las imágenes que subiste siguen disponibles para otros diseños.', confirmLabel: 'Eliminar', destructive: true }))) return;
    startTransition(async () => {
      const result = await deletePosterDesignAction(projectId, design.id);
      if (!result.success) return void toast.error(result.error);
      onDesignsChange(designs.filter((d) => d.id !== design.id));
      if (current?.id === design.id) onCurrentChange(null);
      toast.success('Diseño eliminado');
    });
  }

  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-4 shadow-card" aria-labelledby="poster-designs">
      <h2 id="poster-designs" className="text-sm font-semibold">
        Diseños guardados
      </h2>

      {current && (
        <p className="text-xs text-muted-foreground">
          Editando <span className="font-medium text-foreground">{current.name}</span>
          {dirty ? ' · cambios sin guardar' : ''}
        </p>
      )}

      {canWrite ? (
        <div className="space-y-2">
          {current && (
            <Button type="button" size="sm" disabled={pending || !dirty} onClick={() => save(false)}>
              <Save aria-hidden="true" className="size-4" />
              Guardar cambios
            </Button>
          )}
          <form
            className="flex min-w-0 gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (name.trim()) save(true);
            }}
          >
            <Input className="min-w-0 flex-1" maxLength={60} placeholder={current ? 'Guardar como nuevo…' : 'Nombre del diseño'} value={name} onChange={(e) => setName(e.target.value)} aria-label="Nombre del diseño" />
            <Button type="submit" size="sm" variant={current ? 'outline' : 'default'} disabled={pending || !name.trim()}>
              <Save aria-hidden="true" className="size-4" />
              {current ? 'Como nuevo' : 'Guardar'}
            </Button>
          </form>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Necesitas permiso de edición de certámenes para guardar diseños.</p>
      )}

      {designs.length === 0 ? (
        <p className="text-xs text-muted-foreground">Aún no hay diseños guardados en este certamen.</p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {designs.map((design) => (
            <li key={design.id} className={cn('flex min-w-0 items-center gap-2 px-3 py-2', current?.id === design.id && 'bg-primary/5')}>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium" title={design.name}>
                  {design.name}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {POSTER_PIECE_INFO[design.request.piece].label} · {POSTER_STYLE_INFO[design.request.style].label} · {POSTER_FORMAT_SPECS[design.request.format].label} · {updatedLabel(design.updatedAt)}
                </p>
              </div>
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Abrir ${design.name}`} title="Abrir" onClick={() => onOpen(design)}>
                <FolderOpen aria-hidden="true" className="size-4" />
              </Button>
              {canWrite && (
                <Button type="button" variant="ghost" size="icon-sm" aria-label={`Eliminar ${design.name}`} title="Eliminar" disabled={pending} onClick={() => void remove(design)}>
                  <Trash2 aria-hidden="true" className="size-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
