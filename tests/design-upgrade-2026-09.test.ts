/**
 * Cobertura de la lógica pura agregada en la mejora integral de diseño y
 * producto de septiembre 2026: navegación compartida, idempotencia de ventas,
 * confirmaciones, antigüedad de saldos, balance de 8 columnas, período
 * contable, formulario comercial y timbre PDF417.
 */
import { buildWorkspaceNav } from '@/lib/navigation/workspace-nav';
import { DEFAULT_FEATURES, type CompanyFeatureFlags } from '@/lib/auth/modules';
import { PERMISSIONS, type Permission } from '@/lib/auth/permissions';
import { createIdempotencyTracker } from '@/lib/idempotency';
import { optionsFromMessage } from '@/components/ui/confirm-provider';
import { agingBucket, daysOverdue, summarizeAging } from '@/components/treasury/aging';
import { toEightColumnRow } from '@/modules/accounting/services/books.service';
import { parseAccountingPeriod } from '@/components/accounting/period';
import { buildSalesLeadEmail, salesLeadSchema } from '@/lib/marketing/sales-lead';
import { tedPdf417DataUri } from '@/lib/chile/dte/barcode';

const ALL_FEATURES = Object.fromEntries(Object.keys(DEFAULT_FEATURES).map((key) => [key, true])) as CompanyFeatureFlags;

function hrefs(permissions: Permission[], features: CompanyFeatureFlags = ALL_FEATURES, isSuperAdmin = false): string[] {
  return buildWorkspaceNav({ permissions, features, isSuperAdmin }).flatMap((group) => group.links.map((link) => link.href));
}

describe('buildWorkspaceNav', () => {
  it('sin permisos solo muestra Inicio y el manual', () => {
    expect(hrefs([])).toEqual(['/dashboard', '/dashboard/manual']);
  });

  it('enlaza la escaleta y el vestuario, que antes no tenían ningún acceso', () => {
    const links = hrefs(['production:read']);
    expect(links).toEqual(expect.arrayContaining(['/dashboard/production/timeline', '/dashboard/production/wardrobe', '/dashboard/production/accreditation']));
  });

  it('muestra los libros contables solo con accounting:view y el módulo contratado', () => {
    expect(hrefs(['accounting:view'])).toEqual(expect.arrayContaining(['/dashboard/accounting/journal', '/dashboard/accounting/ledger', '/dashboard/accounting/trial-balance', '/dashboard/accounting/reconciliation']));
    expect(hrefs(['accounting:view'], { ...ALL_FEATURES, hasAccounting: false })).not.toContain('/dashboard/accounting/journal');
    expect(hrefs(['reports:financial'])).not.toContain('/dashboard/accounting/journal');
  });

  it('un módulo no contratado no aparece aunque el rol tenga el permiso', () => {
    expect(hrefs(['pos:operate'], { ...ALL_FEATURES, hasPos: false })).not.toContain('/dashboard/pos');
    expect(hrefs(['pos:operate'])).toContain('/dashboard/pos');
  });

  it('Configuración aparece con cualquiera de sus permisos, no solo los generales', () => {
    expect(hrefs(['dte:manage_caf'])).toContain('/dashboard/settings');
    expect(hrefs(['import:data'])).toContain('/dashboard/settings');
  });

  it('el panel SaaS solo para superadmin', () => {
    expect(hrefs([], ALL_FEATURES, false)).not.toContain('/superadmin');
    expect(hrefs([], ALL_FEATURES, true)).toContain('/superadmin');
  });

  it('no repite rutas', () => {
    const all = hrefs(Object.keys(PERMISSIONS) as Permission[], ALL_FEATURES, true);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('createIdempotencyTracker', () => {
  it('reutiliza la clave mientras el contenido no cambia (reintento de la misma venta)', () => {
    let n = 0;
    const tracker = createIdempotencyTracker(() => `k${++n}`);
    const payload = { items: [{ productId: 'a', quantity: 1 }] };
    expect(tracker.keyFor(payload)).toBe('k1');
    expect(tracker.keyFor({ items: [{ productId: 'a', quantity: 1 }] })).toBe('k1');
  });

  it('genera una clave nueva si el carrito cambió entre intentos', () => {
    let n = 0;
    const tracker = createIdempotencyTracker(() => `k${++n}`);
    tracker.keyFor({ items: [{ productId: 'a', quantity: 1 }] });
    expect(tracker.keyFor({ items: [{ productId: 'a', quantity: 2 }] })).toBe('k2');
  });

  it('después de confirmar, la siguiente venta idéntica es otra operación', () => {
    let n = 0;
    const tracker = createIdempotencyTracker(() => `k${++n}`);
    const payload = { total: 1000 };
    tracker.keyFor(payload);
    tracker.reset();
    expect(tracker.keyFor(payload)).toBe('k2');
  });
});

describe('optionsFromMessage', () => {
  it('usa el verbo de la pregunta como botón y marca destructivas las eliminaciones', () => {
    expect(optionsFromMessage('¿Eliminar este documento?')).toEqual({
      title: '¿Eliminar este documento?',
      description: undefined,
      confirmLabel: 'Eliminar',
      destructive: true,
    });
  });

  it('una emisión no es destructiva', () => {
    const options = optionsFromMessage('¿Emitir este documento? Se aplicará el movimiento de stock/PMP correspondiente.');
    expect(options.confirmLabel).toBe('Emitir');
    expect(options.destructive).toBe(false);
  });

  it('un mensaje largo pasa a la descripción con un título corto', () => {
    const message = 'Se asignará un folio correlativo y se descontará el stock de la bodega seleccionada. ¿Continuar?';
    const options = optionsFromMessage(message);
    expect(options.title).toBe('¿Confirmas esta acción?');
    expect(options.description).toBe(message);
    expect(options.confirmLabel).toBe('Continuar');
  });
});

describe('antigüedad de saldos', () => {
  const now = new Date('2026-09-22T15:00:00Z');

  it('cuenta días de atraso completos y nunca negativos', () => {
    expect(daysOverdue(null, now)).toBe(0);
    expect(daysOverdue('2026-09-30T00:00:00Z', now)).toBe(0);
    expect(daysOverdue('2026-09-12T15:00:00Z', now)).toBe(10);
  });

  it('asigna el tramo correcto en los bordes', () => {
    expect(agingBucket(0)).toBe('current');
    expect(agingBucket(1)).toBe('d1_30');
    expect(agingBucket(30)).toBe('d1_30');
    expect(agingBucket(31)).toBe('d31_60');
    expect(agingBucket(90)).toBe('d61_90');
    expect(agingBucket(91)).toBe('d90_plus');
  });

  it('suma montos y documentos por tramo, ignorando saldos en cero', () => {
    const summary = summarizeAging(
      [
        { balance: 1000, dueDate: '2026-10-01T00:00:00Z' },
        { balance: 500, dueDate: '2026-09-01T00:00:00Z' },
        { balance: 0, dueDate: '2026-01-01T00:00:00Z' },
        { balance: 2000, dueDate: '2026-05-01T00:00:00Z' },
      ],
      now
    );
    expect(summary.current).toEqual({ amount: 1000, count: 1 });
    expect(summary.d1_30).toEqual({ amount: 500, count: 1 });
    expect(summary.d90_plus).toEqual({ amount: 2000, count: 1 });
    expect(summary.d31_60.count + summary.d61_90.count).toBe(0);
  });
});

describe('balance de 8 columnas', () => {
  it('una cuenta de activo deudora va a Saldos-Deudor e Inventario-Activo', () => {
    const row = toEightColumnRow({ id: '1', code: '1101', name: 'Caja', type: 'ASSET' }, 500_000, 120_000);
    expect(row).toMatchObject({ balanceDebit: 380_000, balanceCredit: 0, assets: 380_000, liabilities: 0, losses: 0, gains: 0 });
  });

  it('una cuenta de ingresos acreedora va a Resultados-Ganancias', () => {
    const row = toEightColumnRow({ id: '2', code: '4101', name: 'Ventas', type: 'REVENUE' }, 10_000, 910_000);
    expect(row).toMatchObject({ balanceDebit: 0, balanceCredit: 900_000, assets: 0, liabilities: 0, losses: 0, gains: 900_000 });
  });

  it('un costo deudor va a Resultados-Pérdidas', () => {
    const row = toEightColumnRow({ id: '3', code: '5101', name: 'Costo de ventas', type: 'COST' }, 400_000, 0);
    expect(row).toMatchObject({ losses: 400_000, gains: 0, assets: 0 });
  });
});

describe('parseAccountingPeriod', () => {
  const now = new Date('2026-09-22T15:00:00Z');

  it('usa el mes en curso en Santiago cuando la URL no trae período', () => {
    const period = parseAccountingPeriod({}, now);
    expect(period).toMatchObject({ year: 2026, month: 9, label: 'Septiembre 2026' });
    // Medianoche del 1 de septiembre en Santiago: todavía UTC-4 (el horario de
    // verano de 2026 empieza el sábado 6 de septiembre).
    expect(period.from.toISOString()).toBe('2026-09-01T04:00:00.000Z');
  });

  it('diciembre cierra en el 1 de enero del año siguiente', () => {
    const period = parseAccountingPeriod({ year: '2025', month: '12' }, now);
    expect(period.to.getTime()).toBeGreaterThan(period.from.getTime());
    expect(period.to.toISOString().startsWith('2026-01-01')).toBe(true);
  });

  it('valores inválidos caen al mes en curso, sin lanzar', () => {
    expect(parseAccountingPeriod({ year: 'abc', month: '13' }, now)).toMatchObject({ year: 2026, month: 9 });
  });
});

describe('solicitud comercial del landing', () => {
  const valid = { name: 'Ana Pérez', email: 'Ana@Empresa.cl', phone: '+56 9 1234 5678', company: 'Ferretería El Roble', teamSize: '6 a 20 personas', solutions: ['Ventas e inventario'] };

  it('acepta una solicitud completa y normaliza el correo', () => {
    const parsed = salesLeadSchema.parse(valid);
    expect(parsed.email).toBe('ana@empresa.cl');
  });

  it('rechaza correo inválido, teléfono con letras y áreas desconocidas', () => {
    expect(salesLeadSchema.safeParse({ ...valid, email: 'no-es-correo' }).success).toBe(false);
    expect(salesLeadSchema.safeParse({ ...valid, phone: 'llámame' }).success).toBe(false);
    expect(salesLeadSchema.safeParse({ ...valid, solutions: ['Criptomonedas'] }).success).toBe(false);
  });

  it('el correo a ventas escapa el HTML que escribe el visitante', () => {
    const lead = salesLeadSchema.parse({ ...valid, company: '<script>alert(1)</script>' });
    const email = buildSalesLeadEmail(lead, new Date('2026-09-22T15:00:00Z'));
    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('&lt;script&gt;');
    expect(email.subject).toContain('6 a 20 personas');
  });
});

describe('timbre PDF417', () => {
  const ted = '<TED version="1.0"><DD><RE>76192083-9</RE><TD>33</TD><F>1</F><RSR>ÑANDÚ SPA</RSR></DD><FRMT algoritmo="SHA1withRSA">abc</FRMT></TED>';

  it('genera un SVG embebible para un TED ISO-8859-1', () => {
    const uri = tedPdf417DataUri(ted);
    expect(uri).toMatch(/^data:image\/svg\+xml;base64,/);
    const svg = Buffer.from(uri!.split(',')[1], 'base64').toString('utf8');
    expect(svg).toContain('<svg');
  });

  it('no imprime un código inválido si el TED trae caracteres fuera de ISO-8859-1', () => {
    expect(tedPdf417DataUri(ted.replace('ÑANDÚ', 'EMPRESA €'))).toBeNull();
  });
});
