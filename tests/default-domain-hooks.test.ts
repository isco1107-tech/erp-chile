/**
 * Dónde nace el dominio predeterminado de la empresa: cada página NUEVA lo pide una sola vez,
 * al crearse, y nunca más. Quien después le quita el dominio a una página, o le pone uno
 * comprado aparte, no lo recupera al guardar otra vez.
 *
 *  - certamen: la primera vez que se le pone dirección pública (no al crearlo: aún no es página);
 *  - academia: al crearse el sitio (hay una por empresa);
 *  - tienda independiente: al crearse (es un sitio web con tienda);
 *  - sitio web: ver `web-sites-service.test.ts` (crear y duplicar).
 */

jest.mock('@/lib/email/mailer', () => ({ getAppUrl: () => 'https://app.test' }));
jest.mock('@/lib/observability', () => ({ captureException: jest.fn(), captureMessage: jest.fn() }));
jest.mock('@/lib/hosting/default-domain.service', () => ({ assignDefaultDomain: jest.fn() }));
jest.mock('@/lib/prisma', () => {
  const prisma: Record<string, unknown> = {
    project: { findFirst: jest.fn(), updateMany: jest.fn() },
    academySite: { findFirst: jest.fn(), upsert: jest.fn() },
    webSite: { findUnique: jest.fn(), count: jest.fn(), create: jest.fn() },
    company: { findUnique: jest.fn() },
    warehouse: { findFirst: jest.fn() },
    $queryRaw: jest.fn(),
  };
  prisma.$transaction = (fn: (tx: unknown) => unknown) => fn(prisma);
  return { prisma };
});

import { prisma } from '@/lib/prisma';
import { assignDefaultDomain } from '@/lib/hosting/default-domain.service';
import { updatePublicSite } from '@/modules/projects/services/projects.service';
import { saveAcademySite } from '@/modules/academy/services/academy-site.service';
import { createStorefront } from '@/modules/ecommerce/services/store-workspace.service';
import type { ProjectPublicSiteInput } from '@/modules/projects/schema';
import { emptyAcademyContent, type AcademySiteInput } from '@/lib/academy/site';

const db = prisma as unknown as {
  project: { findFirst: jest.Mock; updateMany: jest.Mock };
  academySite: { findFirst: jest.Mock; upsert: jest.Mock };
  webSite: { findUnique: jest.Mock; count: jest.Mock; create: jest.Mock };
  company: { findUnique: jest.Mock };
  warehouse: { findFirst: jest.Mock };
};
const assign = assignDefaultDomain as jest.Mock;
const COMPANY = 'empresa-1';

beforeEach(() => {
  jest.resetAllMocks();
  assign.mockResolvedValue(null);
});

describe('certamen: la primera vez que recibe dirección pública', () => {
  const input = { publicSlug: 'miss-temuco' } as unknown as ProjectPublicSiteInput;

  function project(before: { publicSlug: string | null }, after: { publicSlug: string | null; customDomain?: string | null }) {
    db.project.findFirst
      .mockResolvedValueOnce(before) // lo que había antes de guardar
      .mockResolvedValueOnce({ id: 'p1', companyId: COMPANY, customDomain: null, customDomainVerifiedAt: null, ...after });
    db.project.updateMany.mockResolvedValue({ count: 1 });
  }

  it('al ponerle dirección por primera vez nace en el dominio de la empresa y el resultado ya lo trae', async () => {
    project({ publicSlug: null }, { publicSlug: 'miss-temuco' });
    assign.mockResolvedValue('miss-temuco.miempresa.cl');

    const saved = await updatePublicSite(COMPANY, 'p1', input);

    expect(assign).toHaveBeenCalledWith(COMPANY, { kind: 'project', id: 'p1' }, 'miss-temuco');
    expect(saved).toMatchObject({ customDomain: 'miss-temuco.miempresa.cl', customDomainVerifiedAt: null });
    // Las dos lecturas y la escritura van siempre con la empresa de la sesión.
    expect(db.project.findFirst.mock.calls.every(([args]) => (args as { where: { companyId: string } }).where.companyId === COMPANY)).toBe(true);
    expect(db.project.updateMany.mock.calls[0]![0].where).toEqual({ id: 'p1', companyId: COMPANY });
  });

  it('si no consigue dominio el certamen se guarda igual, en la dirección de la plataforma', async () => {
    project({ publicSlug: null }, { publicSlug: 'miss-temuco' });
    const saved = await updatePublicSite(COMPANY, 'p1', input);
    expect(saved.customDomain).toBeNull();
  });

  it.each([
    ['ya tenía dirección (guardar otra vez no vuelve a asignar)', { publicSlug: 'miss-temuco' }, { publicSlug: 'miss-temuco' }],
    ['sigue sin dirección pública', { publicSlug: null }, { publicSlug: null }],
    ['ya tiene un dominio propio', { publicSlug: null }, { publicSlug: 'miss-temuco', customDomain: 'misstemuco.cl' }],
  ])('no pide dominio si %s', async (_caso, before, after) => {
    project(before, after);
    await updatePublicSite(COMPANY, 'p1', input);
    expect(assign).not.toHaveBeenCalled();
  });
});

describe('academia: solo al crear el sitio', () => {
  const input = { slug: 'mi-academia', name: 'Mi Academia', heroImageUrl: null, whatsapp: null, contactEmail: null, instagramHandle: null, address: null, content: emptyAcademyContent() } as unknown as AcademySiteInput;

  it('el sitio nuevo nace en el dominio de la empresa', async () => {
    db.academySite.findFirst.mockResolvedValue(null);
    db.academySite.upsert.mockResolvedValue({ id: 'a1' });

    expect(await saveAcademySite(COMPANY, input)).toEqual({ id: 'a1', previousSlug: null });
    expect(assign).toHaveBeenCalledWith(COMPANY, { kind: 'academySite', id: 'a1' }, 'mi-academia');
  });

  it('guardar un sitio que ya existía no vuelve a pedirlo (quien quitó el dominio lo respeta)', async () => {
    db.academySite.findFirst.mockResolvedValue({ slug: 'mi-academia' });
    db.academySite.upsert.mockResolvedValue({ id: 'a1' });

    expect(await saveAcademySite(COMPANY, input)).toEqual({ id: 'a1', previousSlug: 'mi-academia' });
    expect(assign).not.toHaveBeenCalled();
  });
});

describe('tienda independiente: al crearse', () => {
  it('nace en el dominio de la empresa, ya fuera de la transacción de alta', async () => {
    db.company.findUnique.mockResolvedValue({ email: null, phone: null, maxWebSites: 5 });
    db.webSite.count.mockResolvedValue(0);
    db.webSite.findUnique.mockResolvedValue(null);
    db.warehouse.findFirst.mockResolvedValue({ id: 'b1' });
    db.webSite.create.mockImplementation(async ({ data }: { data: { slug: string } }) => ({ id: 'tienda-1', slug: data.slug }));

    const created = await createStorefront(COMPANY, 'Ana', { name: 'Mi Tienda', slug: 'mi-tienda' });

    expect(created).toEqual({ id: 'tienda-1', slug: 'mi-tienda' });
    expect(assign).toHaveBeenCalledWith(COMPANY, { kind: 'webSite', id: 'tienda-1' }, 'mi-tienda');
  });

  it('si no se pudo crear (cupo lleno) no se pide dominio', async () => {
    db.company.findUnique.mockResolvedValue({ email: null, phone: null, maxWebSites: 1 });
    db.webSite.count.mockResolvedValue(1);

    await expect(createStorefront(COMPANY, 'Ana', { name: 'Mi Tienda', slug: 'mi-tienda' })).rejects.toThrow('límite');
    expect(assign).not.toHaveBeenCalled();
  });
});
