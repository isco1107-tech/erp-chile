'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { getCurrentShiftAction, posHeartbeatAction } from '@/modules/pos/actions/pos.actions';
import PosTerminal from './PosTerminal';
import CashPanel from './CashPanel';
import ShiftHistoryPanel from './ShiftHistoryPanel';
import { formatCurrency } from '@/lib/chile/tax';
import { Button } from '@/components/ui/button';
import { PosDesktopDownload } from './PosDesktopDownload';

/** Cada cuánto la caja avisa a la Supersuite que sigue viva (el umbral de "sin señal" allá es 2 minutos). */
const LATIDO_MS = 60_000;

interface Props {
  shiftId: string;
  warehouseId: string;
  warehouseName: string;
  cashRegisterName: string;
  cashierName: string;
  openedAt: string;
  initialAmount: number;
  canClose: boolean;
  currentUserId: string;
  canSupervise: boolean;
  companyName: string;
  companyRut: string;
  companyAddress: string | null;
  /** true si la Supersuite está configurada: la caja reporta latidos mientras esta pantalla esté abierta. */
  reportarLatidos?: boolean;
}

/**
 * Alterna entre vender y arquear sin perder el carrito: cambiar de pestaña
 * mantiene montado el terminal (solo se oculta), porque en un mostrador es
 * normal consultar la caja a media venta.
 */
export default function PosWorkspace(props: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<'terminal' | 'cash' | 'history'>('terminal');
  const [shiftClosed, setShiftClosed] = useState(false);
  const [cashVisited, setCashVisited] = useState(false);
  const [pendingSale, setPendingSale] = useState(false);
  const [pendingMovement, setPendingMovement] = useState(false);
  const operationPending = pendingSale || pendingMovement;
  const busy = useRef(false);

  // Un supervisor puede cerrar este turno en otro equipo. Conservamos el
  // carrito visible para comprobarlo; volver a apertura es una decisión explícita.
  useEffect(() => {
    let checking = false;
    let active = true;
    const check = async () => {
      if (checking || busy.current || document.visibilityState !== 'visible' || !navigator.onLine) return;
      checking = true;
      try {
        const result = await getCurrentShiftAction();
        if (active && !busy.current && result.success && result.data?.id !== props.shiftId) setShiftClosed(true);
      } catch { /* Una pérdida de conexión no implica que el turno se haya cerrado. */ }
      finally { checking = false; }
    };
    const onFocus = () => { void check(); };
    const timer = window.setInterval(onFocus, 30_000);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onFocus); };
  }, [props.shiftId]);

  useEffect(() => {
    if (shiftClosed) toast.warning('Este turno fue cerrado. Revisa la venta en pantalla y consulta el comprobante en el historial.');
  }, [shiftClosed]);

  // Monitoreo de la caja: un latido por minuto mientras la pestaña está visible.
  // Fallar un latido no afecta la venta, así que el resultado se ignora.
  useEffect(() => {
    if (!props.reportarLatidos) return;
    const latir = () => { if (document.visibilityState === 'visible') void posHeartbeatAction(); };
    latir();
    const timer = window.setInterval(latir, LATIDO_MS);
    document.addEventListener('visibilitychange', latir);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', latir); };
  }, [props.reportarLatidos]);

  return (
    <div className="space-y-5" data-pos-pending={operationPending ? 'true' : undefined}>
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground" data-tutorial="module-header">Punto de Venta</h1>
          <p className="mt-0.5 flex items-center gap-2 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2 py-0.5 text-xs font-medium text-success">
              <span className="size-1.5 rounded-full bg-success" aria-hidden="true" /> {shiftClosed ? 'Turno cerrado' : 'Turno abierto'}
            </span>
            <span className="min-w-0 break-words">{props.cashRegisterName} · Cajero: {props.cashierName}</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Apertura {new Date(props.openedAt).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Santiago' })} · Fondo inicial {formatCurrency(props.initialAmount)}</p>
        </div>
        <PosDesktopDownload />
        <div role="tablist" aria-label="Vista del punto de venta" className="inline-flex max-w-full flex-wrap rounded-xl border border-border bg-card p-1 shadow-card">
          {([['terminal', 'Vender'], ['cash', 'Caja y arqueo'], ['history', props.canSupervise ? 'Turnos y multicaja' : 'Mis turnos']] as const).map(([key, text]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              disabled={operationPending && tab !== key}
              onClick={() => { if (key === 'cash') setCashVisited(true); setTab(key); }}
              className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors ${
                tab === key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {text}
            </button>
          ))}
        </div>
      </div>

      {shiftClosed && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning/30 bg-warning-soft p-4 text-sm text-warning">
        <p>Este turno fue cerrado desde otro equipo. La venta que ves en pantalla no se puede cobrar en este turno. Consulta el historial antes de abrir otra caja.</p>
        <Button type="button" variant="outline" disabled={operationPending} onClick={() => router.refresh()}>Ir a apertura de caja</Button>
      </div>}
      <div className={tab === 'terminal' ? '' : 'hidden'}>
        <PosTerminal
          shiftId={props.shiftId}
          shiftClosed={shiftClosed}
          onBusyChange={(value) => { busy.current = value; }}
          onPendingChange={setPendingSale}
          warehouseId={props.warehouseId}
          warehouseName={props.warehouseName}
          cashRegisterName={props.cashRegisterName}
          cashierName={props.cashierName}
          companyName={props.companyName}
          companyRut={props.companyRut}
          companyAddress={props.companyAddress}
        />
      </div>

      {tab === 'history' && <ShiftHistoryPanel currentUserId={props.currentUserId} canSupervise={props.canSupervise} />}
      {cashVisited && (
        <div className={tab === 'cash' ? 'print:hidden' : 'hidden'}>
          <CashPanel
            shiftId={props.shiftId}
            cashierName={props.cashierName}
            cashRegisterName={props.cashRegisterName}
            openedAt={props.openedAt}
            active={tab === 'cash'}
            canClose={props.canClose && !shiftClosed}
            canOperate={!shiftClosed}
            onPendingChange={setPendingMovement}
          />
        </div>
      )}
    </div>
  );
}
