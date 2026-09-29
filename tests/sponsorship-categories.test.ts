import { prisma } from '@/lib/prisma';
import {
  collidesWithFixedCategory,
  decodeCategoryChoice,
  encodeCategoryChoice,
  groupSponsorsByCategory,
  hasExactlyOneCategory,
  normalizeCategoryName,
  sponsorshipCategoryLabel,
  sponsorshipContractCreateSchema,
  sponsorshipContractUpdateSchema,
  sponsorshipPackageSchema,
} from '@/modules/sponsorships/schema';
import { convertToSponsorshipSchema } from '@/modules/crm/schema';
import {
  assertCategoryChoice,
  createCategory,
  deleteCategory,
  renameCategory,
} from '@/modules/sponsorships/services/categories.service';
import { copyPackages, updatePackage } from '@/modules/sponsorships/services/packages.service';
import { createSponsorshipContract, updateSponsorshipContract } from '@/modules/sponsorships/services/sponsorships.service';

/**
 * Categorías de auspicio: las fijas (enum) más las que cada certamen agrega por
 * su cuenta. Un contrato, plan o negocio lleva UNA de las dos, y una categoría
 * propia solo vale dentro de su certamen y su empresa.
 */

jest.mock('@/lib/email/mailer', () => ({ sendEmail: jest.fn().mockResolvedValue({ status: 'logged', provider: 'none' }) }));

afterEach(() => jest.restoreAllMocks());

const contractBase = { projectId: 'p1', contactId: 'k1', isBarter: false, cashAmount: 100000, barterValuation: 0, status: 'PROPOSAL' as const };

describe('helpers de categoría', () => {
  it('nombra la categoría propia si la hay y, si no, la fija', () => {
    expect(sponsorshipCategoryLabel({ tier: 'GOLD' })).toBe('Gold');
    expect(sponsorshipCategoryLabel({ tier: null, category: { name: 'Auspiciador Vestuario' } })).toBe('Auspiciador Vestuario');
    expect(sponsorshipCategoryLabel({ tier: null, category: null })).toBe('Sin categoría');
  });

  it('codifica y decodifica la elección del selector sin perder nada', () => {
    expect(encodeCategoryChoice({ tier: 'COPPER' })).toBe('tier:COPPER');
    expect(encodeCategoryChoice({ categoryId: 'abc' })).toBe('cat:abc');
    expect(encodeCategoryChoice({})).toBe('');
    expect(decodeCategoryChoice('tier:COPPER')).toEqual({ tier: 'COPPER' });
    expect(decodeCategoryChoice('cat:abc')).toEqual({ categoryId: 'abc' });
  });

  it('ignora valores inventados al decodificar', () => {
    expect(decodeCategoryChoice('tier:PLATINO')).toEqual({});
    expect(decodeCategoryChoice('cat:')).toEqual({});
    expect(decodeCategoryChoice('')).toEqual({});
  });

  it('exige exactamente una de las dos vías', () => {
    expect(hasExactlyOneCategory({ tier: 'GOLD' })).toBe(true);
    expect(hasExactlyOneCategory({ categoryId: 'x' })).toBe(true);
    expect(hasExactlyOneCategory({})).toBe(false);
    expect(hasExactlyOneCategory({ tier: 'GOLD', categoryId: 'x' })).toBe(false);
  });

  it('compara nombres sin tildes, mayúsculas ni espacios de más', () => {
    expect(normalizeCategoryName('  Auspiciador   VESTUÁRIO ')).toBe('auspiciador vestuario');
  });

  it('no deja crear una categoría propia con el nombre de una fija', () => {
    expect(collidesWithFixedCategory('gold')).toBe(true);
    expect(collidesWithFixedCategory(' Cobre ')).toBe(true);
    expect(collidesWithFixedCategory('media  partner')).toBe(true);
    expect(collidesWithFixedCategory('Auspiciador Vestuario')).toBe(false);
  });
});

describe('validación de esquemas', () => {
  it('el contrato acepta una fija o una propia, no ninguna ni las dos', () => {
    expect(sponsorshipContractCreateSchema.safeParse({ ...contractBase, tier: 'GOLD' }).success).toBe(true);
    expect(sponsorshipContractCreateSchema.safeParse({ ...contractBase, categoryId: 'c1' }).success).toBe(true);
    expect(sponsorshipContractCreateSchema.safeParse({ ...contractBase }).success).toBe(false);
    expect(sponsorshipContractCreateSchema.safeParse({ ...contractBase, tier: 'GOLD', categoryId: 'c1' }).success).toBe(false);
  });

  it('al editar un contrato la categoría puede omitirse, pero si viene es una sola', () => {
    expect(sponsorshipContractUpdateSchema.safeParse({ notes: 'x' }).success).toBe(true);
    expect(sponsorshipContractUpdateSchema.safeParse({ tier: 'SILVER' }).success).toBe(true);
    expect(sponsorshipContractUpdateSchema.safeParse({ tier: 'SILVER', categoryId: 'c1' }).success).toBe(false);
  });

  it('el plan del tarifario también exige una sola categoría', () => {
    const plan = { projectId: 'p1', name: 'Plan Vestuario', price: 500000, benefits: [] };
    expect(sponsorshipPackageSchema.safeParse({ ...plan, categoryId: 'c1' }).success).toBe(true);
    expect(sponsorshipPackageSchema.safeParse({ ...plan, tier: 'BRONZE' }).success).toBe(true);
    expect(sponsorshipPackageSchema.safeParse(plan).success).toBe(false);
  });

  it('convertir un negocio en contrato acepta una categoría propia', () => {
    const base = { cashAmount: 100000, isBarter: false };
    expect(convertToSponsorshipSchema.safeParse({ ...base, categoryId: 'c1' }).success).toBe(true);
    expect(convertToSponsorshipSchema.safeParse({ ...base, tier: 'GOLD' }).success).toBe(true);
    expect(convertToSponsorshipSchema.safeParse(base).success).toBe(false);
  });
});

describe('sitio público: auspiciadores por categoría', () => {
  it('lista primero las fijas en orden de nivel y después las propias en orden de creación', () => {
    const groups = groupSponsorsByCategory([
      { tier: null, category: { id: 'b', name: 'Aliado Salud', order: 1 }, name: 'Clínica' },
      { tier: 'SILVER', name: 'Banco' },
      { tier: null, category: { id: 'a', name: 'Auspiciador Vestuario', order: 0 }, name: 'Tienda' },
      { tier: 'TITULAR_MAIN_SPONSOR', name: 'Marca Madre' },
    ]);
    expect(groups.map((g) => g.label)).toEqual(['Auspiciador Principal', 'Silver', 'Auspiciador Vestuario', 'Aliado Salud']);
    expect(groups[2]).toEqual({ key: 'cat:a', label: 'Auspiciador Vestuario', names: ['Tienda'] });
  });

  it('no muestra categorías vacías ni repite una marca dentro de la misma', () => {
    const groups = groupSponsorsByCategory([
      { tier: 'GOLD', name: 'Hotel' },
      { tier: 'GOLD', name: 'Hotel' },
    ]);
    expect(groups).toEqual([{ key: 'GOLD', label: 'Gold', names: ['Hotel'] }]);
  });

  it('una marca con categoría propia no se cuela en la fija aunque conserve un tier antiguo', () => {
    const groups = groupSponsorsByCategory([{ tier: 'GOLD', category: { id: 'a', name: 'Vestuario', order: 0 }, name: 'Tienda' }]);
    expect(groups.map((g) => g.label)).toEqual(['Vestuario']);
  });
});

describe('servicio de categorías', () => {
  it('rechaza un nombre igual al de una categoría fija', async () => {
    jest.spyOn(prisma.project, 'findFirst').mockResolvedValue({ id: 'p1' } as never);
    const create = jest.spyOn(prisma.sponsorshipCategory, 'create');
    await expect(createCategory('c1', { projectId: 'p1', name: 'Gold' })).rejects.toThrow(/categoría fija/);
    expect(create).not.toHaveBeenCalled();
  });

  it('rechaza un nombre repetido en el mismo certamen aunque cambien tildes o mayúsculas', async () => {
    jest.spyOn(prisma.project, 'findFirst').mockResolvedValue({ id: 'p1' } as never);
    jest.spyOn(prisma.sponsorshipCategory, 'findMany').mockResolvedValue([{ name: 'Auspiciador Vestuario' }] as never);
    await expect(createCategory('c1', { projectId: 'p1', name: 'auspiciador vestuário' })).rejects.toThrow(/ya tiene una categoría/);
  });

  it('no crea categorías en un certamen de otra empresa', async () => {
    const findProject = jest.spyOn(prisma.project, 'findFirst').mockResolvedValue(null);
    await expect(createCategory('c1', { projectId: 'ajeno', name: 'Vestuario' })).rejects.toThrow(/no existe o no pertenece/);
    expect(findProject).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'ajeno', companyId: 'c1' } }));
  });

  it('crea la categoría al final del orden, acotada a la empresa', async () => {
    jest.spyOn(prisma.project, 'findFirst').mockResolvedValue({ id: 'p1' } as never);
    jest.spyOn(prisma.sponsorshipCategory, 'findMany').mockResolvedValue([]);
    jest.spyOn(prisma.sponsorshipCategory, 'aggregate').mockResolvedValue({ _max: { order: 2 } } as never);
    const create = jest.spyOn(prisma.sponsorshipCategory, 'create').mockResolvedValue({ id: 'cat1' } as never);
    await createCategory('c1', { projectId: 'p1', name: 'Aliado Salud' });
    expect(create).toHaveBeenCalledWith({ data: { companyId: 'c1', projectId: 'p1', name: 'Aliado Salud', order: 3 } });
  });

  it('renombrar valida el nombre contra las demás categorías del certamen, sin contarse a sí misma', async () => {
    jest.spyOn(prisma.sponsorshipCategory, 'findFirst').mockResolvedValue({ projectId: 'p1' } as never);
    const findMany = jest.spyOn(prisma.sponsorshipCategory, 'findMany').mockResolvedValue([]);
    const update = jest.spyOn(prisma.sponsorshipCategory, 'updateMany').mockResolvedValue({ count: 1 });
    await renameCategory('c1', 'cat1', 'Nuevo nombre');
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { companyId: 'c1', projectId: 'p1', id: { not: 'cat1' } } }));
    expect(update).toHaveBeenCalledWith({ where: { id: 'cat1', companyId: 'c1' }, data: { name: 'Nuevo nombre' } });
  });

  it('no elimina una categoría en uso y dice quién la usa', async () => {
    jest.spyOn(prisma.sponsorshipCategory, 'findFirst').mockResolvedValue({ id: 'cat1', _count: { contracts: 2, packages: 1, opportunities: 0 } } as never);
    const del = jest.spyOn(prisma.sponsorshipCategory, 'deleteMany');
    await expect(deleteCategory('c1', 'cat1')).rejects.toThrow(/2 contrato\(s\), 1 plan\(es\)/);
    expect(del).not.toHaveBeenCalled();
  });

  it('elimina una categoría sin uso, filtrando por empresa', async () => {
    jest.spyOn(prisma.sponsorshipCategory, 'findFirst').mockResolvedValue({ id: 'cat1', _count: { contracts: 0, packages: 0, opportunities: 0 } } as never);
    const del = jest.spyOn(prisma.sponsorshipCategory, 'deleteMany').mockResolvedValue({ count: 1 });
    await deleteCategory('c1', 'cat1');
    expect(del).toHaveBeenCalledWith({ where: { id: 'cat1', companyId: 'c1' } });
  });

  it('una categoría propia solo vale en su certamen y su empresa', async () => {
    const find = jest.spyOn(prisma.sponsorshipCategory, 'findFirst').mockResolvedValue(null);
    await expect(assertCategoryChoice('c1', 'p1', { categoryId: 'de-otro-certamen' })).rejects.toThrow(/no existe en este certamen/);
    expect(find).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'de-otro-certamen', companyId: 'c1', projectId: 'p1' } }));
  });

  it('exige elegir una y solo una categoría', async () => {
    await expect(assertCategoryChoice('c1', 'p1', {})).rejects.toThrow(/Elige la categoría/);
    await expect(assertCategoryChoice('c1', 'p1', { tier: 'GOLD', categoryId: 'x' })).rejects.toThrow(/Elige la categoría/);
    await expect(assertCategoryChoice('c1', 'p1', { tier: 'GOLD' })).resolves.toBeUndefined();
  });
});

describe('contratos y planes con categoría propia', () => {
  function okOwnership() {
    jest.spyOn(prisma.project, 'findFirst').mockResolvedValue({ id: 'p1' } as never);
    jest.spyOn(prisma.contact, 'findFirst').mockResolvedValue({ id: 'k1' } as never);
  }

  it('guarda el contrato con la categoría propia y sin categoría fija', async () => {
    okOwnership();
    jest.spyOn(prisma.sponsorshipCategory, 'findFirst').mockResolvedValue({ id: 'cat1' } as never);
    const create = jest.spyOn(prisma.sponsorshipContract, 'create').mockResolvedValue({ id: 'ct1' } as never);
    await createSponsorshipContract('c1', { ...contractBase, categoryId: 'cat1', barterDescription: undefined, notes: undefined });
    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({ companyId: 'c1', tier: null, categoryId: 'cat1' }) });
  });

  it('no guarda un contrato con la categoría propia de otro certamen', async () => {
    okOwnership();
    jest.spyOn(prisma.sponsorshipCategory, 'findFirst').mockResolvedValue(null);
    const create = jest.spyOn(prisma.sponsorshipContract, 'create');
    await expect(createSponsorshipContract('c1', { ...contractBase, categoryId: 'ajena' })).rejects.toThrow(/no existe en este certamen/);
    expect(create).not.toHaveBeenCalled();
  });

  it('al pasar un contrato de propia a fija, deja vacía la categoría propia', async () => {
    jest.spyOn(prisma.sponsorshipContract, 'findFirst').mockResolvedValue({ id: 'ct1', projectId: 'p1', contactId: 'k1', categoryId: 'cat1' } as never);
    okOwnership();
    const update = jest.spyOn(prisma.sponsorshipContract, 'updateMany').mockResolvedValue({ count: 1 });
    await updateSponsorshipContract('c1', 'ct1', { tier: 'GOLD' });
    expect(update).toHaveBeenCalledWith({ where: { id: 'ct1', companyId: 'c1' }, data: expect.objectContaining({ tier: 'GOLD', categoryId: null }) });
  });

  it('editar otros datos del contrato no toca su categoría', async () => {
    const update = jest.spyOn(prisma.sponsorshipContract, 'updateMany').mockResolvedValue({ count: 1 });
    jest.spyOn(prisma.sponsorshipContract, 'findFirst').mockResolvedValue({ id: 'ct1' } as never);
    await updateSponsorshipContract('c1', 'ct1', { notes: 'nota' });
    const data = update.mock.calls[0][0].data as Record<string, unknown>;
    expect(data).not.toHaveProperty('tier');
    expect(data).not.toHaveProperty('categoryId');
  });

  it('no mueve un contrato con categoría propia a otro certamen sin elegir una nueva', async () => {
    jest.spyOn(prisma.sponsorshipContract, 'findFirst').mockResolvedValue({ id: 'ct1', projectId: 'p1', contactId: 'k1', categoryId: 'cat1' } as never);
    jest.spyOn(prisma.project, 'findFirst').mockResolvedValue({ id: 'p2' } as never);
    jest.spyOn(prisma.contact, 'findFirst').mockResolvedValue({ id: 'k1' } as never);
    const update = jest.spyOn(prisma.sponsorshipContract, 'updateMany');
    await expect(updateSponsorshipContract('c1', 'ct1', { projectId: 'p2' })).rejects.toThrow(/categoría propia/);
    expect(update).not.toHaveBeenCalled();
  });

  it('el plan valida la categoría contra SU certamen al editarse', async () => {
    jest.spyOn(prisma.sponsorshipPackage, 'findFirst').mockResolvedValue({ projectId: 'p1' } as never);
    const find = jest.spyOn(prisma.sponsorshipCategory, 'findFirst').mockResolvedValue(null);
    const update = jest.spyOn(prisma.sponsorshipPackage, 'updateMany');
    await expect(
      updatePackage('c1', 'pk1', { categoryId: 'ajena', name: 'Plan', price: 1, benefits: [], isPublic: true, showPricePublic: false, order: 0 })
    ).rejects.toThrow(/no existe en este certamen/);
    expect(find).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'ajena', companyId: 'c1', projectId: 'p1' } }));
    expect(update).not.toHaveBeenCalled();
  });

  it('al copiar el tarifario recrea en el destino las categorías propias que usan los planes', async () => {
    jest.spyOn(prisma.project, 'findFirst').mockResolvedValue({ id: 'x' } as never);
    jest.spyOn(prisma.sponsorshipPackage, 'findMany').mockResolvedValue([
      { tier: null, categoryId: 'old1', category: { name: 'Aliado Salud' }, name: 'Plan salud', price: 1, maxSlots: null, benefits: [], description: null, isPublic: true, showPricePublic: false, order: 0 },
      { tier: 'GOLD', categoryId: null, category: null, name: 'Oro', price: 2, maxSlots: 3, benefits: [], description: null, isPublic: true, showPricePublic: false, order: 1 },
    ] as never);
    jest.spyOn(prisma.sponsorshipCategory, 'findMany').mockResolvedValue([]);
    const createCat = jest.spyOn(prisma.sponsorshipCategory, 'create').mockResolvedValue({ id: 'new1' } as never);
    const createMany = jest.spyOn(prisma.sponsorshipPackage, 'createMany').mockResolvedValue({ count: 2 });

    await copyPackages('c1', 'p-origen', 'p-destino');

    expect(createCat).toHaveBeenCalledWith({ data: { companyId: 'c1', projectId: 'p-destino', name: 'Aliado Salud', order: 0 } });
    const rows = (createMany.mock.calls[0][0] as { data: Array<Record<string, unknown>> }).data;
    expect(rows[0]).toMatchObject({ projectId: 'p-destino', tier: null, categoryId: 'new1' });
    expect(rows[1]).toMatchObject({ projectId: 'p-destino', tier: 'GOLD', categoryId: null });
  });

  it('al copiar reutiliza la categoría del destino que ya tiene el mismo nombre', async () => {
    jest.spyOn(prisma.project, 'findFirst').mockResolvedValue({ id: 'x' } as never);
    jest.spyOn(prisma.sponsorshipPackage, 'findMany').mockResolvedValue([
      { tier: null, categoryId: 'old1', category: { name: 'Aliado Salud' }, name: 'Plan', price: 1, maxSlots: null, benefits: [], description: null, isPublic: true, showPricePublic: false, order: 0 },
    ] as never);
    jest.spyOn(prisma.sponsorshipCategory, 'findMany').mockResolvedValue([{ id: 'ya-existe', name: 'Aliado Salud' }] as never);
    const createCat = jest.spyOn(prisma.sponsorshipCategory, 'create');
    const createMany = jest.spyOn(prisma.sponsorshipPackage, 'createMany').mockResolvedValue({ count: 1 });
    await copyPackages('c1', 'p-origen', 'p-destino');
    expect(createCat).not.toHaveBeenCalled();
    expect((createMany.mock.calls[0][0] as { data: Array<Record<string, unknown>> }).data[0]).toMatchObject({ categoryId: 'ya-existe' });
  });
});
