'use client';

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { createPersistedStore } from '@/lib/pos/persisted-store';
import {
  defaultHardwareConfig,
  HARDWARE_STORAGE_KEY,
  isDirectMode,
  parseHardwareConfig,
  serializeHardwareConfig,
  type HardwareConfig,
} from '@/lib/pos/hardware/config';
import {
  browserHardwareDeps,
  createHardwareManager,
  type HardwareResult,
  type PairResult,
} from '@/lib/pos/hardware/manager';
import type { TicketData } from '@/lib/pos/ticket';

const hardwareStore = createPersistedStore<HardwareConfig>({
  key: HARDWARE_STORAGE_KEY,
  parse: parseHardwareConfig,
  serialize: serializeHardwareConfig,
  fallback: defaultHardwareConfig(),
});

export interface PosHardware {
  config: HardwareConfig;
  update(patch: Partial<HardwareConfig>): void;
  /** Conectado de forma directa (puerto serie o USB): el cajón y la impresora se manejan desde aquí. */
  direct: boolean;
  /** El navegador ofrece estas conexiones (Chrome/Edge sobre HTTPS). */
  supports: { serial: boolean; usb: boolean };
  openDrawer(): Promise<HardwareResult>;
  printTicket(data: TicketData, options?: { openDrawer?: boolean }): Promise<HardwareResult>;
  printTest(options?: { openDrawer?: boolean }): Promise<HardwareResult>;
  /** Elegir el dispositivo; debe llamarse desde un clic. Recuerda el elegido en la configuración. */
  pair(): Promise<PairResult>;
}

const unavailable: HardwareResult = { ok: false, error: 'El cajón no está configurado en este equipo.' };

/** Sin proveedor (arqueo de un turno cerrado, historial): nada que abrir ni imprimir. */
const inert: PosHardware = {
  config: defaultHardwareConfig(),
  update: () => undefined,
  direct: false,
  supports: { serial: false, usb: false },
  openDrawer: async () => unavailable,
  printTicket: async () => unavailable,
  printTest: async () => unavailable,
  pair: async () => ({ ok: false, error: unavailable.error }),
};

const HardwareContext = createContext<PosHardware>(inert);

export function usePosHardware(): PosHardware {
  return useContext(HardwareContext);
}

export function PosHardwareProvider({ children }: { children: ReactNode }) {
  const config = useSyncExternalStore(hardwareStore.subscribe, hardwareStore.getSnapshot, hardwareStore.getServerSnapshot);

  const update = useCallback((patch: Partial<HardwareConfig>) => {
    hardwareStore.set({ ...hardwareStore.getSnapshot(), ...patch });
  }, []);

  // El administrador lee la configuración vigente del almacén en cada trabajo, así no se recrea al cambiarla.
  const manager = useMemo(() => createHardwareManager(() => hardwareStore.getSnapshot(), browserHardwareDeps()), []);

  const pair = useCallback(async (): Promise<PairResult> => {
    const result = await manager.pair();
    if (result.ok) update({ device: result.device });
    return result;
  }, [manager, update]);

  const value = useMemo<PosHardware>(() => {
    const deps = browserHardwareDeps();
    return {
      config,
      update,
      direct: isDirectMode(config.mode),
      supports: { serial: deps.serial !== null, usb: deps.usb !== null },
      openDrawer: manager.openDrawer,
      printTicket: manager.printTicket,
      printTest: manager.printTest,
      pair,
    };
  }, [config, update, manager, pair]);

  return <HardwareContext.Provider value={value}>{children}</HardwareContext.Provider>;
}
