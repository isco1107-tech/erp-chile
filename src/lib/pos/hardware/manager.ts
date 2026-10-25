import type { TicketData } from '../ticket';
import { effectiveColumns, isDirectMode, type HardwareConfig } from './config';
import { buildTestPageEscPos, buildTicketEscPos, drawerPulse, type TicketPrintOptions } from './escpos';
import {
  browserSerial,
  browserUsb,
  friendlyHardwareError,
  HardwareError,
  pairSerial,
  pairUsb,
  sendSerial,
  sendUsb,
  type RememberedDevice,
  type SerialApi,
  type UsbApi,
} from './transports';

/**
 * Operaciones sobre el cajón y la impresora de este equipo. REGLA: nada de aquí
 * lanza ni frena una venta. Un cajón desconectado nunca puede dejar una boleta
 * sin emitir ni un cobro sin confirmar: el resultado se informa (`ok: false`
 * con un mensaje para el cajero) y la pantalla ofrece reintentar.
 */
export type HardwareResult = { ok: true } | { ok: false; error: string };
export type PairResult = { ok: true; device: RememberedDevice & { label?: string } } | { ok: false; error: string };

export interface HardwareDeps {
  serial: SerialApi | null;
  usb: UsbApi | null;
  sleep?: (ms: number) => Promise<void>;
}

export interface HardwareManager {
  /** Abre el cajón con un pulso (solo modos directos; en «impresora del sistema» se abre al imprimir). */
  openDrawer(): Promise<HardwareResult>;
  /** Imprime la boleta en ESC/POS por el puerto/USB; con `openDrawer` el pulso va en el mismo trabajo. */
  printTicket(data: TicketData, options?: { openDrawer?: boolean }): Promise<HardwareResult>;
  printTest(options?: { openDrawer?: boolean }): Promise<HardwareResult>;
  /** Pide elegir el dispositivo; solo funciona dentro de un clic del cajero. */
  pair(): Promise<PairResult>;
}

export function browserHardwareDeps(): HardwareDeps {
  return { serial: browserSerial(), usb: browserUsb() };
}

export function createHardwareManager(getConfig: () => HardwareConfig, deps: HardwareDeps): HardwareManager {
  // Un trabajo a la vez: dos pulsos o dos boletas simultáneas se pisarían en el puerto.
  let queue: Promise<unknown> = Promise.resolve();
  const enqueue = <T>(job: () => Promise<T>): Promise<T> => {
    const next = queue.then(job, job);
    queue = next.catch(() => undefined);
    return next;
  };

  function printOptions(config: HardwareConfig, openDrawer: boolean): TicketPrintOptions {
    return {
      columns: effectiveColumns(config),
      codePage: config.codePage,
      cut: config.cut,
      drawer: openDrawer ? { pin: config.drawerPin, pulseMs: config.drawerPulseMs } : undefined,
    };
  }

  async function write(config: HardwareConfig, bytes: Uint8Array): Promise<void> {
    if (config.mode === 'serial') {
      if (!deps.serial) throw new HardwareError('unsupported', 'Este navegador no permite conectar por puerto serie. Usa Chrome o Edge, o el modo «Impresora del sistema».');
      await sendSerial(deps.serial, config.device, config.serialBaud, bytes, deps.sleep);
      return;
    }
    if (config.mode === 'usb') {
      if (!deps.usb) throw new HardwareError('unsupported', 'Este navegador no permite conectar por USB. Usa Chrome o Edge, o el modo «Impresora del sistema».');
      await sendUsb(deps.usb, config.device, bytes);
      return;
    }
    throw new HardwareError('config', 'Elige cómo está conectada la impresora en «Cajón e impresora».');
  }

  function run(build: (config: HardwareConfig) => Uint8Array): Promise<HardwareResult> {
    return enqueue(async (): Promise<HardwareResult> => {
      const config = getConfig();
      try {
        if (!isDirectMode(config.mode)) throw new HardwareError('config', 'Elige cómo está conectada la impresora en «Cajón e impresora».');
        await write(config, build(config));
        return { ok: true };
      } catch (error) {
        return { ok: false, error: friendlyHardwareError(error, config.mode === 'usb' ? 'usb' : 'serial') };
      }
    });
  }

  return {
    openDrawer: () => run((config) => drawerPulse({ pin: config.drawerPin, pulseMs: config.drawerPulseMs })),
    printTicket: (data, options) =>
      run((config) => buildTicketEscPos(data, printOptions(config, options?.openDrawer ?? false))),
    printTest: (options) => run((config) => buildTestPageEscPos(printOptions(config, options?.openDrawer ?? false))),
    async pair(): Promise<PairResult> {
      const config = getConfig();
      try {
        if (config.mode === 'serial') {
          if (!deps.serial) throw new HardwareError('unsupported', 'Este navegador no permite conectar por puerto serie. Usa Chrome o Edge.');
          return { ok: true, device: await pairSerial(deps.serial) };
        }
        if (config.mode === 'usb') {
          if (!deps.usb) throw new HardwareError('unsupported', 'Este navegador no permite conectar por USB. Usa Chrome o Edge.');
          return { ok: true, device: await pairUsb(deps.usb) };
        }
        throw new HardwareError('config', 'Elige primero «Directo por puerto serie» o «Directo por USB».');
      } catch (error) {
        return { ok: false, error: friendlyHardwareError(error, config.mode === 'usb' ? 'usb' : 'serial') };
      }
    },
  };
}
