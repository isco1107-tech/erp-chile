'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ExternalLink, Maximize2, Minimize2, ArrowLeft, Wifi, WifiOff } from 'lucide-react';
import { posHeartbeatAction } from '@/modules/pos/actions/pos.actions';
import { Button } from '@/components/ui/button';
import PosTerminal from './PosTerminal';
import CashPanel from './CashPanel';

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
  companyName: string;
  companyRut: string;
  companyGiro?: string | null;
  companyAddress: string | null;
  /** true si la Supersuite está configurada: la caja reporta latidos mientras esta pantalla esté abierta. */
  reportarLatidos?: boolean;
  /** true cuando se ejecuta desde la App dedicada de Caja (`/pos`) sin menú lateral del ERP. */
  standalone?: boolean;
}

/**
 * Alterna entre vender y arquear sin perder el carrito: cambiar de pestaña
 * mantiene montado el terminal (solo se oculta), porque en un mostrador es
 * normal consultar la caja a media venta.
 */
export default function PosWorkspace(props: Props) {
  const [tab, setTab] = useState<'terminal' | 'cash'>('terminal');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [online, setOnline] = useState(true);
  const [cashRefreshKey, setCashRefreshKey] = useState(0);

  // Monitoreo de la caja: un latido por minuto mientras la pestaña está visible.
  useEffect(() => {
    if (!props.reportarLatidos) return;
    const latir = () => {
      if (document.visibilityState === 'visible') void posHeartbeatAction();
    };
    latir();
    const timer = window.setInterval(latir, LATIDO_MS);
    document.addEventListener('visibilitychange', latir);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', latir);
    };
  }, [props.reportarLatidos]);

  useEffect(() => {
    const syncOnline = () => setOnline(navigator.onLine);
    syncOnline();
    window.addEventListener('online', syncOnline);
    window.addEventListener('offline', syncOnline);
    const onFsChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFsChange);
    return () => {
      window.removeEventListener('online', syncOnline);
      window.removeEventListener('offline', syncOnline);
      document.removeEventListener('fullscreenchange', onFsChange);
    };
  }, []);

  async function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Ignorar si el navegador bloquea fullscreen
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground" data-tutorial="module-header">
              {props.standalone ? `${props.companyName} · Terminal de Caja` : 'Punto de Venta'}
            </h1>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-0.5 text-xs font-medium text-success">
              <span className="size-1.5 rounded-full bg-success" aria-hidden="true" /> Turno abierto
            </span>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                online ? 'bg-muted text-muted-foreground' : 'bg-danger-soft text-danger'
              }`}
            >
              {online ? <Wifi className="size-3" /> : <WifiOff className="size-3" />}
              {online ? 'Conectado al ERP' : 'Sin conexión'}
            </span>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {props.cashRegisterName} ({props.warehouseName}) · {props.cashierName} · abierto{' '}
            {new Date(props.openedAt).toLocaleString('es-CL', {
              dateStyle: 'short',
              timeStyle: 'short',
              timeZone: 'America/Santiago',
            })}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!props.standalone ? (
            <Link
              href="/pos"
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-xs font-medium text-foreground shadow-card transition-colors hover:bg-accent"
              title="Abrir aplicación exclusiva de caja para supermercado (sin barra lateral del ERP)"
            >
              <ExternalLink className="size-3.5" /> App de Caja (Pantalla completa)
            </Link>
          ) : (
            <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void toggleFullscreen()}
                title="Pantalla completa (Kiosco de Caja)"
              >
                {isFullscreen ? (
                  <>
                    <Minimize2 className="mr-1.5 size-3.5" /> Salir pantalla completa
                  </>
                ) : (
                  <>
                    <Maximize2 className="mr-1.5 size-3.5" /> Pantalla completa
                  </>
                )}
              </Button>
              <Link
                href="/dashboard/pos"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                <ArrowLeft className="size-3.5" /> Volver al ERP
              </Link>
            </>
          )}

          <div
            role="tablist"
            aria-label="Vista del punto de venta"
            className="inline-flex rounded-xl border border-border bg-card p-1 shadow-card"
          >
            {(
              [
                ['terminal', 'Caja registradora'],
                ['cash', 'Arqueo, Retiros y Devoluciones'],
              ] as const
            ).map(([key, text]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  tab === key
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {text}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className={tab === 'terminal' ? '' : 'hidden'}>
        <PosTerminal
          shiftId={props.shiftId}
          warehouseId={props.warehouseId}
          warehouseName={props.warehouseName}
          cashRegisterName={props.cashRegisterName}
          cashierName={props.cashierName}
          companyName={props.companyName}
          companyRut={props.companyRut}
          companyGiro={props.companyGiro}
          companyAddress={props.companyAddress}
          onSaleCompleted={() => setCashRefreshKey((k) => k + 1)}
        />
      </div>

      {tab === 'cash' && (
        <div className="print:hidden">
          <CashPanel
            key={cashRefreshKey}
            shiftId={props.shiftId}
            cashierName={props.cashierName}
            cashRegisterName={props.cashRegisterName}
            openedAt={props.openedAt}
            canClose={props.canClose}
          />
        </div>
      )}
    </div>
  );
}
