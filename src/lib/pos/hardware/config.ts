import { z } from 'zod';
import type { CodePage } from './escpos';

/**
 * Configuración del cajón y la impresora de ESTE equipo. Vive en el navegador y
 * no en el ERP a propósito: el cajón está enchufado a un computador concreto, y
 * dos cajas de la misma empresa pueden tener impresoras distintas. Si el
 * almacenamiento se borra, la caja vuelve a "sin cajón" y sigue vendiendo.
 */
export const HARDWARE_STORAGE_KEY = 'aether-pos-hardware:v1';

export const HARDWARE_MODES = ['none', 'system', 'serial', 'usb'] as const;
export type HardwareMode = (typeof HARDWARE_MODES)[number];

export const HARDWARE_MODE_LABELS: Record<HardwareMode, string> = {
  none: 'Sin cajón ni impresora conectados',
  system: 'Impresora del sistema (el cajón se abre al imprimir)',
  serial: 'Directo por puerto serie / USB-COM',
  usb: 'Directo por USB',
};

/** Modos que hablan con el equipo sin pasar por el diálogo de impresión del navegador. */
export const DIRECT_MODES: HardwareMode[] = ['serial', 'usb'];

const hardwareConfigSchema = z.object({
  mode: z.enum(HARDWARE_MODES).catch('none'),
  /** Dispositivo autorizado la última vez (para reconectar solo, sin volver a elegirlo). */
  device: z
    .object({ vendorId: z.number().int().optional(), productId: z.number().int().optional(), label: z.string().max(80).optional() })
    .catch({}),
  serialBaud: z.number().int().min(1200).max(115200).catch(9600),
  /** 0 = conector 2 (el habitual), 1 = conector 5. */
  drawerPin: z.union([z.literal(0), z.literal(1)]).catch(0),
  drawerPulseMs: z.number().int().min(10).max(500).catch(50),
  openOnCashSale: z.boolean().catch(true),
  openOnMovement: z.boolean().catch(true),
  printAfterSale: z.boolean().catch(false),
  paperWidth: z.enum(['58', '80']).catch('80'),
  /** Columnas por línea; vacío = las normales del ancho de papel. */
  columns: z.number().int().min(24).max(64).nullable().catch(null),
  codePage: z.enum(['cp858', 'cp850']).catch('cp858'),
  cut: z.boolean().catch(true),
  sounds: z.boolean().catch(true),
});

export type HardwareConfig = z.infer<typeof hardwareConfigSchema>;

export function defaultHardwareConfig(): HardwareConfig {
  return hardwareConfigSchema.parse({});
}

/** Columnas efectivas: la elegida a mano, o las normales del ancho (48 en 80 mm, 32 en 58 mm). */
export function effectiveColumns(config: Pick<HardwareConfig, 'paperWidth' | 'columns'>): number {
  return config.columns ?? (config.paperWidth === '58' ? 32 : 48);
}

export function isDirectMode(mode: HardwareMode): boolean {
  return DIRECT_MODES.includes(mode);
}

/** Lee lo guardado; cualquier campo roto vuelve a su valor de fábrica sin perder el resto. */
export function parseHardwareConfig(raw: string | null): HardwareConfig {
  if (!raw) return defaultHardwareConfig();
  try {
    const data: unknown = JSON.parse(raw);
    return hardwareConfigSchema.parse(data && typeof data === 'object' ? data : {});
  } catch {
    return defaultHardwareConfig();
  }
}

export function serializeHardwareConfig(config: HardwareConfig): string {
  return JSON.stringify(config);
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function browserStorage(): StorageLike | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function loadHardwareConfig(storage: StorageLike | null = browserStorage()): HardwareConfig {
  try {
    return parseHardwareConfig(storage?.getItem(HARDWARE_STORAGE_KEY) ?? null);
  } catch {
    return defaultHardwareConfig();
  }
}

export function saveHardwareConfig(config: HardwareConfig, storage: StorageLike | null = browserStorage()): void {
  try {
    storage?.setItem(HARDWARE_STORAGE_KEY, serializeHardwareConfig(config));
  } catch {
    /* Almacenamiento bloqueado (ventana privada): la configuración vale solo hasta cerrar la pestaña. */
  }
}

export type { CodePage };
