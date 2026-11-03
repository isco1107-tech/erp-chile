'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { HARDWARE_MODE_LABELS, HARDWARE_MODES, effectiveColumns, type HardwareMode } from '@/lib/pos/hardware/config';
import { usePosHardware } from './PosHardwareProvider';

const BAUD_RATES = [9600, 19200, 38400, 57600, 115200];

const selectClass = 'h-10 w-full rounded-xl border border-input bg-muted px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 disabled:opacity-50';

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/**
 * Cajón e impresora de ESTE equipo. Se guarda en el navegador: el cajón está
 * enchufado a un computador concreto, así que cada caja tiene la suya.
 */
export default function HardwareDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const hardware = usePosHardware();
  const pathname = usePathname();
  const insidePosApp = pathname === '/pos' || pathname.startsWith('/pos/');
  const { config, update } = hardware;
  const [busy, setBusy] = useState<'pair' | 'drawer' | 'print' | null>(null);
  const direct = hardware.direct;

  async function run(kind: 'pair' | 'drawer' | 'print') {
    setBusy(kind);
    try {
      if (kind === 'pair') {
        const result = await hardware.pair();
        if (result.ok) toast.success('Dispositivo conectado y recordado en este equipo');
        else toast.error(result.error);
        return;
      }
      const result = kind === 'drawer' ? await hardware.openDrawer() : await hardware.printTest({ openDrawer: false });
      if (result.ok) toast.success(kind === 'drawer' ? 'Pulso enviado. ¿Se abrió el cajón?' : 'Hoja de prueba enviada');
      else toast.error(result.error);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="theme-saas-light max-w-xl">
        <DialogHeader>
          <DialogTitle>Cajón e impresora</DialogTitle>
          <DialogDescription>Vale solo para este equipo. Si no configuras nada, el POS vende igual: la boleta se imprime desde el navegador y el cajón se abre a mano.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label htmlFor="pos-hw-mode" className="text-sm font-medium">¿Cómo está conectado?</label>
            <select
              id="pos-hw-mode"
              className={`${selectClass} mt-1`}
              value={config.mode}
              onChange={(event) => update({ mode: event.target.value as HardwareMode, device: {} })}
            >
              {HARDWARE_MODES.map((mode) => <option key={mode} value={mode}>{HARDWARE_MODE_LABELS[mode]}</option>)}
            </select>
            {config.mode === 'system' && (
              <p className="mt-2 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
                Sirve con cualquier impresora instalada en Windows o Mac. El cajón se abre cuando la impresora imprime la boleta, si en el controlador de la impresora activaste «Abrir cajón» (Preferencias de impresión → Opciones del dispositivo). Activa abajo «Imprimir la boleta al cobrar». Para que no aparezca la ventana de impresión, abre el POS con el acceso directo que incluye la opción <code>--kiosk-printing</code> de Chrome o Edge.
              </p>
            )}
            {(config.mode === 'serial' || config.mode === 'usb') && (
              <div className="mt-2 space-y-2 rounded-lg bg-muted p-3">
                {config.mode === 'serial' && !hardware.supports.serial && <p role="alert" className="text-xs font-medium text-destructive">Este navegador no permite puerto serie. Usa Chrome o Edge, o la impresora del sistema.</p>}
                {config.mode === 'usb' && !hardware.supports.usb && <p role="alert" className="text-xs font-medium text-destructive">Este navegador no permite USB directo. Usa Chrome o Edge, o la impresora del sistema.</p>}
                {config.mode === 'usb' && <p className="text-xs text-muted-foreground">En Windows, el USB directo solo funciona si la impresora tiene el controlador genérico WinUSB; con el controlador del fabricante usa «Impresora del sistema».</p>}
                {/* El permiso de USB solo existe en el POS independiente (`/pos`, ver next.config.js): dentro del ERP el navegador lo bloquea. */}
                {config.mode === 'usb' && !insidePosApp && (
                  <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning/30 bg-warning-soft p-2 text-xs text-warning">
                    <p className="min-w-0 flex-1">Dentro del ERP el navegador no deja usar USB directo. Abre el POS independiente: es el mismo turno (las ventas en espera también se conservan).</p>
                    {/* Carga completa a propósito: el permiso de USB llega con el documento nuevo de `/pos`. */}
                    {/* eslint-disable-next-line @next/next/no-location-assign-relative-destination */}
                    <Button type="button" size="sm" variant="outline" onClick={() => window.location.assign('/pos')}>Abrir el POS independiente</Button>
                  </div>
                )}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm">
                    {config.device.vendorId !== undefined
                      ? <>Dispositivo recordado: <strong>{config.device.label ?? `${config.device.vendorId.toString(16)}:${(config.device.productId ?? 0).toString(16)}`}</strong></>
                      : 'Ningún dispositivo elegido todavía.'}
                  </p>
                  <Button type="button" size="sm" disabled={busy !== null} onClick={() => void run('pair')}>
                    {busy === 'pair' ? 'Conectando…' : config.device.vendorId !== undefined ? 'Elegir otro' : 'Conectar'}
                  </Button>
                </div>
                {config.mode === 'serial' && (
                  <Row label="Velocidad (baudios)" hint="9600 es lo habitual; mira el manual de la impresora.">
                    <select aria-label="Velocidad en baudios" className={`${selectClass} w-28`} value={config.serialBaud} onChange={(event) => update({ serialBaud: Number(event.target.value) })}>
                      {BAUD_RATES.map((rate) => <option key={rate} value={rate}>{rate}</option>)}
                    </select>
                  </Row>
                )}
              </div>
            )}
          </div>

          {config.mode !== 'none' && (
            <div className="divide-y divide-border rounded-xl border border-border px-3">
              <Row label="Abrir el cajón al cobrar en efectivo" hint={direct ? 'Se abre apenas queda emitida la boleta.' : 'En «impresora del sistema» se abre al imprimir la boleta.'}>
                <Switch label="Abrir el cajón al cobrar en efectivo" checked={config.openOnCashSale} onCheckedChange={(openOnCashSale) => update({ openOnCashSale })} />
              </Row>
              <Row label="Abrir el cajón en ingresos y retiros" hint="Al registrar un movimiento de efectivo en el arqueo.">
                <Switch label="Abrir el cajón en ingresos y retiros" checked={config.openOnMovement} onCheckedChange={(openOnMovement) => update({ openOnMovement })} disabled={!direct} />
              </Row>
              <Row label="Imprimir la boleta al cobrar" hint="Sin esto, la boleta se imprime con el botón «Imprimir boleta».">
                <Switch label="Imprimir la boleta al cobrar" checked={config.printAfterSale} onCheckedChange={(printAfterSale) => update({ printAfterSale })} />
              </Row>
            </div>
          )}

          {config.mode === 'system' && config.openOnCashSale && !config.printAfterSale && (
            <p role="status" className="rounded-lg border border-warning/30 bg-warning-soft p-3 text-xs font-medium text-warning">
              Con la impresora del sistema el cajón solo se abre al imprimir. Activa «Imprimir la boleta al cobrar» para que se abra en cada venta en efectivo.
            </p>
          )}

          {direct && (
            <div className="space-y-1 rounded-xl border border-border px-3 py-2">
              <p className="pt-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Ajustes de la impresora</p>
              <Row label="Ancho del papel">
                <select aria-label="Ancho del papel" className={`${selectClass} w-36`} value={config.paperWidth} onChange={(event) => update({ paperWidth: event.target.value === '58' ? '58' : '80', columns: null })}>
                  <option value="80">80 mm (48 columnas)</option>
                  <option value="58">58 mm (32 columnas)</option>
                </select>
              </Row>
              <Row label="Tabla de caracteres" hint="Si las tildes salen mal en la prueba, prueba la otra.">
                <select aria-label="Tabla de caracteres" className={`${selectClass} w-36`} value={config.codePage} onChange={(event) => update({ codePage: event.target.value === 'cp850' ? 'cp850' : 'cp858' })}>
                  <option value="cp858">PC858 (recomendada)</option>
                  <option value="cp850">PC850</option>
                </select>
              </Row>
              <Row label="Cortar el papel al final">
                <Switch label="Cortar el papel al final" checked={config.cut} onCheckedChange={(cut) => update({ cut })} />
              </Row>
              <Row label="Conector del cajón" hint="El 2 es el habitual.">
                <select aria-label="Conector del cajón" className={`${selectClass} w-36`} value={config.drawerPin} onChange={(event) => update({ drawerPin: event.target.value === '1' ? 1 : 0 })}>
                  <option value="0">Conector 2</option>
                  <option value="1">Conector 5</option>
                </select>
              </Row>
              <p className="pb-1 text-xs text-muted-foreground">Líneas de {effectiveColumns(config)} caracteres.</p>
            </div>
          )}

          {direct && (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" disabled={busy !== null} onClick={() => void run('drawer')}>{busy === 'drawer' ? 'Enviando…' : 'Probar el cajón'}</Button>
              <Button type="button" variant="outline" disabled={busy !== null} onClick={() => void run('print')}>{busy === 'print' ? 'Enviando…' : 'Imprimir hoja de prueba'}</Button>
            </div>
          )}

          <Row label="Sonidos" hint="Un pitido al agregar un producto y otro de aviso si el código no existe.">
            <Switch label="Sonidos" checked={config.sounds} onCheckedChange={(sounds) => update({ sounds })} />
          </Row>
        </div>
      </DialogContent>
    </Dialog>
  );
}
