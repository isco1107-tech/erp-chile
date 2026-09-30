/**
 * Tarifario de auspicios general: un plan puede existir sin certamen
 * (`projectId: null`) para preparar precios antes de tener un certamen.
 *
 * Reglas que estos tests protegen:
 *  - crear un plan sin certamen no exige (ni consulta) ningún certamen;
 *  - con certamen, este se valida contra la empresa (multi-tenant);
 *  - el listado distingue "general" de "todos" y de un certamen;
 *  - copiar general → certamen (y viceversa) conserva la empresa;
 *  - el CRM nunca ofrece una plantilla general como plan de un negocio.
 *
 * Prisma: se espía el cliente real; lo no simulado lanza "Consulta no prevista".
 */

import { prisma } from '@/lib/prisma';
import { GENERAL_TARIFF, sponsorshipPackageSchema } from '@/modules/sponsorships/schema';
import { copyPackages, createPackage, listPackages, projectIdOrNull } from '@/modules/sponsorships/services/packages.service';
import { listPackageOptions } from '@/modules/crm/services/crm.service';

type Mocks = Record<string, jest.Mock>;
type Delegate = Record<string, (...args: never[]) => unknown>;
const MODELS = { sponsorshipPackage: ['create', 'createMany', 'findMany'], project: ['findFirst'] } as const;

function installDb(): Record<keyof typeof MODELS, Mocks> {
  const db: Record<string, Mocks> = {};
  for (const [model, methods] of Object.entries(MODELS)) {
    db[model] = {};
    for (const method of methods) {
      db[model]![method] = jest.spyOn((prisma as unknown as Record<string, Delegate>)[model]!, method).mockImplementation(() => {
        throw new Error(`Consulta no prevista: ${model}.${method}`);
      }) as unknown as jest.Mock;
    }
  }
  return db as Record<keyof typeof MODELS, Mocks>;
}

const COMPANY = 'company-a';
const base = { tier: 'GOLD' as const, name: 'Auspiciador Oro', price: 1_500_000, benefits: ['Logo en backdrop'], isPublic: true, showPricePublic: false, order: 1 };
const whereOf = (mock: jest.Mock, call = 0) => (mock.mock.calls[call]![0] as { where: Record<string, unknown> }).where;

let db: ReturnType<typeof installDb>;
beforeEach(() => {
  db = installDb();
});
afterEach(() => jest.restoreAllMocks());

describe('Tarifario general de auspicios', () => {
  it('el esquema acepta un plan sin certamen y con certamen', () => {
    expect(sponsorshipPackageSchema.safeParse(base).success).toBe(true);
    expect(sponsorshipPackageSchema.safeParse({ ...base, projectId: null }).success).toBe(true);
    expect(sponsorshipPackageSchema.safeParse({ ...base, projectId: 'p1' }).success).toBe(true);
    expect(sponsorshipPackageSchema.safeParse({ ...base, projectId: '' }).success).toBe(false);
  });

  it('"GENERAL", vacío o nulo significan sin certamen; otro valor es el id del certamen', () => {
    expect(projectIdOrNull(GENERAL_TARIFF)).toBeNull();
    expect(projectIdOrNull('')).toBeNull();
    expect(projectIdOrNull(null)).toBeNull();
    expect(projectIdOrNull(undefined)).toBeNull();
    expect(projectIdOrNull('p1')).toBe('p1');
  });

  it('crear un plan sin certamen no consulta ningún certamen y guarda projectId nulo', async () => {
    db.sponsorshipPackage.create.mockResolvedValue({ id: 'k1' });
    await createPackage(COMPANY, { ...base, projectId: null });
    expect(db.project.findFirst).not.toHaveBeenCalled();
    const data = (db.sponsorshipPackage.create.mock.calls[0]![0] as { data: Record<string, unknown> }).data;
    expect(data).toMatchObject({ companyId: COMPANY, projectId: null, name: 'Auspiciador Oro' });
    // Sin el campo tampoco: es lo que manda la pantalla si aún no hay certamen.
    await createPackage(COMPANY, base);
    expect((db.sponsorshipPackage.create.mock.calls[1]![0] as { data: Record<string, unknown> }).data).toMatchObject({ projectId: null });
  });

  it('un certamen de otra empresa no se acepta', async () => {
    db.project.findFirst.mockResolvedValue(null);
    await expect(createPackage(COMPANY, { ...base, projectId: 'de-otra-empresa' })).rejects.toThrow('no pertenece a tu empresa');
    expect(whereOf(db.project.findFirst)).toEqual({ id: 'de-otra-empresa', companyId: COMPANY });
    expect(db.sponsorshipPackage.create).not.toHaveBeenCalled();
  });

  it('el listado distingue general, un certamen y todos, siempre dentro de la empresa', async () => {
    db.sponsorshipPackage.findMany.mockResolvedValue([]);
    await listPackages(COMPANY, GENERAL_TARIFF);
    await listPackages(COMPANY, 'p1');
    await listPackages(COMPANY);
    expect(whereOf(db.sponsorshipPackage.findMany, 0)).toEqual({ companyId: COMPANY, projectId: null });
    expect(whereOf(db.sponsorshipPackage.findMany, 1)).toEqual({ companyId: COMPANY, projectId: 'p1' });
    expect(whereOf(db.sponsorshipPackage.findMany, 2)).toEqual({ companyId: COMPANY });
  });

  it('copia el tarifario general a un certamen', async () => {
    db.project.findFirst.mockResolvedValue({ id: 'p1' });
    db.sponsorshipPackage.findMany.mockResolvedValue([{ ...base, id: 'k1', companyId: COMPANY, projectId: null, maxSlots: 2, description: null }]);
    db.sponsorshipPackage.createMany.mockResolvedValue({ count: 1 });
    expect(await copyPackages(COMPANY, null, 'p1')).toBe(1);
    expect(whereOf(db.sponsorshipPackage.findMany)).toEqual({ companyId: COMPANY, projectId: null });
    expect(db.project.findFirst).toHaveBeenCalledTimes(1); // solo valida el destino
    const rows = (db.sponsorshipPackage.createMany.mock.calls[0]![0] as { data: Array<Record<string, unknown>> }).data;
    expect(rows[0]).toMatchObject({ companyId: COMPANY, projectId: 'p1', name: 'Auspiciador Oro', price: 1_500_000, maxSlots: 2 });
  });

  it('no copia un tarifario sobre sí mismo ni desde uno vacío', async () => {
    await expect(copyPackages(COMPANY, null, null)).rejects.toThrow('distinto');
    await expect(copyPackages(COMPANY, 'p1', 'p1')).rejects.toThrow('distinto');
    db.project.findFirst.mockResolvedValue({ id: 'p2' });
    db.sponsorshipPackage.findMany.mockResolvedValue([]);
    expect(await copyPackages(COMPANY, null, 'p2')).toBe(0);
    expect(db.sponsorshipPackage.createMany).not.toHaveBeenCalled();
  });

  it('el CRM solo ofrece planes de un certamen, nunca las plantillas generales', async () => {
    db.sponsorshipPackage.findMany.mockResolvedValue([
      { id: 'a', projectId: 'p1', name: 'Oro', tier: 'GOLD', price: 1, maxSlots: null, _count: { contracts: 0 } },
      { id: 'b', projectId: null, name: 'Plantilla', tier: 'SILVER', price: 1, maxSlots: null, _count: { contracts: 0 } },
    ]);
    const options = await listPackageOptions(COMPANY);
    expect(whereOf(db.sponsorshipPackage.findMany)).toEqual({ companyId: COMPANY, projectId: { not: null } });
    expect(options.map((o) => o.id)).toEqual(['a']);
  });
});
