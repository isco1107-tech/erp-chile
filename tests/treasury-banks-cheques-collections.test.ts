import { detectColumns, lineFingerprints, parseClpAmount, parseStatement, parseStatementDate } from '@/lib/treasury/bank-statement';
import { autoMatch, reconciliationSummary, scoreMatch, suggestMatches, type ReconLine, type ReconPayment } from '@/lib/treasury/reconciliation';
import { addToAging, agingBucket, daysPastDue, describeStage, emptyAging, normalizeReminderDays, reminderStageToSend } from '@/lib/treasury/collections';
import { paymentFileCsv, paymentFileIssues, rutForBank, type PaymentFileItem } from '@/lib/treasury/payment-file';
import { bankName, normalizeAccountNumber } from '@/lib/treasury/banks';
import { bankAccountSchema, chequeSchema, collectionNoteSchema, paymentBatchSchema } from '@/modules/treasury/schema';
import { contactCreateSchema } from '@/modules/contacts/schema';
import { MODULE_KEYS, type CompanyFeatureFlags } from '@/lib/auth/modules';
import { ALL_PERMISSIONS } from '@/lib/auth/permissions';
import { buildAvailableWorkspaceNav, findNavLinkForPath } from '@/lib/navigation/workspace-nav';

describe('cartolas bancarias', () => {
  it('lee montos chilenos en sus distintas formas', () => {
    expect(parseClpAmount('$ 1.234.567')).toBe(1_234_567);
    expect(parseClpAmount('-1.234')).toBe(-1_234);
    expect(parseClpAmount('(15.000)')).toBe(-15_000);
    expect(parseClpAmount('1.234,50')).toBe(1_235);
    expect(parseClpAmount('1234.4')).toBe(1_234);
    expect(parseClpAmount('2.500-')).toBe(-2_500);
    expect(parseClpAmount('1,234,567')).toBe(1_234_567);
    expect(parseClpAmount('')).toBeNull();
    expect(parseClpAmount('Saldo')).toBeNull();
  });

  it('lee fechas de cartola, con y sin año', () => {
    const reference = new Date('2026-09-25T12:00:00Z');
    expect(parseStatementDate('15/09/2026')).toBe('2026-09-15');
    expect(parseStatementDate('15-09-26')).toBe('2026-09-15');
    expect(parseStatementDate('2026-09-15')).toBe('2026-09-15');
    expect(parseStatementDate('15.09.2026')).toBe('2026-09-15');
    expect(parseStatementDate('15/09', reference)).toBe('2026-09-15');
    expect(parseStatementDate('20/12', reference)).toBe('2025-12-20');
    expect(parseStatementDate('31/02/2026')).toBeNull();
    expect(parseStatementDate('Total')).toBeNull();
  });

  it('salta el preámbulo del banco y usa columnas de cargos y abonos', () => {
    const rows = [
      ['Banco Ejemplo'],
      ['Cuenta Corriente N°', '123456789'],
      [''],
      ['Fecha', 'Descripción', 'N° Documento', 'Cargos ($)', 'Abonos ($)', 'Saldo ($)'],
      ['01/09/2026', 'SALDO INICIAL', '', '', '', '1.000.000'],
      ['02/09/2026', 'TRANSF DE COMERCIAL ANDES SPA', '5521', '', '119.000', '1.119.000'],
      ['03/09/2026', 'PAGO PROVEEDOR', '77', '50.000', '', '1.069.000'],
      ['', 'Total', '', '50.000', '119.000', ''],
    ];
    const columns = detectColumns(rows);
    expect(columns).toMatchObject({ headerRow: 3, date: 0, description: 1, reference: 2, debit: 3, credit: 4, balance: 5, amount: null });
    const { lines, skipped } = parseStatement(rows);
    expect(lines).toEqual([
      { date: '2026-09-02', description: 'TRANSF DE COMERCIAL ANDES SPA', reference: '5521', amount: 119_000, balance: 1_119_000 },
      { date: '2026-09-03', description: 'PAGO PROVEEDOR', reference: '77', amount: -50_000, balance: 1_069_000 },
    ]);
    expect(skipped).toBe(2);
  });

  it('acepta una sola columna de monto, con signo o con columna Cargo/Abono', () => {
    const signed = parseStatement([
      ['Fecha', 'Glosa', 'Monto'],
      ['2026-09-10', 'Comisión mantención', '-4.990'],
    ]);
    expect(signed.lines[0]).toMatchObject({ amount: -4_990, description: 'Comisión mantención' });
    const typed = parseStatement([
      ['Fecha', 'Detalle', 'Monto', 'Tipo'],
      ['10/09/2026', 'Depósito', '20.000', 'Abono'],
      ['11/09/2026', 'Giro cajero', '5.000', 'Cargo'],
    ]);
    expect(typed.lines.map((line) => line.amount)).toEqual([20_000, -5_000]);
  });

  it('rechaza un archivo sin columnas reconocibles', () => {
    expect(() => parseStatement([['Nombre', 'Apellido'], ['Ana', 'Pérez']])).toThrow(/No se reconocen/);
  });

  it('dos movimientos idénticos el mismo día tienen huellas distintas, y reimportar da las mismas', () => {
    const line = { date: '2026-09-02', description: 'Transferencia', reference: null, amount: 10_000, balance: null };
    const first = lineFingerprints([line, line]);
    expect(first[0]).not.toBe(first[1]);
    expect(lineFingerprints([line, line])).toEqual(first);
  });
});

describe('conciliación bancaria', () => {
  const line = (overrides: Partial<ReconLine> = {}): ReconLine => ({ id: 'l1', date: '2026-09-02', amount: 119_000, description: 'TRANSF DE COMERCIAL ANDES SPA', reference: '5521', ...overrides });
  const payment = (overrides: Partial<ReconPayment> = {}): ReconPayment => ({
    id: 'p1',
    date: '2026-09-02',
    amount: 119_000,
    referenceNumber: null,
    contactName: 'Comercial Andes SpA',
    isCheque: false,
    ...overrides,
  });

  it('exige mismo monto con signo y una fecha cercana', () => {
    expect(scoreMatch(line(), payment({ amount: 119_001 }))).toBeNull();
    expect(scoreMatch(line(), payment({ amount: -119_000 }))).toBeNull();
    expect(scoreMatch(line(), payment({ date: '2026-08-01' }))).toBeNull();
    // Un cheque puede cobrarse semanas después de registrado.
    expect(scoreMatch(line(), payment({ date: '2026-08-10', isCheque: true }))).not.toBeNull();
  });

  it('sube el puntaje con la misma fecha, la referencia y el nombre del cliente', () => {
    const best = scoreMatch(line(), payment({ referenceNumber: '5521' }))!;
    expect(best.score).toBe(100);
    expect(best.reasons).toEqual(expect.arrayContaining(['Misma fecha', 'Coincide la referencia', 'Menciona al cliente/proveedor']));
    expect(scoreMatch(line({ description: 'DEPOSITO', reference: null }), payment({ date: '2026-09-06' }))!.score).toBe(52);
  });

  it('concilia solo lo inequívoco y no usa un pago dos veces', () => {
    const lines = [line(), line({ id: 'l2', description: 'DEPOSITO', reference: null })];
    const payments = [payment(), payment({ id: 'p2', contactName: 'Otra Empresa', date: '2026-09-02' })];
    // l1 menciona al cliente de p1 → gana claro. l2 empata entre p1 y p2 → no se toca.
    expect(autoMatch(lines, payments)).toEqual([{ lineId: 'l1', paymentId: 'p1', score: 85 }]);
    expect(suggestMatches(lines[1]!, payments)).toHaveLength(2);
  });

  it('la cuadratura explica la diferencia entre banco y libros', () => {
    const summary = reconciliationSummary({
      openingBalance: 1_000_000,
      lines: [
        { amount: 119_000, status: 'MATCHED' },
        { amount: -4_990, status: 'IGNORED' },
        { amount: 30_000, status: 'UNMATCHED' },
      ],
      payments: [
        { amount: 119_000, reconciled: true },
        { amount: 50_000, reconciled: false },
        { amount: -80_000, reconciled: false },
      ],
    });
    expect(summary).toEqual({
      bankBalance: 1_144_010,
      bookBalance: 1_089_000,
      depositsInTransit: 50_000,
      outstandingPayments: 80_000,
      unrecordedBankMovements: 25_010,
      difference: 0,
    });
  });
});

describe('cobranza', () => {
  const today = new Date('2026-09-25T03:00:00Z');
  const due = (iso: string) => new Date(`${iso}T12:00:00Z`);

  it('calcula días de atraso y el tramo de antigüedad', () => {
    expect(daysPastDue(due('2026-09-25'), today)).toBe(-1);
    expect(daysPastDue(due('2026-09-24'), today)).toBe(0);
    expect(daysPastDue(due('2026-08-26'), today)).toBe(29);
    expect(daysPastDue(null, today)).toBe(0);
    expect([0, 1, 30, 31, 61, 91].map(agingBucket)).toEqual(['current', 'd1_30', 'd1_30', 'd31_60', 'd61_90', 'd90_plus']);
    const totals = addToAging(addToAging(emptyAging(), 100, 0), 50, 45);
    expect(totals).toMatchObject({ current: 100, d31_60: 50, total: 150, overdue: 50 });
  });

  it('envía cada hito una vez y una deuda antigua recibe solo el último', () => {
    const stages = [-3, 0, 7, 30];
    expect(reminderStageToSend(-5, stages, [])).toBeNull();
    expect(reminderStageToSend(-3, stages, [])).toBe(-3);
    expect(reminderStageToSend(-2, stages, [-3])).toBeNull();
    expect(reminderStageToSend(0, stages, [-3])).toBe(0);
    // El cron falló el día 7: al día 9 igual se manda ese aviso.
    expect(reminderStageToSend(9, stages, [-3, 0])).toBe(7);
    // Deuda de 90 días al activar la cobranza: un solo aviso (el de 30).
    expect(reminderStageToSend(90, stages, [])).toBe(30);
    expect(reminderStageToSend(95, stages, [30])).toBeNull();
  });

  it('normaliza los hitos configurados', () => {
    expect(normalizeReminderDays([30, -3, 7, 7, 500, -40, 0])).toEqual([-3, 0, 7, 30]);
    expect(describeStage(-3)).toBe('vence en 3 días');
    expect(describeStage(0)).toBe('vence hoy');
    expect(describeStage(1)).toBe('vencido hace 1 día');
  });

  it('una promesa de pago exige fecha', () => {
    expect(collectionNoteSchema.safeParse({ contactId: 'c', kind: 'PROMISE', note: 'Pagará el viernes' }).success).toBe(false);
    expect(collectionNoteSchema.safeParse({ contactId: 'c', kind: 'PROMISE', note: 'Pagará el viernes', promiseDate: '2026-10-02' }).success).toBe(true);
    expect(collectionNoteSchema.safeParse({ contactId: 'c', kind: 'CALL', note: 'No contesta' }).success).toBe(true);
  });
});

describe('nómina de pago a proveedores', () => {
  const item: PaymentFileItem = {
    rut: '76.123.456-7',
    name: 'Proveedora "Sur"; Ltda',
    bankCode: '012',
    accountType: 'CUENTA_CORRIENTE',
    accountNumber: '000-123456',
    email: 'pagos@sur.cl',
    amount: 250_000,
    detail: 'Pago Factura N° 88',
  };

  it('arma el CSV con RUT sin puntos y escapa comillas y separadores', () => {
    const csv = paymentFileCsv([item]);
    const [header, row] = csv.trim().split('\r\n');
    expect(header).toBe('RUT beneficiario;Nombre beneficiario;Código banco;Banco;Tipo de cuenta;Número de cuenta;Monto;Correo aviso;Glosa');
    expect(row).toBe('76123456-7;"Proveedora ""Sur""; Ltda";012;BancoEstado;CTE;000-123456;250000;pagos@sur.cl;Pago Factura N° 88');
  });

  it('evita inyección de fórmulas en el CSV', () => {
    const csv = paymentFileCsv([{ ...item, name: '=HYPERLINK("x")' }]);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
  });

  it('avisa qué proveedores no tienen datos bancarios', () => {
    expect(paymentFileIssues([item])).toEqual([]);
    expect(paymentFileIssues([{ ...item, bankCode: null, accountNumber: '12' }])).toEqual([{ name: item.name, problem: 'falta banco, número de cuenta' }]);
  });

  it('normaliza RUT y cuenta, y nombra bancos por código', () => {
    expect(rutForBank('12.345.678-k')).toBe('12345678-K');
    expect(normalizeAccountNumber(' 00-123 456 ')).toBe('00-123456');
    expect(bankName('037')).toBe('Banco Santander');
    expect(bankName('999')).toBe('Banco 999');
  });

  it('el esquema de la nómina no acepta la misma factura dos veces', () => {
    const base = { bankAccountId: 'b', paymentDate: '2026-09-30' };
    expect(paymentBatchSchema.safeParse({ ...base, items: [{ purchaseDocumentId: 'd', amount: 1 }] }).success).toBe(true);
    expect(paymentBatchSchema.safeParse({ ...base, items: [{ purchaseDocumentId: 'd', amount: 1 }, { purchaseDocumentId: 'd', amount: 2 }] }).success).toBe(false);
  });
});

describe('cheques, cuentas y datos bancarios', () => {
  const cheque = { direction: 'RECEIVED' as const, number: '1234567', bankCode: '016', amount: 50_000, issueDate: '2026-09-25', dueDate: '2026-10-25', documentId: 'doc' };

  it('valida un cheque a fecha', () => {
    expect(chequeSchema.safeParse(cheque).success).toBe(true);
    expect(chequeSchema.safeParse({ ...cheque, dueDate: '2026-09-01' }).success).toBe(false);
    expect(chequeSchema.safeParse({ ...cheque, number: '12A' }).success).toBe(false);
    // Un cheque girado exige la cuenta de origen.
    expect(chequeSchema.safeParse({ ...cheque, direction: 'ISSUED' }).success).toBe(false);
    expect(chequeSchema.safeParse({ ...cheque, direction: 'ISSUED', bankAccountId: 'b' }).success).toBe(true);
    // Sin documento ni contacto no se sabe de quién es.
    expect(chequeSchema.safeParse({ ...cheque, documentId: undefined }).success).toBe(false);
  });

  it('valida la cuenta bancaria propia y los datos bancarios del proveedor', () => {
    expect(bankAccountSchema.safeParse({ name: 'CC Estado', bankCode: '012', accountType: 'CUENTA_CORRIENTE', accountNumber: '123456', openingBalance: 0 }).success).toBe(true);
    expect(bankAccountSchema.safeParse({ name: 'CC', bankCode: '999', accountType: 'CUENTA_CORRIENTE', accountNumber: '123456', openingBalance: 0 }).success).toBe(false);
    const contact = { rut: '76.123.456-0', razonSocial: 'Proveedora Sur' };
    expect(contactCreateSchema.safeParse({ ...contact, bankCode: '012', bankAccountType: 'CUENTA_VISTA', bankAccountNumber: '12345678' }).success).toBe(true);
    expect(contactCreateSchema.safeParse({ ...contact, bankAccountNumber: 'abc' }).success).toBe(false);
  });

  it('las pantallas de tesorería resaltan su propio ítem del menú', () => {
    const allFeatures = Object.fromEntries(MODULE_KEYS.map((key) => [key, true])) as CompanyFeatureFlags;
    const links = buildAvailableWorkspaceNav({ permissions: ALL_PERMISSIONS, features: allFeatures, isSuperAdmin: false }).flatMap((group) => group.links);
    expect(findNavLinkForPath(links, '/dashboard/treasury/banks/abc')?.href).toBe('/dashboard/treasury/banks');
    expect(findNavLinkForPath(links, '/dashboard/treasury/payment-batches/new')?.href).toBe('/dashboard/treasury/payment-batches');
    expect(findNavLinkForPath(links, '/dashboard/treasury/collections')?.href).toBe('/dashboard/treasury/collections');
    expect(findNavLinkForPath(links, '/dashboard/treasury/cheques')?.href).toBe('/dashboard/treasury/cheques');
  });
});
