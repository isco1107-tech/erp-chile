'use client';

import { AlertTriangle, CircleCheck, CircleX, Globe, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { ReadinessReport } from '@/lib/web-sites/readiness';

interface PublishDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  report: ReadinessReport;
  /** El sitio ya estaba publicado: se publican los cambios del borrador. */
  republish: boolean;
  /** Hay cambios sin guardar que se guardarán antes de publicar. */
  unsavedNote: boolean;
  publishing: boolean;
  onConfirm: () => void;
  onSeeReadiness: () => void;
}

/** Resumen de "qué le falta" antes de publicar: bloqueadores en rojo, recomendaciones en ámbar. */
export function PublishDialog({ open, onOpenChange, report, republish, unsavedNote, publishing, onConfirm, onSeeReadiness }: PublishDialogProps) {
  const blockers = report.items.filter((item) => item.required && !item.ok);
  const advice = report.items.filter((item) => !item.required && !item.ok);
  return (
    <Dialog open={open} onOpenChange={(next) => !publishing && onOpenChange(next)}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{republish ? 'Publicar cambios' : 'Publicar sitio'}</DialogTitle>
          <DialogDescription>
            {republish ? 'Las visitas verán la versión que estás editando ahora.' : 'Al publicar, tu sitio queda visible en internet para cualquiera que tenga el enlace.'}
            {unsavedNote ? ' Antes se guardarán tus cambios pendientes.' : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {blockers.length > 0 ? (
            <section role="alert" aria-label="Falta para poder publicar" className="space-y-2 rounded-lg bg-danger-soft px-4 py-3">
              <p className="text-sm font-semibold text-danger">Aún no se puede publicar. Falta:</p>
              <ul className="space-y-1.5">
                {blockers.map((item) => (
                  <li key={item.id} className="flex items-start gap-2 text-sm text-danger">
                    <CircleX className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    <span>
                      <span className="font-medium">{item.label}.</span> <span className="text-xs">{item.hint}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <p className="flex items-center gap-2 rounded-lg bg-success-soft px-4 py-3 text-sm font-medium text-success">
              <CircleCheck className="size-4" aria-hidden="true" /> Todo lo obligatorio está listo.
            </p>
          )}

          {advice.length > 0 ? (
            <section aria-label="Recomendaciones pendientes" className="space-y-2 rounded-lg bg-warning-soft px-4 py-3">
              <p className="text-sm font-semibold text-warning">Recomendado antes de publicar (no impide publicar):</p>
              <ul className="space-y-1.5">
                {advice.map((item) => (
                  <li key={item.id} className="flex items-start gap-2 text-sm text-warning">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    <span>
                      <span className="font-medium">{item.label}.</span> <span className="text-xs">{item.hint}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <DialogFooter className="flex-wrap">
          <Button type="button" variant="ghost" disabled={publishing} onClick={onSeeReadiness}>
            Ver “Qué le falta”
          </Button>
          <Button type="button" variant="outline" disabled={publishing} onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" disabled={!report.canPublish || publishing} onClick={onConfirm}>
            {publishing ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Globe aria-hidden="true" />} {republish ? 'Publicar cambios' : 'Publicar ahora'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
