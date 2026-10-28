import {
  buildTestPageEscPos,
  buildTicketEscPos,
  drawerPulse,
  encodeText,
  twoColumns,
  wrapText,
  type TicketPrintOptions,
} from '@/lib/pos/hardware/escpos';
import {
  defaultHardwareConfig,
  effectiveColumns,
  HARDWARE_STORAGE_KEY,
  loadHardwareConfig,
  parseHardwareConfig,
  saveHardwareConfig,
  serializeHardwareConfig,
} from '@/lib/pos/hardware/config';
import { createHardwareManager } from '@/lib/pos/hardware/manager';
import {
  pickBulkOutInterface,
  type SerialApi,
  type SerialPortLike,
  type UsbApi,
  type UsbDeviceLike,
} from '@/lib/pos/hardware/transports';
import type { TicketData } from '@/lib/pos/ticket';

const ascii = (bytes: Uint8Array | number[]): string => String.fromCharCode(...bytes);


/** Quita los comandos ESC/GS y devuelve las líneas de texto (1 byte = 1 carácter en la tabla de la impresora). */
function textLines(bytes: Uint8Array): string[] {
  const lengths: Record<number, Record<number, number>> = {
    0x1b: { 0x40: 2, 0x74: 3, 0x61: 3, 0x45: 3, 0x64: 3, 0x70: 5 },
    0x1d: { 0x21: 3, 0x56: 3 },
  };
  const lines: string[] = [];
  let current = '';
  for (let i = 0; i < bytes.length; ) {
    const byte = bytes[i];
    const command = lengths[byte]?.[bytes[i + 1]];
    if (command) { i += command; continue; }
    if (byte === 0x0a) { lines.push(current); current = ''; } else current += String.fromCharCode(byte);
    i += 1;
  }
  return lines;
}

const ticket: TicketData = {
  companyName: 'Almacén Ñandú Ltda.',
  companyRut: '76.123.456-7',
  companyAddress: 'Av. Providencia 1234, Santiago',
  folio: 1523,
  stamped: false,
  issuedAt: new Date('2026-10-25T18:30:00Z'),
  cashierName: 'María Pérez',
  customerName: 'Consumidor Final',
  customerRut: '66.666.666-6',
  lines: [
    { description: 'Leche entera 1 L', sku: 'LECHE', quantity: 2, unitPrice: 840, subtotal: 1680, isExempt: false },
    { description: 'Galletas de avena integral con chips de chocolate extra grandes', sku: 'GAL', quantity: 0.5, unitPrice: 700, subtotal: 350, isExempt: true },
  ],
  netAmount: 1680,
  exemptAmount: 350,
  ivaAmount: 319,
  totalAmount: 2349,
  paymentMethodLabel: 'Efectivo',
  cashReceived: 5000,
  changeDue: 2651,
};

const options: TicketPrintOptions = { columns: 48, codePage: 'cp858', cut: true };

describe('ESC/POS: pulso del cajón', () => {
  it('genera el comando clásico ESC p 0 25 250', () => {
    expect([...drawerPulse()]).toEqual([0x1b, 0x70, 0x00, 0x19, 0xfa]);
  });

  it('usa el otro conector y limita la duración al rango del comando', () => {
    expect([...drawerPulse({ pin: 1, pulseMs: 100 })]).toEqual([0x1b, 0x70, 0x01, 50, 0xfa]);
    expect(drawerPulse({ pulseMs: 100000 })[3]).toBe(255);
    expect(drawerPulse({ pulseMs: 0 })[3]).toBe(1);
  });
});

describe('ESC/POS: texto en español', () => {
  it('codifica tildes, ñ y signos de apertura en la página 858', () => {
    expect(encodeText('áéíóú', 'cp858')).toEqual([0xa0, 0x82, 0xa1, 0xa2, 0xa3]);
    expect(encodeText('ñÑ¿¡', 'cp858')).toEqual([0xa4, 0xa5, 0xa8, 0xad]);
    expect(encodeText('ÁÉÍÓÚüÜ', 'cp858')).toEqual([0xb5, 0x90, 0xd6, 0xe0, 0xe9, 0x81, 0x9a]);
    expect(encodeText('N°', 'cp858')).toEqual([0x4e, 0xf8]);
  });

  it('el euro solo existe en 858 y en 850 sale como ?', () => {
    expect(encodeText('€', 'cp858')).toEqual([0xd5]);
    expect(encodeText('€', 'cp850')).toEqual([0x3f]);
  });

  it('reemplaza comillas y guiones tipográficos y nunca rompe con símbolos raros', () => {
    expect(ascii(encodeText('“hola” – mundo…', 'cp858'))).toBe('"hola" - mundo...');
    expect(encodeText('日本', 'cp858')).toEqual([0x3f, 0x3f]);
    expect(encodeText('a\u0007b', 'cp858')).toEqual([0x61, 0x20, 0x62]);
  });

  it('cualquier espacio Unicode sale como espacio, no como ?', () => {
    expect(encodeText('3:30\u202fp.\u00a0m.', 'cp858')).toEqual(encodeText('3:30 p. m.', 'cp858'));
  });

  it('parte líneas largas sin cortar palabras', () => {
    expect(wrapText('uno dos tres', 7)).toEqual(['uno dos', 'tres']);
    expect(wrapText('supercalifragilistico', 8)).toEqual(['supercal', 'ifragili', 'stico']);
    expect(twoColumns('Neto', '$1.680', 20)).toEqual(['Neto          $1.680']);
    const split = twoColumns('Galletas de avena integral con chips', '$350', 24);
    expect(split.length).toBeGreaterThan(1);
    expect(split.every((line) => line.length <= 24)).toBe(true);
  });
});

describe('ESC/POS: boleta', () => {
  const bytes = buildTicketEscPos(ticket, options);
  const text = ascii(bytes);

  it('abre con inicialización y tabla de caracteres, y cierra con corte', () => {
    expect([...bytes.slice(0, 5)]).toEqual([0x1b, 0x40, 0x1b, 0x74, 19]);
    expect([...bytes.slice(-3)]).toEqual([0x1d, 0x56, 0x01]);
  });

  it('la fecha sale en 24 horas, hora de Santiago, sin signos raros', () => {
    // 18:30 UTC del 25-10-2026 es 15:30 en Santiago (UTC-3 en horario de verano).
    expect(text).toContain('Fecha: 25-10-2026 15:30');
    expect(text).not.toContain('?');
  });

  it('sin timbre no se presenta como boleta', () => {
    expect(text).toContain('COMPROBANTE DE VENTA');
    expect(text).toContain('Sin validez tributaria');
    expect(text).not.toContain('BOLETA ELECTR');
  });

  it('timbrada se titula boleta y avisa que falta el envío al SII', () => {
    const stamped = ascii(buildTicketEscPos({ ...ticket, stamped: true }, options));
    expect(stamped).toContain('BOLETA ELECTR');
    expect(stamped).toContain('Pendiente de env');
  });

  it('trae los datos de la venta', () => {
    expect(text).toContain('RUT 76.123.456-7');
    expect(text).toContain('Atiende: Mar');
    expect(text).toContain('$2.349');
    expect(text).toContain('$5.000');
    expect(text).toContain('$2.651');
    expect(text).toContain('0,5 x $700 (E)');
    expect(text).toContain('Exento (E)');
  });

  it('ninguna línea supera las columnas del papel', () => {
    const longTicket: TicketData = {
      ...ticket,
      companyName: 'Comercializadora e Inversiones Hermanos González y Compañía Limitada',
      companyAddress: 'Avenida Libertador Bernardo O\'Higgins 12345, oficina 678, Santiago Centro',
      lines: [
        { description: 'Producto con un nombre larguísimo que no cabe en una sola línea del papel', sku: 'X', quantity: 1234.5, unitPrice: 1234567, subtotal: 1524074000, isExempt: false },
        ...ticket.lines,
      ],
    };
    for (const width of [32, 42, 48]) {
      const lines = textLines(buildTicketEscPos(longTicket, { ...options, columns: width }));
      expect(lines.length).toBeGreaterThan(10);
      expect(Math.max(...lines.map((line) => line.length))).toBeLessThanOrEqual(width);
    }
  });

  it('sin corte alimenta más papel y no manda el comando de corte', () => {
    const uncut = buildTicketEscPos(ticket, { ...options, cut: false });
    expect([...uncut.slice(-3)]).not.toEqual([0x1d, 0x56, 0x01]);
  });

  it('con cajón, el pulso va al inicio del trabajo', () => {
    const withDrawer = buildTicketEscPos(ticket, { ...options, drawer: { pin: 0, pulseMs: 50 } });
    expect([...withDrawer.slice(5, 10)]).toEqual([0x1b, 0x70, 0x00, 0x19, 0xfa]);
  });

  it('una venta sin vuelto no imprime la línea de vuelto', () => {
    const exact = ascii(buildTicketEscPos({ ...ticket, changeDue: 0 }, options));
    expect(exact).not.toContain('Vuelto');
  });

  it('la hoja de prueba muestra la regla de columnas y los caracteres', () => {
    const page = ascii(buildTestPageEscPos(options, new Date('2026-10-25T18:30:00Z')));
    expect(page).toContain('Ancho: 48 columnas');
    expect(page).toContain('123456789012345678901234567890123456789012345678');
  });
});

describe('configuración del equipo', () => {
  it('valores de fábrica: sin cajón, 80 mm, tabla 858, sonidos activos', () => {
    const config = defaultHardwareConfig();
    expect(config).toMatchObject({ mode: 'none', paperWidth: '80', codePage: 'cp858', sounds: true, openOnCashSale: true, printAfterSale: false });
    expect(effectiveColumns(config)).toBe(48);
    expect(effectiveColumns({ paperWidth: '58', columns: null })).toBe(32);
    expect(effectiveColumns({ paperWidth: '58', columns: 42 })).toBe(42);
  });

  it('un campo roto vuelve a su valor sin perder el resto', () => {
    const config = parseHardwareConfig(JSON.stringify({ mode: 'serial', serialBaud: 'rápido', drawerPin: 7, printAfterSale: true }));
    expect(config).toMatchObject({ mode: 'serial', serialBaud: 9600, drawerPin: 0, printAfterSale: true });
    expect(parseHardwareConfig('no es json').mode).toBe('none');
    expect(parseHardwareConfig('[1,2]').mode).toBe('none');
    expect(parseHardwareConfig(null).mode).toBe('none');
  });

  it('guarda y recupera desde el almacenamiento, y tolera que esté bloqueado', () => {
    const store = new Map<string, string>();
    const storage = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => void store.set(key, value) };
    const config = { ...defaultHardwareConfig(), mode: 'usb' as const, device: { vendorId: 1208, productId: 514, label: 'Epson TM-T20' } };
    saveHardwareConfig(config, storage);
    expect(store.get(HARDWARE_STORAGE_KEY)).toBe(serializeHardwareConfig(config));
    expect(loadHardwareConfig(storage)).toEqual(config);
    const blocked = { getItem: () => { throw new Error('bloqueado'); }, setItem: () => { throw new Error('bloqueado'); } };
    expect(() => saveHardwareConfig(config, blocked)).not.toThrow();
    expect(loadHardwareConfig(blocked).mode).toBe('none');
  });
});

function fakeSerial(options: { failWrite?: boolean; ports?: number } = {}) {
  const written: number[][] = [];
  const events: string[] = [];
  const makePort = (vendor: number): SerialPortLike => ({
    getInfo: () => ({ usbVendorId: vendor, usbProductId: 1 }),
    open: async ({ baudRate }) => { events.push(`open:${baudRate}`); },
    close: async () => { events.push('close'); },
    writable: {
      getWriter: () => ({
        write: async (chunk: Uint8Array) => { if (options.failWrite) { const e = new Error('x'); e.name = 'NetworkError'; throw e; } written.push([...chunk]); },
        releaseLock: () => { events.push('release'); },
      }),
    },
  });
  const ports = Array.from({ length: options.ports ?? 1 }, (_, i) => makePort(100 + i));
  const api: SerialApi = { requestPort: async () => ports[0], getPorts: async () => ports };
  return { api, written, events };
}

function fakeUsb(options: { claimFails?: boolean; status?: 'ok' | 'stall' } = {}) {
  const sent: { endpoint: number; data: number[] }[] = [];
  const events: string[] = [];
  const device: UsbDeviceLike = {
    vendorId: 1208, productId: 514, productName: 'TM-T20', opened: false,
    configuration: { configurationValue: 1, interfaces: [
      { interfaceNumber: 0, claimed: false, alternate: { interfaceClass: 255, endpoints: [{ endpointNumber: 5, direction: 'in', type: 'bulk' }] } },
      { interfaceNumber: 1, claimed: false, alternate: { interfaceClass: 7, endpoints: [{ endpointNumber: 1, direction: 'in', type: 'bulk' }, { endpointNumber: 2, direction: 'out', type: 'bulk' }] } },
    ] },
    open: async () => { events.push('open'); },
    close: async () => { events.push('close'); },
    selectConfiguration: async () => { events.push('select'); },
    claimInterface: async (n) => { if (options.claimFails) { const e = new Error('Access denied'); e.name = 'SecurityError'; throw e; } events.push(`claim:${n}`); },
    releaseInterface: async (n) => { events.push(`release:${n}`); },
    transferOut: async (endpoint, data) => { sent.push({ endpoint, data: [...data] }); return { status: options.status ?? 'ok' }; },
  };
  const api: UsbApi = { requestDevice: async () => device, getDevices: async () => [device] };
  return { api, sent, events, device };
}

const noWait = async () => undefined;

describe('administrador del cajón y la impresora', () => {
  it('abre el cajón por puerto serie con el pulso configurado', async () => {
    const serial = fakeSerial();
    const config = { ...defaultHardwareConfig(), mode: 'serial' as const, serialBaud: 19200, drawerPin: 1 as const };
    const manager = createHardwareManager(() => config, { serial: serial.api, usb: null, sleep: noWait });
    await expect(manager.openDrawer()).resolves.toEqual({ ok: true });
    expect(serial.written).toEqual([[0x1b, 0x70, 0x01, 25, 0xfa]]);
    expect(serial.events).toEqual(['open:19200', 'release', 'close']);
  });

  it('imprime la boleta y abre el cajón en el mismo trabajo', async () => {
    const serial = fakeSerial();
    const config = { ...defaultHardwareConfig(), mode: 'serial' as const };
    const manager = createHardwareManager(() => config, { serial: serial.api, usb: null, sleep: noWait });
    await expect(manager.printTicket(ticket, { openDrawer: true })).resolves.toEqual({ ok: true });
    const all = serial.written.flat();
    expect(all.slice(5, 10)).toEqual([0x1b, 0x70, 0x00, 0x19, 0xfa]);
    expect(ascii(all)).toContain('$2.349');
  });

  it('manda a la interfaz de impresora por USB y la libera', async () => {
    const usb = fakeUsb();
    const config = { ...defaultHardwareConfig(), mode: 'usb' as const, device: { vendorId: 1208, productId: 514 } };
    const manager = createHardwareManager(() => config, { serial: null, usb: usb.api });
    await expect(manager.openDrawer()).resolves.toEqual({ ok: true });
    expect(usb.sent).toEqual([{ endpoint: 2, data: [0x1b, 0x70, 0x00, 0x19, 0xfa] }]);
    expect(usb.events).toEqual(['open', 'claim:1', 'release:1', 'close']);
    expect(pickBulkOutInterface(usb.device)).toEqual({ interfaceNumber: 1, endpointNumber: 2 });
  });

  it('un cajón que falla informa el motivo y NO lanza', async () => {
    const failing = fakeSerial({ failWrite: true });
    const cfg = { ...defaultHardwareConfig(), mode: 'serial' as const };
    const bad = createHardwareManager(() => cfg, { serial: failing.api, usb: null, sleep: noWait });
    const result = await bad.openDrawer();
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/encendido|conectado/);
    expect(failing.events).toContain('close');

    const denied = fakeUsb({ claimFails: true });
    const usbCfg = { ...defaultHardwareConfig(), mode: 'usb' as const };
    const withUsb = createHardwareManager(() => usbCfg, { serial: null, usb: denied.api });
    const usbResult = await withUsb.openDrawer();
    expect(!usbResult.ok && usbResult.error).toMatch(/Impresora del sistema/);
    expect(denied.events).toContain('close');

    const stall = fakeUsb({ status: 'stall' });
    const stalled = await createHardwareManager(() => usbCfg, { serial: null, usb: stall.api }).openDrawer();
    expect(!stalled.ok && stalled.error).toMatch(/rechazó/);
  });

  it('sin API del navegador, sin dispositivo autorizado o sin modo, explica qué hacer', async () => {
    const serialCfg = { ...defaultHardwareConfig(), mode: 'serial' as const };
    const noApi = await createHardwareManager(() => serialCfg, { serial: null, usb: null }).openDrawer();
    expect(!noApi.ok && noApi.error).toMatch(/Chrome o Edge/);

    const two = fakeSerial({ ports: 2 });
    const ambiguous = await createHardwareManager(() => serialCfg, { serial: two.api, usb: null, sleep: noWait }).openDrawer();
    expect(!ambiguous.ok && ambiguous.error).toMatch(/Conectar/);

    const none = await createHardwareManager(() => defaultHardwareConfig(), { serial: null, usb: null }).openDrawer();
    expect(!none.ok && none.error).toMatch(/Cajón e impresora/);
  });

  it('con varios puertos usa el que se recordó', async () => {
    const two = fakeSerial({ ports: 2 });
    const cfg = { ...defaultHardwareConfig(), mode: 'serial' as const, device: { vendorId: 101, productId: 1 } };
    await expect(createHardwareManager(() => cfg, { serial: two.api, usb: null, sleep: noWait }).openDrawer()).resolves.toEqual({ ok: true });
  });

  it('empareja y devuelve el dispositivo para recordarlo', async () => {
    const serial = fakeSerial();
    const serialCfg = { ...defaultHardwareConfig(), mode: 'serial' as const };
    const paired = await createHardwareManager(() => serialCfg, { serial: serial.api, usb: null }).pair();
    expect(paired).toEqual({ ok: true, device: { vendorId: 100, productId: 1 } });
    const usb = fakeUsb();
    const usbCfg = { ...defaultHardwareConfig(), mode: 'usb' as const };
    const pairedUsb = await createHardwareManager(() => usbCfg, { serial: null, usb: usb.api }).pair();
    expect(pairedUsb).toEqual({ ok: true, device: { vendorId: 1208, productId: 514, label: 'TM-T20' } });
    const cancel: SerialApi = { requestPort: async () => { const e = new Error('x'); e.name = 'NotFoundError'; throw e; }, getPorts: async () => [] };
    const cancelled = await createHardwareManager(() => serialCfg, { serial: cancel, usb: null }).pair();
    expect(!cancelled.ok && cancelled.error).toMatch(/No se eligió/);
  });

  it('serializa los trabajos: dos pulsos seguidos no se pisan en el puerto', async () => {
    const serial = fakeSerial();
    const cfg = { ...defaultHardwareConfig(), mode: 'serial' as const };
    const manager = createHardwareManager(() => cfg, { serial: serial.api, usb: null, sleep: noWait });
    await Promise.all([manager.openDrawer(), manager.openDrawer(), manager.printTest()]);
    // Cada trabajo abre y cierra por completo antes de que empiece el siguiente.
    const sequence = serial.events.join(',');
    expect(sequence).toBe('open:9600,release,close,open:9600,release,close,open:9600,release,close');
  });
});

describe('permiso de USB del navegador', () => {
  const nextConfig = require('../next.config.js') as { headers: () => Promise<{ source: string; headers: { key: string; value: string }[] }[]> };
  const policy = (entry: { headers: { key: string; value: string }[] } | undefined) =>
    entry?.headers.find((header) => header.key === 'Permissions-Policy')?.value ?? '';

  it('solo el POS independiente abre usb, después de la política global, y no abre nada más', async () => {
    const entries = await nextConfig.headers();
    const globalIndex = entries.findIndex((entry) => entry.source === '/((?!epione(?:/|$)|hermes(?:/|$)).*)');
    const posIndex = entries.findIndex((entry) => entry.source === '/pos/:path*');
    expect(globalIndex).toBeGreaterThanOrEqual(0);
    expect(posIndex).toBeGreaterThan(globalIndex); // la última clave repetida gana
    expect(policy(entries[globalIndex])).toContain('usb=()');
    const pos = policy(entries[posIndex]);
    expect(pos).toContain('usb=(self)');
    for (const closed of ['camera=()', 'microphone=()', 'geolocation=()', 'payment=()']) expect(pos).toContain(closed);
    // Ninguna otra pantalla abre USB.
    const opened = entries.filter((entry) => policy(entry).includes('usb=(self)')).map((entry) => entry.source);
    expect(opened).toEqual(['/pos/:path*']);
  });
});
