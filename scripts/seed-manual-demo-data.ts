/**
 * Datos de ejemplo para las capturas del Manual de Usuario
 * (`scripts/capture-manual-screenshots.ts`). Llena la empresa de demo que crea
 * `scripts/seed-manual-demo.ts` con clientes, productos, compras, ventas,
 * un certamen, personas, finanzas, etc., para que cada pantalla del manual
 * se vea con contenido real y no vacía.
 *
 * Todo se crea con los MISMOS servicios que usan las pantallas (nunca con
 * inserts sueltos), así el Kardex, los folios, el PMP y los saldos quedan
 * coherentes.
 *
 * SOLO contra una base LOCAL: la `DATABASE_URL` del `.env` del proyecto es la
 * de producción (CLAUDE.md, Sección 5), así que este script se niega a correr
 * si el host no es localhost. Uso:
 *
 *   DATABASE_URL=postgresql://postgres@localhost:5433/erp_manual \
 *     npx tsx --conditions=react-server scripts/seed-manual-demo-data.ts
 *
 * (`--conditions=react-server` permite importar servicios marcados `server-only`).
 */
import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import { formatRut } from '../src/lib/chile/rut';
import { contactCreateSchema } from '../src/modules/contacts/schema';
import { createContact } from '../src/modules/contacts/services/contacts.service';
import { categoryCreateSchema, productCreateSchema, warehouseCreateSchema } from '../src/modules/inventory/schema';
import { createCategory, createProduct } from '../src/modules/inventory/services/products.service';
import { createWarehouse } from '../src/modules/inventory/services/stock.service';
import { purchaseDocumentCreateSchema } from '../src/modules/purchases/schema';
import { createPurchaseDocument } from '../src/modules/purchases/services/purchases.service';
import { salesDocumentCreateSchema, salesOrderCreateSchema, priceListSchema } from '../src/modules/sales/schema';
import { createSalesDocument } from '../src/modules/sales/services/sales.service';
import { createSalesOrder } from '../src/modules/sales/services/sales-orders.service';
import { assignPriceListToContact, createPriceList, fillPriceListFromCatalog } from '../src/modules/sales/services/price-lists.service';
import { registerPaymentSchema, bankAccountSchema, chequeSchema } from '../src/modules/treasury/schema';
import { registerPurchasePayment, registerSalesPayment } from '../src/modules/treasury/services/treasury.service';
import { createBankAccount } from '../src/modules/treasury/services/banks.service';
import { createCheque } from '../src/modules/treasury/services/cheques.service';
import { cashRegisterCreateSchema, openShiftSchema, posSaleSchema } from '../src/modules/pos/schema';
import { createCashRegister, openShift } from '../src/modules/pos/services/cash.service';
import { createPosSale } from '../src/modules/pos/services/pos.service';
import { opportunityCreateSchema } from '../src/modules/crm/schema';
import { createOpportunity } from '../src/modules/crm/services/crm.service';
import { taskSchema } from '../src/modules/tasks/schema';
import { createTask } from '../src/modules/tasks/services/tasks.service';
import { projectCreateSchema } from '../src/modules/projects/schema';
import { createProject } from '../src/modules/projects/services/projects.service';
import { candidateCreateSchema } from '../src/modules/candidates/schema';
import { createCandidate } from '../src/modules/candidates/services/candidates.service';
import { deliverableCreateSchema, sponsorshipContractCreateSchema, sponsorshipPackageSchema } from '../src/modules/sponsorships/schema';
import { addDeliverable, createSponsorshipContract } from '../src/modules/sponsorships/services/sponsorships.service';
import { createPackage } from '../src/modules/sponsorships/services/packages.service';
import { employeeSchema } from '../src/modules/hr/schema';
import { createEmployee } from '../src/modules/hr/services/employees.service';
import { budgetCreateSchema, budgetLineCreateSchema } from '../src/modules/budgets/schema';
import { addBudgetLine, createBudget } from '../src/modules/budgets/services/budgets.service';
import { promissoryNoteCreateSchema } from '../src/modules/promissory-notes/schema';
import { createPromissoryNote } from '../src/modules/promissory-notes/services/promissory-notes.service';
import { feeDocumentCreateSchema } from '../src/modules/fees/schema';
import { createFeeDocument } from '../src/modules/fees/services/fees.service';
import { fixedAssetSchema } from '../src/modules/fixed-assets/schema';
import { createAsset } from '../src/modules/fixed-assets/services/fixed-assets.service';
import { expenseItemSchema, expenseReportSchema } from '../src/modules/expenses/schema';
import { addItem, createReport } from '../src/modules/expenses/services/expenses.service';
import { procedureSchema } from '../src/modules/quality/schema';
import { createProcedure } from '../src/modules/quality/services/quality.service';
import { createWebSiteSchema } from '../src/modules/web-sites/schema';
import { createWebSite } from '../src/modules/web-sites/services/web-sites.service';
import { paymentPlanCreateSchema } from '../src/modules/payment-plans/schema';
import { createPaymentPlan } from '../src/modules/payment-plans/services/payment-plans.service';
import { MANUAL_DEMO_ADMIN_EMAIL } from './manual-demo-constants';

const DEMO_COMPANY_RUT = formatRut('99999999-9');

function assertLocalDatabase(): void {
  const url = process.env.DATABASE_URL ?? '';
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    // URL inválida: se trata igual que una remota.
  }
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
    console.error('seed-manual-demo-data: solo corre contra una base local (DATABASE_URL apunta a otro host). Abortado.');
    process.exit(1);
  }
}

/** RUT válido (módulo 11) a partir del cuerpo numérico. */
function rut(body: number): string {
  let sum = 0;
  let factor = 2;
  for (const digit of String(body).split('').reverse()) {
    sum += Number(digit) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const rest = 11 - (sum % 11);
  const dv = rest === 11 ? '0' : rest === 10 ? 'K' : String(rest);
  return formatRut(`${body}-${dv}`);
}

function isoDay(offsetDays: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

async function main() {
  assertLocalDatabase();

  const company = await prisma.company.findUnique({ where: { rut: DEMO_COMPANY_RUT } });
  const owner = await prisma.user.findUnique({ where: { email: MANUAL_DEMO_ADMIN_EMAIL } });
  if (!company || !owner) throw new Error('Primero corre scripts/seed-manual-demo.ts');
  const companyId = company.id;

  if ((await prisma.product.count({ where: { companyId } })) > 0) {
    console.log('La empresa de demo ya tiene datos: nada que hacer.');
    return;
  }

  await prisma.company.update({
    where: { id: companyId },
    data: { businessName: 'Empresa Demo Aether SpA', giro: 'Venta de café e insumos de cafetería, y producción de eventos', address: 'Av. Providencia 1234, Of. 501', comuna: 'Providencia' },
  });

  // ── Contactos ────────────────────────────────────────────────────────────
  const customers = [
    { razonSocial: 'Cafetería El Molino SpA', body: 76123456, giro: 'Cafetería', email: 'compras@elmolino.cl', comuna: 'Ñuñoa', creditLimit: 2_500_000, creditDays: 30 },
    { razonSocial: 'Restaurante Costa Azul Limitada', body: 77234567, giro: 'Restaurante', email: 'pagos@costaazul.cl', comuna: 'Viña del Mar', creditLimit: 1_500_000, creditDays: 30 },
    { razonSocial: 'Hotel Cordillera SpA', body: 76345678, giro: 'Hotelería', email: 'abastecimiento@hotelcordillera.cl', comuna: 'Las Condes', creditLimit: 5_000_000, creditDays: 45 },
    { razonSocial: 'Distribuidora Sur Limitada', body: 78456789, giro: 'Distribución de alimentos', email: 'contacto@distsur.cl', comuna: 'Temuco', creditLimit: 3_000_000, creditDays: 30 },
    { razonSocial: 'Colegio Los Alerces', body: 65567890, giro: 'Educación', email: 'administracion@colegiolosalerces.cl', comuna: 'Puente Alto' },
    { razonSocial: 'María José Fuentes Rojas', body: 16789012, giro: 'Particular', email: 'mjfuentes@correo.cl', comuna: 'Santiago' },
  ];
  const suppliers = [
    { razonSocial: 'Tostaduría Andina SpA', body: 76901234, giro: 'Tostaduría de café', email: 'ventas@tostaduriaandina.cl' },
    { razonSocial: 'Envases del Pacífico S.A.', body: 96012345, giro: 'Fabricación de envases', email: 'ventas@envasespacifico.cl' },
    { razonSocial: 'Lácteos Valle Verde Limitada', body: 77123450, giro: 'Productos lácteos', email: 'pedidos@valleverde.cl' },
    { razonSocial: 'Viña Santa Clara SpA', body: 76543210, giro: 'Viña', email: 'marketing@vinasantaclara.cl' },
  ];
  const customerIds: string[] = [];
  for (const c of customers) {
    const contact = await createContact(
      companyId,
      contactCreateSchema.parse({ rut: rut(c.body), razonSocial: c.razonSocial, giro: c.giro, email: c.email, comuna: c.comuna, isCustomer: true, creditLimit: c.creditLimit ?? null, creditDays: c.creditDays ?? 0 })
    );
    customerIds.push(contact.id);
  }
  const supplierIds: string[] = [];
  for (const s of suppliers) {
    const contact = await createContact(
      companyId,
      contactCreateSchema.parse({ rut: rut(s.body), razonSocial: s.razonSocial, giro: s.giro, email: s.email, isCustomer: false, isSupplier: true, bankCode: '001', bankAccountType: 'CUENTA_CORRIENTE', bankAccountNumber: '00-123-45678-09' })
    );
    supplierIds.push(contact.id);
  }
  const [molino, costaAzul, cordillera, distSur, colegio] = customerIds as [string, string, string, string, string, string];
  const [tostaduria, envases, lacteos, vina] = supplierIds as [string, string, string, string];

  // ── Catálogo y bodegas ───────────────────────────────────────────────────
  const central = await prisma.warehouse.findFirstOrThrow({ where: { companyId, code: 'CENTRAL' } });
  await createWarehouse(companyId, warehouseCreateSchema.parse({ name: 'Sala de Ventas', code: 'SALA', address: 'Av. Providencia 1234, local 2' }));
  const categories: Record<string, string> = {};
  for (const name of ['Café', 'Insumos', 'Accesorios', 'Servicios']) {
    categories[name] = (await createCategory(companyId, categoryCreateSchema.parse({ name }))).id;
  }
  const productData = [
    { sku: 'CAF-1000', name: 'Café de grano 1 kg', category: 'Café', netPrice: 16_800, minStock: 10, barcode: '7801234500011' },
    { sku: 'CAF-500M', name: 'Café molido 500 g', category: 'Café', netPrice: 8_900, minStock: 12, barcode: '7801234500028' },
    { sku: 'CAP-10', name: 'Café en cápsulas x10', category: 'Café', netPrice: 4_200, minStock: 20, barcode: '7801234500035' },
    { sku: 'LEC-1000', name: 'Leche entera 1 L', category: 'Insumos', netPrice: 1_290, minStock: 24, barcode: '7801234500042' },
    { sku: 'VAS-12', name: 'Vaso de papel 12 oz (50 un.)', category: 'Insumos', netPrice: 6_500, minStock: 15, barcode: '7801234500059' },
    { sku: 'TAP-12', name: 'Tapa para vaso 12 oz (50 un.)', category: 'Insumos', netPrice: 3_600, minStock: 15, barcode: '7801234500066' },
    { sku: 'FIL-100', name: 'Filtro de papel (100 un.)', category: 'Insumos', netPrice: 2_900, minStock: 10, barcode: '7801234500073' },
    { sku: 'TAZ-CER', name: 'Taza de cerámica', category: 'Accesorios', netPrice: 4_900, minStock: 6, barcode: '7801234500080' },
    { sku: 'MOL-MAN', name: 'Molinillo manual', category: 'Accesorios', netPrice: 29_900, minStock: 3, barcode: '7801234500097' },
    { sku: 'SRV-BAR', name: 'Servicio de barista para eventos (hora)', category: 'Servicios', netPrice: 25_000, minStock: 0, isTrackable: false },
    { sku: 'CUR-BAR', name: 'Curso de barismo básico', category: 'Servicios', netPrice: 45_000, minStock: 0, isTrackable: false, isExempt: true },
  ];
  const products: Record<string, string> = {};
  for (const p of productData) {
    const product = await createProduct(
      companyId,
      productCreateSchema.parse({ sku: p.sku, name: p.name, categoryId: categories[p.category], netPrice: p.netPrice, minStock: p.minStock, barcode: p.barcode, isTrackable: p.isTrackable ?? true, isExempt: p.isExempt ?? false })
    );
    products[p.sku] = product.id;
  }

  // ── Compras (suben el stock, recalculan el PMP y quedan en Cuentas por Pagar) ──
  const purchases: { contactId: string; folio: string; issue: number; due: number; items: [string, number, number][] }[] = [
    { contactId: tostaduria, folio: '45120', issue: -28, due: 2, items: [['CAF-1000', 40, 9_800], ['CAF-500M', 60, 5_200], ['CAP-10', 80, 2_300]] },
    { contactId: envases, folio: '8812', issue: -20, due: -5, items: [['VAS-12', 30, 3_900], ['TAP-12', 30, 2_100], ['FIL-100', 20, 1_800]] },
    { contactId: lacteos, folio: '330021', issue: -10, due: 20, items: [['LEC-1000', 48, 890]] },
    { contactId: tostaduria, folio: '45188', issue: -6, due: 24, items: [['TAZ-CER', 24, 2_500], ['MOL-MAN', 6, 18_000], ['CAF-1000', 5, 10_200]] },
  ];
  const purchaseIds: string[] = [];
  for (const purchase of purchases) {
    const document = await createPurchaseDocument(
      companyId,
      purchaseDocumentCreateSchema.parse({
        contactId: purchase.contactId,
        warehouseId: central.id,
        documentType: 'FACTURA',
        folio: purchase.folio,
        issueDate: isoDay(purchase.issue),
        dueDate: isoDay(purchase.due),
        items: purchase.items.map(([sku, quantity, unitCost]) => ({ description: productData.find((p) => p.sku === sku)!.name, productId: products[sku], quantity, unitCost })),
      }),
      'ISSUED'
    );
    purchaseIds.push(document.id);
  }
  await registerPurchasePayment(companyId, purchaseIds[2]!, registerPaymentSchema.parse({ amount: 30_000, paymentMethod: 'TRANSFERENCIA', referenceNumber: 'TRF-55120' }));

  // ── Ventas ───────────────────────────────────────────────────────────────
  type SaleLine = [string, number];
  const sale = async (contactId: string, dteType: 'FACTURA_33' | 'BOLETA_39' | 'COTIZACION' | 'FACTURA_EXENTA_34', paymentMethod: 'EFECTIVO' | 'TRANSFERENCIA' | 'CREDITO_30' | 'TARJETA_DEBITO', lines: SaleLine[], status: 'ISSUED' | 'DRAFT' = 'ISSUED', dueOffset?: number) =>
    createSalesDocument(
      companyId,
      salesDocumentCreateSchema.parse({
        contactId,
        warehouseId: central.id,
        dteType,
        paymentMethod,
        dueDate: dueOffset === undefined ? undefined : isoDay(dueOffset),
        sellerId: owner.id,
        items: lines.map(([sku, quantity]) => {
          const p = productData.find((item) => item.sku === sku)!;
          return { productId: products[sku], sku, description: p.name, quantity, unitPrice: p.netPrice };
        }),
      }),
      status
    );
  const f1 = await sale(molino, 'FACTURA_33', 'CREDITO_30', [['CAF-1000', 6], ['VAS-12', 4], ['TAP-12', 4]], 'ISSUED', -8);
  await sale(costaAzul, 'FACTURA_33', 'CREDITO_30', [['CAF-500M', 10], ['LEC-1000', 12]], 'ISSUED', 12);
  const f3 = await sale(cordillera, 'FACTURA_33', 'CREDITO_30', [['CAF-1000', 8], ['CAP-10', 20], ['TAZ-CER', 12]], 'ISSUED', 25);
  await sale(distSur, 'FACTURA_33', 'CREDITO_30', [['CAF-500M', 18], ['FIL-100', 6]], 'ISSUED', -15);
  await sale(colegio, 'FACTURA_EXENTA_34', 'TRANSFERENCIA', [['CUR-BAR', 2]]);
  await sale(costaAzul, 'FACTURA_33', 'TRANSFERENCIA', [['SRV-BAR', 6]]);
  await sale(customerIds[5]!, 'BOLETA_39', 'EFECTIVO', [['MOL-MAN', 1], ['CAF-1000', 1]]);
  await sale(cordillera, 'COTIZACION', 'TRANSFERENCIA', [['SRV-BAR', 8], ['CAF-1000', 10]]);
  await sale(molino, 'FACTURA_33', 'CREDITO_30', [['LEC-1000', 24]], 'DRAFT');
  await registerSalesPayment(companyId, f1.id, registerPaymentSchema.parse({ amount: 60_000, paymentMethod: 'TRANSFERENCIA', referenceNumber: 'TRF-88213' }));
  await registerSalesPayment(companyId, f3.id, registerPaymentSchema.parse({ amount: f3.totalAmount, paymentMethod: 'TRANSFERENCIA', referenceNumber: 'TRF-88290' }));

  await createSalesOrder(
    companyId,
    owner.id,
    salesOrderCreateSchema.parse({
      contactId: cordillera,
      warehouseId: central.id,
      paymentMethod: 'CREDITO_30',
      deliveryDate: isoDay(5),
      notes: 'Entregar en recepción del hotel, de 9 a 12 h.',
      items: [
        { productId: products['CAF-1000'], sku: 'CAF-1000', description: 'Café de grano 1 kg', quantity: 12, unitPrice: 16_800 },
        { productId: products['VAS-12'], sku: 'VAS-12', description: 'Vaso de papel 12 oz (50 un.)', quantity: 6, unitPrice: 6_500 },
      ],
    })
  );

  const priceList = await createPriceList(companyId, priceListSchema.parse({ name: 'Mayoristas', description: 'Clientes con compras sobre $1.000.000 al mes' }));
  await fillPriceListFromCatalog(companyId, priceList.id, -10);
  await assignPriceListToContact(companyId, distSur, priceList.id);

  // ── Punto de venta: caja abierta con algunas boletas ─────────────────────
  const register = await createCashRegister(companyId, cashRegisterCreateSchema.parse({ name: 'Caja 1 Mesón', warehouseId: central.id }));
  const shift = await openShift(companyId, owner.id, openShiftSchema.parse({ cashRegisterId: register.id, initialAmount: 50_000 }));
  await createPosSale(companyId, owner.id, shift.id, posSaleSchema.parse({ items: [{ productId: products['CAP-10'], quantity: 2 }], paymentMethod: 'EFECTIVO', cashReceived: 10_000 }));
  await createPosSale(companyId, owner.id, shift.id, posSaleSchema.parse({ items: [{ productId: products['TAZ-CER'], quantity: 2 }, { productId: products['CAF-500M'], quantity: 1 }], paymentMethod: 'TARJETA_DEBITO' }));

  // ── Tesorería ────────────────────────────────────────────────────────────
  const bank = await createBankAccount(companyId, bankAccountSchema.parse({ name: 'Cuenta corriente Banco de Chile', bankCode: '001', accountType: 'CUENTA_CORRIENTE', accountNumber: '00-123-45678-09', openingBalance: 4_850_000, openingDate: isoDay(-30), isDefault: true }));
  await createCheque(companyId, owner.id, chequeSchema.parse({ direction: 'RECEIVED', number: '0045821', bankCode: '037', drawerName: 'Distribuidora Sur Limitada', contactId: distSur, amount: 250_000, issueDate: isoDay(-3), dueDate: isoDay(15), bankAccountId: bank.id }));

  // ── CRM ──────────────────────────────────────────────────────────────────
  const project = await createProject(
    companyId,
    projectCreateSchema.parse({ code: 'RV27', name: 'Reina de la Vendimia 2027', budgetedIncome: 48_000_000, budgetedExpense: 31_000_000, startDate: isoDay(-40), endDate: '2027-03-20', status: 'IN_PROGRESS', galaDate: '2027-03-14T21:00:00-03:00', venueName: 'Teatro Municipal de Curicó', venueAddress: 'Merced 452, Curicó' })
  );
  const opportunities: { title: string; contactId?: string; prospectName?: string; amount: number; stage: 'LEAD' | 'QUALIFIED' | 'PROPOSAL' | 'NEGOTIATION' | 'WON'; dealType: 'SPONSORSHIP' | 'EVENT_PRODUCTION' | 'CORPORATE_TICKETS' | 'OTHER'; close: number }[] = [
    { title: 'Auspicio oro Viña Santa Clara', contactId: vina, amount: 8_000_000, stage: 'NEGOTIATION', dealType: 'SPONSORSHIP', close: 20 },
    { title: 'Cafetería oficial de la gala', contactId: tostaduria, amount: 3_500_000, stage: 'PROPOSAL', dealType: 'SPONSORSHIP', close: 35 },
    { title: 'Mesas corporativas Hotel Cordillera', contactId: cordillera, amount: 2_400_000, stage: 'QUALIFIED', dealType: 'CORPORATE_TICKETS', close: 45 },
    { title: 'Evento aniversario Costa Azul', contactId: costaAzul, amount: 5_200_000, stage: 'LEAD', dealType: 'EVENT_PRODUCTION', close: 60 },
    { title: 'Cobertura radial regional', prospectName: 'Radio Valle Central', amount: 1_800_000, stage: 'LEAD', dealType: 'OTHER', close: 50 },
    { title: 'Abastecimiento anual cafetería', contactId: molino, amount: 6_000_000, stage: 'WON', dealType: 'OTHER', close: -5 },
  ];
  for (const o of opportunities) {
    await createOpportunity(
      companyId,
      opportunityCreateSchema.parse({ title: o.title, contactId: o.contactId, prospectName: o.prospectName, amount: o.amount, stage: o.stage, dealType: o.dealType, expectedCloseDate: isoDay(o.close), ownerUserId: owner.id, projectId: o.dealType === 'SPONSORSHIP' || o.dealType === 'CORPORATE_TICKETS' ? project.id : undefined })
    );
  }

  // ── Tareas ───────────────────────────────────────────────────────────────
  const actor = { companyId, userId: owner.id, canManage: true };
  for (const t of [
    { title: 'Revisar stock crítico y pedir a proveedores', dueDate: isoDay(1), recurrence: 'WEEKLY', priority: 'HIGH' },
    { title: 'Cuadrar la caja del fin de semana', dueDate: isoDay(-1), recurrence: 'WEEKLY', priority: 'NORMAL' },
    { title: 'Llamar a Distribuidora Sur por factura vencida', dueDate: isoDay(0), recurrence: 'NONE', priority: 'HIGH' },
    { title: 'Enviar F29 al contador', dueDate: isoDay(8), recurrence: 'MONTHLY', priority: 'NORMAL' },
  ] as const) {
    await createTask(actor, taskSchema.parse(t));
  }

  // ── Certamen: candidatas, auspicios ──────────────────────────────────────
  const candidates = [
    { fullName: 'Valentina Paz Morales Ríos', stageName: 'Valentina Morales', body: 21345678, birth: '2003-05-14' },
    { fullName: 'Camila Andrea Soto Pérez', stageName: 'Camila Soto', body: 20456789, birth: '2002-11-02' },
    { fullName: 'Isidora Belén Rojas Fuentes', stageName: 'Isidora Rojas', body: 21567890, birth: '2004-02-21' },
    { fullName: 'Fernanda Ignacia Díaz Lagos', stageName: 'Fernanda Díaz', body: 20678901, birth: '2001-08-30' },
    { fullName: 'Antonia Sofía Herrera Vidal', stageName: 'Antonia Herrera', body: 21789012, birth: '2003-12-09' },
  ];
  const candidateIds: string[] = [];
  for (const c of candidates) {
    const candidate = await createCandidate(
      companyId,
      candidateCreateSchema.parse({ projectId: project.id, rut: rut(c.body), fullName: c.fullName, stageName: c.stageName, birthDate: c.birth, email: `${c.stageName.split(' ')[0]!.toLowerCase()}@correo.cl` })
    );
    candidateIds.push(candidate.id);
  }
  for (const [tier, name, price, slots, order] of [
    ['GOLD', 'Auspiciador Oro', 8_000_000, 2, 1],
    ['SILVER', 'Auspiciador Plata', 4_500_000, 4, 2],
    ['BRONZE', 'Auspiciador Bronce', 1_800_000, 8, 3],
  ] as const) {
    await createPackage(
      companyId,
      sponsorshipPackageSchema.parse({ projectId: project.id, tier, name, price, maxSlots: slots, order, isPublic: true, benefits: ['Logo en backdrop y pantallas', 'Mención en la transmisión', 'Entradas para la gala'] })
    );
  }
  const contract = await createSponsorshipContract(
    companyId,
    sponsorshipContractCreateSchema.parse({ projectId: project.id, contactId: tostaduria, tier: 'SILVER', cashAmount: 2_000_000, isBarter: true, barterValuation: 1_500_000, barterDescription: 'Café para la producción y la gala', status: 'CONFIRMED' })
  );
  for (const [title, type] of [
    ['Logo en backdrop de la gala', 'OTRO'],
    ['Mención en Instagram (3 publicaciones)', 'MENCION'],
    ['Stand de degustación en el hall', 'BACKSTAGE'],
  ] as const) {
    await addDeliverable(companyId, contract.id, deliverableCreateSchema.parse({ title, type }));
  }
  await createPaymentPlan(
    companyId,
    paymentPlanCreateSchema.parse({ clientType: 'CANDIDATE', candidateId: candidateIds[0], totalAmount: 600_000, installmentCount: 6, frequency: 'MONTHLY', startDate: isoDay(-35), notes: 'Inscripción y clases de pasarela' })
  );
  await createPromissoryNote(companyId, promissoryNoteCreateSchema.parse({ contactId: costaAzul, amount: 1_200_000, issueDate: isoDay(-15), dueDate: isoDay(45), notes: 'Respalda convenio de abastecimiento' }));
  await createFeeDocument(companyId, feeDocumentCreateSchema.parse({ contactId: vina, projectId: project.id, folioNumber: '1287', issueDate: isoDay(-4), serviceDescription: 'Animación de la presentación oficial de candidatas', grossAmount: 450_000 }));

  // ── Personas ─────────────────────────────────────────────────────────────
  for (const e of [
    { rut: rut(17234567), fullName: 'Javiera Contreras Muñoz', position: 'Barista', department: 'Sala de ventas', baseSalary: 650_000, afp: 'HABITAT', hire: '2024-03-01' },
    { rut: rut(15345678), fullName: 'Rodrigo Tapia Salinas', position: 'Encargado de bodega', department: 'Operaciones', baseSalary: 780_000, afp: 'PROVIDA', hire: '2023-07-15' },
    { rut: rut(18456789), fullName: 'Paula Henríquez Araya', position: 'Ejecutiva comercial', department: 'Ventas', baseSalary: 950_000, afp: 'MODELO', hire: '2025-01-06' },
  ] as const) {
    await createEmployee(
      companyId,
      employeeSchema.parse({ rut: e.rut, fullName: e.fullName, position: e.position, department: e.department, hireDate: e.hire, contractType: 'INDEFINIDO', weeklyHours: 42, baseSalary: e.baseSalary, gratificationMode: 'ART_50', mealAllowance: 45_000, transportAllowance: 35_000, afp: e.afp, healthInsurance: 'FONASA' })
    );
  }

  // ── Finanzas ─────────────────────────────────────────────────────────────
  const budget = await createBudget(companyId, budgetCreateSchema.parse({ name: 'Presupuesto operativo 2026', periodStart: '2026-01-01', periodEnd: '2026-12-31', status: 'ACTIVE' }));
  for (const [category, plannedAmount] of [['Arriendo', 14_400_000], ['Sueldos', 32_000_000], ['Insumos', 18_000_000], ['Marketing', 4_800_000]] as const) {
    await addBudgetLine(companyId, budget.id, budgetLineCreateSchema.parse({ category, plannedAmount }));
  }
  for (const a of [
    { code: 'AF-001', name: 'Máquina de espresso dos grupos', category: 'Maquinarias y equipos en general', cost: 3_900_000, months: 120, location: 'Sala de ventas' },
    { code: 'AF-002', name: 'Notebook administración', category: 'Computadores', cost: 690_000, months: 72, location: 'Oficina' },
    { code: 'AF-003', name: 'Camioneta de reparto', category: 'Camiones y camionetas', cost: 14_500_000, months: 84, location: 'Bodega' },
  ]) {
    await createAsset(companyId, fixedAssetSchema.parse({ code: a.code, name: a.name, category: a.category, location: a.location, acquisitionDate: '2025-06-01', acquisitionCost: a.cost, residualValue: 0, usefulLifeMonths: a.months, method: 'LINEAL' }));
  }
  const report = await createReport(companyId, owner.id, expenseReportSchema.parse({ title: 'Visita a clientes en Viña del Mar', projectId: project.id }));
  for (const item of [
    { category: 'Transporte', description: 'Peajes ruta 68', documentType: 'TICKET', amount: 7_400 },
    { category: 'Alimentación', description: 'Almuerzo con cliente', documentType: 'BOLETA', amount: 28_500, supplierName: 'Restaurante Costa Azul' },
    { category: 'Combustible', description: 'Bencina', documentType: 'BOLETA', amount: 32_000 },
  ] as const) {
    await addItem(companyId, owner.id, report.id, expenseItemSchema.parse({ expenseDate: isoDay(-2), ...item }));
  }

  // ── Calidad y sitio web ──────────────────────────────────────────────────
  await createProcedure(companyId, owner.id, procedureSchema.parse({ title: 'Apertura de la sala de ventas', category: 'OPERACION', summary: 'Pasos para abrir el local cada mañana', content: '1. Encender la máquina de espresso 30 minutos antes.\n2. Revisar temperatura de la vitrina.\n3. Abrir la caja en el Punto de Venta con el fondo de $50.000.', reviewEveryDays: 180 }));
  await createProcedure(companyId, owner.id, procedureSchema.parse({ title: 'Recepción de leche y lácteos', category: 'CALIDAD', summary: 'Control de temperatura y vencimiento al recibir', content: 'Medir la temperatura de cada caja (máximo según resolución sanitaria) y revisar la fecha de vencimiento antes de firmar la guía.', reviewEveryDays: 365 }));
  await createWebSite(companyId, { name: owner.name }, createWebSiteSchema.parse({ name: 'Sitio Empresa Demo', slug: 'empresa-demo', kind: 'CORPORATE', mode: 'GUIDED', industry: 'Cafetería' }));

  console.log('Datos de demo cargados en', company.id);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
