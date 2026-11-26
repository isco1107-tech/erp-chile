'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Copy, Maximize2, QrCode, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useConfirm } from '@/components/ui/confirm-provider';
import { CHECK_IN_DURATIONS, CHECK_IN_DURATION_LABELS, DEFAULT_CHECK_IN_MINUTES, classDayLabel, santiagoTimeLabel, type CheckInDuration } from '@/lib/academy/check-in';
import { closeCheckInAction, getCheckInAction, openCheckInAction, type CheckInPanelView } from '@/modules/academy/actions/academy-check-in.actions';
import { fieldClass } from './shared';

interface CheckInQrPanelProps {
  groupId: string;
  /** "YYYY-MM-DD": solo se ofrece para la clase de hoy. */
  date: string;
  groupName?: string;
  /** Avisa si el QR está recibiendo asistencia (la lista se actualiza sola mientras tanto). */
  onLiveChange?: (live: boolean) => void;
}

/**
 * QR de asistencia de una clase: la alumna lo escanea, escribe su RUT y queda
 * presente. Vive dentro de la lista («Pasar lista» y la clase del calendario),
 * así que ambas muestran el mismo QR del grupo y el día.
 */
export default function CheckInQrPanel({ groupId, date, groupName, onLiveChange }: CheckInQrPanelProps) {
  const confirm = useConfirm();
  const [view, setView] = useState<CheckInPanelView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [minutes, setMinutes] = useState<CheckInDuration>(DEFAULT_CHECK_IN_MINUTES);
  const [big, setBig] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let active = true;
    void getCheckInAction({ groupId, date }).then((result) => {
      if (!active) return;
      setLoading(false);
      if (result.success) setView(result.data);
    });
    return () => {
      active = false;
    };
  }, [groupId, date]);

  // El vencimiento se revisa en el navegador para dejar de mostrar un QR que ya no sirve.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);

  const open = view !== null && view.state === 'OPEN' && new Date(view.expiresAt).getTime() > now;
  useEffect(() => {
    onLiveChange?.(open);
  }, [open, onLiveChange]);
  useEffect(() => () => onLiveChange?.(false), [onLiveChange]);

  const start = useCallback(
    async (renew: boolean) => {
      setBusy(true);
      const result = await openCheckInAction({ groupId, date, minutes, renew });
      setBusy(false);
      if (!result.success) return void toast.error(result.error);
      setNow(Date.now());
      setView(result.data);
      toast.success(result.message ?? 'Registro con QR abierto');
    },
    [groupId, date, minutes]
  );

  async function renew() {
    if (!(await confirm({ title: '¿Generar un QR nuevo?', description: 'El QR anterior deja de funcionar al instante. Úsalo si alguien compartió el QR con quien no está en la sala.', confirmLabel: 'Generar QR nuevo' }))) return;
    await start(true);
  }

  async function close() {
    setBusy(true);
    const result = await closeCheckInAction({ groupId, date });
    setBusy(false);
    if (!result.success) return void toast.error(result.error);
    setView(result.data);
    setBig(false);
    toast.success(result.message ?? 'Registro cerrado');
  }

  async function copy() {
    if (!view) return;
    try {
      await navigator.clipboard.writeText(view.url);
      toast.success('Enlace copiado');
    } catch {
      toast.error('No se pudo copiar. Mantén presionado el QR o usa «Pantalla completa»');
    }
  }

  const durationSelect = (
    <label className="space-y-1 text-xs font-medium text-muted-foreground">
      Abierto durante
      <select className={fieldClass} value={minutes} onChange={(e) => setMinutes(Number(e.target.value) as CheckInDuration)} disabled={busy}>
        {CHECK_IN_DURATIONS.map((value) => (
          <option key={value} value={value}>{CHECK_IN_DURATION_LABELS[value]}</option>
        ))}
      </select>
    </label>
  );

  if (loading) return null;

  const until = view ? santiagoTimeLabel(new Date(view.expiresAt)) : null;

  if (!open) {
    return (
      <section className="space-y-3 rounded-lg border border-border bg-card p-4" aria-label="Asistencia con QR">
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"><QrCode className="size-5" /></span>
          <div className="min-w-0 space-y-0.5">
            <h3 className="text-sm font-semibold">Asistencia con QR</h3>
            <p className="text-xs text-muted-foreground">
              {view
                ? `El registro con QR de hoy se cerró${view.state === 'EXPIRED' && until ? ` a las ${until}` : ''}. Puedes volver a abrirlo con el mismo QR.`
                : 'Muestra un QR en la sala: cada alumna lo escanea con su celular, escribe su RUT y queda presente. La lista de abajo se llena sola.'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          {durationSelect}
          <Button size="sm" disabled={busy} onClick={() => void start(false)}>
            <QrCode aria-hidden="true" /> {view ? 'Volver a abrir el QR' : 'Mostrar QR de asistencia'}
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-4" aria-label="Asistencia con QR">
      <div className="flex flex-wrap items-start gap-4">
        <button type="button" onClick={() => setBig(true)} className="shrink-0 rounded-md border border-border bg-white p-2 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none" aria-label="Ver el QR en pantalla completa">
          {/* eslint-disable-next-line @next/next/no-img-element -- data URL generado en el servidor */}
          <img src={view.qrDataUrl} alt="QR para registrar la asistencia" width={168} height={168} className="size-36 [image-rendering:pixelated] sm:size-42" />
        </button>
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <h3 className="text-sm font-semibold">Registro con QR abierto</h3>
            <p className="text-xs text-muted-foreground">Recibe asistencia hasta las {until}. Las alumnas escanean, escriben su RUT y aparecen como presentes en la lista. Lo que ya marcaste a mano no se cambia.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setBig(true)}><Maximize2 aria-hidden="true" /> Pantalla completa</Button>
            <Button size="sm" variant="outline" onClick={() => void copy()}><Copy aria-hidden="true" /> Copiar enlace</Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void renew()}><RefreshCw aria-hidden="true" /> QR nuevo</Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void close()}>Cerrar registro</Button>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            {durationSelect}
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void start(false)}>Extender desde ahora</Button>
          </div>
        </div>
      </div>

      <Dialog open={big} onOpenChange={setBig}>
        <DialogContent className="max-w-3xl">
          <DialogHeader className="pr-8 text-center sm:text-center">
            <DialogTitle className="text-2xl">Registra tu asistencia</DialogTitle>
            <DialogDescription>
              {groupName ? `${groupName} · ` : ''}
              {classDayLabel(date)} · abierto hasta las {until}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-3">
            <div className="rounded-xl bg-white p-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- data URL generado en el servidor */}
              <img src={view.qrDataUrl} alt="QR para registrar la asistencia" width={640} height={640} className="size-[min(70dvh,80vw,32rem)] [image-rendering:pixelated]" />
            </div>
            <p className="text-center text-sm text-muted-foreground">Escanéalo con la cámara del celular y escribe tu RUT.</p>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
