'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Copy, Download, ExternalLink, Link2 } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useConfirm } from '@/components/ui/confirm-provider';
import {
  getAutoApproveEnrollmentsAction,
  getEnrollmentLinkAction,
  regenerateEnrollmentLinkAction,
  setAutoApproveEnrollmentsAction,
  type EnrollmentLinkView,
} from '@/modules/academy/actions/academy.actions';

interface EnrollmentLinkCardProps {
  canManage: boolean;
  /** Se llama al cambiar la aprobación automática (para refrescar el conteo de pendientes). */
  onChanged?: () => void;
}

/**
 * Link (y QR) para que cada alumna complete su propia ficha desde el celular.
 * Es el mismo link de Inscripciones: las inscripciones llegan a revisión o,
 * con «Crear la ficha al instante», quedan directo en Alumnas.
 */
export default function EnrollmentLinkCard({ canManage, onChanged }: EnrollmentLinkCardProps) {
  const confirm = useConfirm();
  const [link, setLink] = useState<EnrollmentLinkView | null>(null);
  const [autoApprove, setAutoApprove] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void getAutoApproveEnrollmentsAction().then((result) => {
      if (active && result.success) setAutoApprove(result.data);
    });
    return () => {
      active = false;
    };
  }, []);

  async function showLink() {
    setBusy(true);
    const result = await getEnrollmentLinkAction();
    setBusy(false);
    if (!result.success) return void toast.error(result.error);
    setLink(result.data);
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success('Link copiado');
    } catch {
      toast.error('No se pudo copiar. Selecciona el link y cópialo a mano');
    }
  }

  async function regenerate() {
    if (!(await confirm({ title: '¿Generar un link nuevo?', description: 'El link anterior (y su QR) dejarán de funcionar para quien ya los tenga. Tendrás que compartir el nuevo.', confirmLabel: 'Generar link nuevo' }))) return;
    setBusy(true);
    const result = await regenerateEnrollmentLinkAction();
    if (!result.success) {
      setBusy(false);
      return void toast.error(result.error);
    }
    toast.success(result.message ?? 'Link nuevo generado');
    // Se vuelve a pedir el link para traer también el QR nuevo.
    const fresh = await getEnrollmentLinkAction();
    setBusy(false);
    if (fresh.success) setLink(fresh.data);
    else setLink(null);
  }

  async function changeAutoApprove(value: boolean) {
    if (
      value &&
      !(await confirm({
        title: '¿Crear la ficha al instante?',
        description: 'Cada persona que complete el formulario quedará como alumna sin que la revises, en el grupo que elija y cobrando desde el mes en curso. Podrás editarla o darla de baja después.',
        confirmLabel: 'Activar',
      }))
    ) {
      return;
    }
    setBusy(true);
    const result = await setAutoApproveEnrollmentsAction(value);
    setBusy(false);
    if (!result.success) return void toast.error(result.error);
    setAutoApprove(result.data);
    toast.success(result.message ?? 'Listo');
    onChanged?.();
  }

  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-4" aria-label="Link de inscripción">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">Link para que las alumnas ingresen sus datos</h3>
          <p className="text-xs text-muted-foreground">
            Compártelo por WhatsApp o Instagram, o muestra el QR en la sala: cada alumna completa su ficha desde el celular.{' '}
            {autoApprove === null ? '' : autoApprove ? 'Su ficha se crea al instante en Alumnas.' : 'Las inscripciones llegan a la pestaña Inscripciones para que las apruebes.'}
          </p>
        </div>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void showLink()}>
          <Link2 aria-hidden="true" /> {link ? 'Actualizar' : 'Ver link y QR'}
        </Button>
      </div>

      {link && (
        <div className="flex flex-wrap items-start gap-4">
          <div className="shrink-0 rounded-md border border-border bg-white p-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- data URL generado en el servidor */}
            <img src={link.qrDataUrl} alt="QR del link de inscripción" width={144} height={144} className="size-36 [image-rendering:pixelated]" />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <Input readOnly aria-label="Link de inscripción" value={link.url} onFocus={(e) => e.currentTarget.select()} className="min-w-0" />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => void copy(link.url)}>
                <Copy aria-hidden="true" /> Copiar
              </Button>
              <a className={buttonVariants({ variant: 'outline', size: 'sm' })} href={link.url} target="_blank" rel="noopener noreferrer">
                <ExternalLink aria-hidden="true" /> Abrir formulario
              </a>
              <a className={buttonVariants({ variant: 'outline', size: 'sm' })} href={link.qrDataUrl} download="qr-inscripcion-academia.png">
                <Download aria-hidden="true" /> Descargar QR
              </a>
              {canManage && (
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => void regenerate()}>
                  Generar link nuevo
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {autoApprove !== null && (
        <div className="flex items-start gap-3 rounded-md border border-border p-3">
          <Switch checked={autoApprove} onCheckedChange={(value) => void changeAutoApprove(value)} disabled={!canManage || busy} label="Crear la ficha de la alumna al instante" className="mt-0.5" />
          <div className="min-w-0 text-sm">
            <p className="font-medium">Crear la ficha de la alumna al instante</p>
            <p className="text-xs text-muted-foreground">
              {autoApprove
                ? 'Activado: cada inscripción queda directo en Alumnas (y en el historial de Inscripciones como aprobada).'
                : 'Desactivado: cada inscripción espera en Inscripciones hasta que la apruebes.'}
              {!canManage && ' Solo quien administra la academia puede cambiarlo.'}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
