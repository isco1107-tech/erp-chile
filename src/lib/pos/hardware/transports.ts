/**
 * Conexión directa con la impresora/cajón desde el navegador: Web Serial (puerto
 * COM o USB-serie) y WebUSB. Solo existen en Chrome/Edge sobre HTTPS; las
 * interfaces de abajo describen lo mínimo que usamos para poder probarlas con
 * dispositivos simulados (TypeScript no trae los tipos de estas APIs).
 */
export interface SerialPortLike {
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  readonly writable: { getWriter(): { write(chunk: Uint8Array): Promise<void>; releaseLock(): void } } | null;
  getInfo(): { usbVendorId?: number; usbProductId?: number };
}

export interface SerialApi {
  requestPort(options?: { filters?: { usbVendorId?: number }[] }): Promise<SerialPortLike>;
  getPorts(): Promise<SerialPortLike[]>;
}

export interface UsbEndpointLike {
  endpointNumber: number;
  direction: 'in' | 'out';
  type: 'bulk' | 'interrupt' | 'isochronous';
}

export interface UsbInterfaceLike {
  interfaceNumber: number;
  claimed: boolean;
  alternate: { interfaceClass: number; endpoints: UsbEndpointLike[] };
}

export interface UsbDeviceLike {
  readonly vendorId: number;
  readonly productId: number;
  readonly productName?: string | null;
  readonly opened: boolean;
  readonly configuration: { configurationValue: number; interfaces: UsbInterfaceLike[] } | null;
  open(): Promise<void>;
  close(): Promise<void>;
  selectConfiguration(value: number): Promise<void>;
  claimInterface(interfaceNumber: number): Promise<void>;
  releaseInterface(interfaceNumber: number): Promise<void>;
  transferOut(endpointNumber: number, data: Uint8Array): Promise<{ status: 'ok' | 'stall' | 'babble' }>;
}

export interface UsbApi {
  requestDevice(options: { filters: { classCode?: number }[] }): Promise<UsbDeviceLike>;
  getDevices(): Promise<UsbDeviceLike[]>;
}

export interface RememberedDevice {
  vendorId?: number;
  productId?: number;
}

export type HardwareErrorCode = 'unsupported' | 'needs-pairing' | 'cancelled' | 'denied' | 'busy' | 'io' | 'config';

export class HardwareError extends Error {
  constructor(readonly code: HardwareErrorCode, message: string) {
    super(message);
    this.name = 'HardwareError';
  }
}

const sleepFor = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Mensaje accionable en español; el detalle técnico no se muestra al cajero. */
export function friendlyHardwareError(error: unknown, kind: 'serial' | 'usb'): string {
  if (error instanceof HardwareError) return error.message;
  const name = error instanceof Error ? error.name : '';
  const message = error instanceof Error ? error.message : '';
  if (name === 'NotFoundError') return 'No se eligió ningún dispositivo.';
  if (name === 'SecurityError' || name === 'NotAllowedError') {
    return kind === 'usb' && /access denied|claim/i.test(message)
      ? 'El sistema tiene tomada la impresora con su controlador. Usa el modo «Impresora del sistema», o instala el controlador genérico WinUSB para esta impresora.'
      : 'El navegador no tiene permiso para usar el dispositivo. Pulsa «Conectar» y elígelo de nuevo.';
  }
  if (name === 'NetworkError' || name === 'InvalidStateError') return 'No se pudo escribir en el dispositivo. Revisa que esté encendido, conectado y que ningún otro programa lo esté usando.';
  return 'No se pudo comunicar con el dispositivo. Revisa la conexión y vuelve a intentar.';
}

function matches(info: { vendorId?: number; productId?: number }, remembered: RememberedDevice): boolean {
  if (remembered.vendorId === undefined) return true;
  return info.vendorId === remembered.vendorId && (remembered.productId === undefined || info.productId === remembered.productId);
}

function serialInfo(port: SerialPortLike): { vendorId?: number; productId?: number } {
  const info = port.getInfo();
  return { vendorId: info.usbVendorId, productId: info.usbProductId };
}

/** Pide al cajero elegir el puerto (requiere un clic). El navegador recuerda el permiso. */
export async function pairSerial(api: SerialApi): Promise<RememberedDevice> {
  try {
    const port = await api.requestPort();
    return serialInfo(port);
  } catch (error) {
    if (error instanceof Error && error.name === 'NotFoundError') throw new HardwareError('cancelled', 'No se eligió ningún puerto.');
    throw error;
  }
}

async function findSerialPort(api: SerialApi, remembered: RememberedDevice): Promise<SerialPortLike> {
  const ports = await api.getPorts();
  const exact = remembered.vendorId !== undefined ? ports.find((port) => matches(serialInfo(port), remembered)) : undefined;
  const chosen = exact ?? (ports.length === 1 ? ports[0] : undefined);
  if (!chosen) throw new HardwareError('needs-pairing', 'No hay un puerto autorizado en este equipo. Pulsa «Conectar» y elige el puerto de la impresora.');
  return chosen;
}

/** Escribe en el puerto por tandas: sin control de flujo, una boleta larga desbordaría el búfer de la impresora. */
export async function sendSerial(
  api: SerialApi,
  remembered: RememberedDevice,
  baudRate: number,
  bytes: Uint8Array,
  sleep: (ms: number) => Promise<void> = sleepFor,
): Promise<void> {
  const port = await findSerialPort(api, remembered);
  try {
    await port.open({ baudRate });
  } catch (error) {
    // Ya estaba abierto (otro trabajo que no cerró): se reutiliza.
    if (!(error instanceof Error && error.name === 'InvalidStateError')) throw error;
  }
  try {
    const writable = port.writable;
    if (!writable) throw new HardwareError('io', 'El puerto no admite escritura.');
    const writer = writable.getWriter();
    try {
      for (let offset = 0; offset < bytes.length; offset += 256) {
        await writer.write(bytes.subarray(offset, offset + 256));
        if (offset + 256 < bytes.length) await sleep(15);
      }
    } finally {
      writer.releaseLock();
    }
    // El cierre inmediato podría cortar los últimos bytes en el búfer del sistema.
    await sleep(60);
  } finally {
    await port.close().catch(() => undefined);
  }
}

/** Impresoras USB: clase 7 (impresora) o, en muchas térmicas baratas, clase 255 (específica del fabricante). */
const USB_FILTERS = [{ classCode: 7 }, { classCode: 255 }];

export async function pairUsb(api: UsbApi): Promise<RememberedDevice & { label: string }> {
  try {
    const device = await api.requestDevice({ filters: USB_FILTERS });
    return { vendorId: device.vendorId, productId: device.productId, label: device.productName ?? 'Impresora USB' };
  } catch (error) {
    if (error instanceof Error && error.name === 'NotFoundError') throw new HardwareError('cancelled', 'No se eligió ninguna impresora.');
    throw error;
  }
}

async function findUsbDevice(api: UsbApi, remembered: RememberedDevice): Promise<UsbDeviceLike> {
  const devices = await api.getDevices();
  const exact = remembered.vendorId !== undefined ? devices.find((device) => matches(device, remembered)) : undefined;
  const chosen = exact ?? (devices.length === 1 ? devices[0] : undefined);
  if (!chosen) throw new HardwareError('needs-pairing', 'No hay una impresora USB autorizada en este equipo. Pulsa «Conectar» y elígela.');
  return chosen;
}

/** La interfaz con salida "bulk": primero la de clase impresora, si no cualquiera que la tenga. */
export function pickBulkOutInterface(device: UsbDeviceLike): { interfaceNumber: number; endpointNumber: number } | null {
  const interfaces = device.configuration?.interfaces ?? [];
  const candidates = interfaces
    .map((iface) => ({ iface, endpoint: iface.alternate.endpoints.find((ep) => ep.direction === 'out' && ep.type === 'bulk') }))
    .filter((item): item is { iface: UsbInterfaceLike; endpoint: UsbEndpointLike } => item.endpoint !== undefined);
  const best = candidates.find((item) => item.iface.alternate.interfaceClass === 7) ?? candidates[0];
  return best ? { interfaceNumber: best.iface.interfaceNumber, endpointNumber: best.endpoint.endpointNumber } : null;
}

export async function sendUsb(api: UsbApi, remembered: RememberedDevice, bytes: Uint8Array): Promise<void> {
  const device = await findUsbDevice(api, remembered);
  if (!device.opened) await device.open();
  try {
    if (device.configuration === null) await device.selectConfiguration(1);
    const target = pickBulkOutInterface(device);
    if (!target) throw new HardwareError('io', 'Esta impresora USB no tiene una salida de datos que podamos usar.');
    await device.claimInterface(target.interfaceNumber);
    try {
      const result = await device.transferOut(target.endpointNumber, bytes);
      if (result.status !== 'ok') throw new HardwareError('io', 'La impresora rechazó los datos. Revisa que tenga papel y esté encendida.');
    } finally {
      await device.releaseInterface(target.interfaceNumber).catch(() => undefined);
    }
  } finally {
    await device.close().catch(() => undefined);
  }
}

/** APIs del navegador actual, o `null` si no existen (Firefox, Safari, WebView de escritorio). */
export function browserSerial(): SerialApi | null {
  if (typeof navigator === 'undefined') return null;
  const api = (navigator as unknown as { serial?: SerialApi }).serial;
  return api ?? null;
}

export function browserUsb(): UsbApi | null {
  if (typeof navigator === 'undefined') return null;
  const api = (navigator as unknown as { usb?: UsbApi }).usb;
  return api ?? null;
}
