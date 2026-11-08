/**
 * Consulta del portal de cuotas contra PostgreSQL REAL (solo una base local
 * cuyo nombre termina en `_test`, igual que `tests/hermes-link-db.test.ts`).
 *
 *   WAREHOUSE_TEST_DATABASE_URL=postgresql://postgres:test@localhost:5432/erp_test \
 *     npx jest tests/installment-portal-lookup-db.test.ts
 *
 * Lo que protege: con solo el RUT ya no se ve quién debe ni cuánto; hace falta
 * la fecha de nacimiento, y una fecha equivocada responde igual que "sin
 * cuotas". Las fichas sin fecha registrada siguen encontrándose por RUT.
 */
import type { PrismaClient } from '@prisma/client';

const TEST_URL = process.env.WAREHOUSE_TEST_DATABASE_URL;

function isSafeTestDatabase(url: string | undefined): url is string {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(parsed.hostname) && /_test$/.test(parsed.pathname.replace(/^\//, ''));
  } catch {
    return false;
  }
}

const describeDb = isSafeTestDatabase(TEST_URL) ? describe : describe.skip;

describeDb('portal de cuotas: RUT + fecha de nacimiento', () => {
  jest.setTimeout(60_000);

  let prisma: PrismaClient;
  let svc: typeof import('@/modules/payment-plans/services/online-payment.service');
  const suffix = Math.random().toString(36).slice(2, 8);
  const token = (suffix + 'a'.repeat(64)).slice(0, 64).replace(/[^a-f0-9]/g, 'b');
  let companyId = '';

  async function candidateWithPlan(rut: string, birthDate: Date | null, projectId: string) {
    const candidate = await prisma.candidate.create({
      data: { companyId, projectId, rut, rutClean: rut.replace(/[^0-9kK]/g, '').toUpperCase(), fullName: 'Valentina Rojas', birthDate },
    });
    const contact = await prisma.contact.create({ data: { companyId, rut, rutClean: candidate.rutClean, razonSocial: 'Valentina Rojas' } });
    await prisma.paymentPlan.create({
      data: {
        companyId,
        contactId: contact.id,
        candidateId: candidate.id,
        totalAmount: 90_000,
        installmentCount: 1,
        startDate: new Date(),
        installments: { create: [{ companyId, installmentNumber: 1, dueDate: new Date(), amount: 90_000 }] },
      },
    });
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_URL;
    ({ prisma } = await import('@/lib/prisma'));
    svc = await import('@/modules/payment-plans/services/online-payment.service');
    const company = await prisma.company.create({
      data: {
        rut: `74${suffix}-3`,
        businessName: `Certamen ${suffix}`,
        status: 'ACTIVE',
        features: { create: { hasInstallmentPlans: true } },
        settings: { create: { installmentPortalToken: token } },
      },
    });
    companyId = company.id;
    const project = await prisma.project.create({ data: { companyId, code: `C-${suffix}`, name: 'Miss Sur', startDate: new Date() } });
    await candidateWithPlan('11.111.111-1', new Date('2008-03-14T00:00:00Z'), project.id);
    await candidateWithPlan('22.222.222-2', null, project.id);
  });

  afterAll(async () => {
    await prisma.paymentPlanInstallment.deleteMany({ where: { companyId } });
    await prisma.paymentPlan.deleteMany({ where: { companyId } });
    await prisma.contact.deleteMany({ where: { companyId } });
    await prisma.candidate.deleteMany({ where: { companyId } });
    await prisma.project.deleteMany({ where: { companyId } });
    await prisma.companySettings.deleteMany({ where: { companyId } });
    await prisma.companyFeatures.deleteMany({ where: { companyId } });
    await prisma.company.deleteMany({ where: { id: companyId } });
    await prisma.$disconnect();
  });

  it('con RUT y fecha correctos se ven las cuotas', async () => {
    const result = await svc.lookupPublicInstallments(token, '11.111.111-1', '2008-03-14');
    expect(result.plans).toHaveLength(1);
    expect(result.plans[0]!.installments[0]!.pendingAmount).toBe(90_000);
  });

  it('con una fecha equivocada responde igual que "sin cuotas"', async () => {
    const result = await svc.lookupPublicInstallments(token, '11.111.111-1', '2008-03-15');
    expect(result).toEqual({ candidateName: null, plans: [] });
  });

  it('una ficha sin fecha registrada se sigue encontrando por RUT', async () => {
    const result = await svc.lookupPublicInstallments(token, '22.222.222-2', '1999-01-01');
    expect(result.plans).toHaveLength(1);
  });
});
