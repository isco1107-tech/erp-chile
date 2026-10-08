/**
 * Dominio propio del sitio de la academia y registro común de dominios:
 *  - un dominio es de UN solo sitio en toda la plataforma (certamen, sitio web o academia);
 *  - el dominio de la academia sirve su formulario de inscripción, pero no otras rutas de /academia;
 *  - `/academia/{slug}` solo redirige al dominio cuando ya está verificado, y la primera visita
 *    real por el dominio lo verifica.
 */

const mockPrisma = {
  project: { findUnique: jest.fn() },
  webSite: { findUnique: jest.fn() },
  academySite: { findUnique: jest.fn(), findFirst: jest.fn(), updateMany: jest.fn() },
  academyGroup: { findMany: jest.fn() },
  academyStudent: { count: jest.fn() },
  companySettings: { findUnique: jest.fn() },
};
jest.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));
jest.mock('@/lib/observability', () => ({ captureException: jest.fn() }));
jest.mock('@/lib/hosting/vercel-domains', () => ({
  DEFAULT_APEX_IPV4: '76.76.21.21',
  isVercelDomainsConfigured: () => false,
  addProjectDomain: jest.fn(),
  removeProjectDomain: jest.fn(),
  getDomainStatus: jest.fn(),
  defaultDnsRecords: (domain: string) => [{ type: 'A', name: '@', value: '76.76.21.21', domain }],
}));
jest.mock('node:dns/promises', () => ({ resolve4: jest.fn().mockRejectedValue(new Error('NXDOMAIN')), resolveCname: jest.fn().mockRejectedValue(new Error('NXDOMAIN')) }));

import { customDomainRoute } from '@/lib/hosting/custom-domain';
import { domainOwner, domainTakenByOther } from '@/lib/hosting/domain-lifecycle';
import { removeAcademyDomain, setAcademyDomain } from '@/modules/academy/services/academy-domain.service';
import { getAcademySlugByDomain, getPublicAcademySite } from '@/modules/academy/services/academy-site.service';
import { emptyAcademyContent } from '@/lib/academy/site';

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.project.findUnique.mockResolvedValue(null);
  mockPrisma.webSite.findUnique.mockResolvedValue(null);
  mockPrisma.academySite.findUnique.mockResolvedValue(null);
  mockPrisma.academySite.updateMany.mockResolvedValue({ count: 1 });
});

describe('registro común de dominios', () => {
  it('un dominio libre no es de nadie', async () => {
    expect(await domainOwner('miacademia.cl')).toBeNull();
    expect(await domainTakenByOther('miacademia.cl', { kind: 'academySite', id: 's1' })).toBe(false);
  });

  it('un dominio de un certamen o de un sitio web no se puede usar en la academia', async () => {
    mockPrisma.project.findUnique.mockResolvedValue({ id: 'p1' });
    expect(await domainTakenByOther('miacademia.cl', { kind: 'academySite', id: 's1' })).toBe(true);
    mockPrisma.project.findUnique.mockResolvedValue(null);
    mockPrisma.webSite.findUnique.mockResolvedValue({ id: 'w1' });
    expect(await domainTakenByOther('miacademia.cl', { kind: 'academySite', id: 's1' })).toBe(true);
  });

  it('el dominio de una academia bloquea a certámenes y sitios web, pero no a sí misma', async () => {
    mockPrisma.academySite.findUnique.mockResolvedValue({ id: 's1' });
    expect(await domainOwner('miacademia.cl')).toBe('academySite');
    expect(await domainTakenByOther('miacademia.cl', { kind: 'project', id: 'p1' })).toBe(true);
    expect(await domainTakenByOther('miacademia.cl', { kind: 'webSite', id: 'w1' })).toBe(true);
    expect(await domainTakenByOther('miacademia.cl', { kind: 'academySite', id: 's1' })).toBe(false);
  });
});

describe('rutas en el dominio propio', () => {
  it('el formulario de inscripción de la academia se sirve en su dominio', () => {
    expect(customDomainRoute(`/academia/inscripcion/${'a'.repeat(64)}`)).toEqual({ kind: 'pass' });
  });

  it('otros sitios de academia o la ruta sola no se sirven bajo un dominio ajeno', () => {
    expect(customDomainRoute('/academia/otra-academia')).toEqual({ kind: 'platform' });
    expect(customDomainRoute('/academia')).not.toEqual({ kind: 'pass' });
  });
});

describe('dominio de la academia (servicio)', () => {
  const site = { id: 's1', customDomain: null as string | null, customDomainVerifiedAt: null as Date | null };

  it('guarda el dominio normalizado y devuelve los registros DNS a crear', async () => {
    mockPrisma.academySite.findFirst.mockResolvedValueOnce(site).mockResolvedValue({ ...site, customDomain: 'miacademia.cl' });
    const view = await setAcademyDomain('company-a', 'https://www.MiAcademia.cl/');
    expect(mockPrisma.academySite.updateMany).toHaveBeenCalledWith({ where: { id: 's1', companyId: 'company-a' }, data: { customDomain: 'miacademia.cl', customDomainVerifiedAt: null } });
    expect(view.domain).toBe('miacademia.cl');
    expect(view.verifiedAt).toBeNull();
    expect(view.records.length).toBeGreaterThan(0);
  });

  it('rechaza un dominio que ya usa otro sitio de la plataforma', async () => {
    mockPrisma.academySite.findFirst.mockResolvedValue(site);
    mockPrisma.webSite.findUnique.mockResolvedValue({ id: 'w1' });
    await expect(setAcademyDomain('company-a', 'miacademia.cl')).rejects.toThrow(/ya lo usa/);
    expect(mockPrisma.academySite.updateMany).not.toHaveBeenCalled();
  });

  it('rechaza lo que no es un dominio público', async () => {
    mockPrisma.academySite.findFirst.mockResolvedValue(site);
    await expect(setAcademyDomain('company-a', 'localhost')).rejects.toThrow();
    await expect(setAcademyDomain('company-a', 'miacademia.vercel.app')).rejects.toThrow();
  });

  it('sin sitio creado no hay dominio que guardar', async () => {
    mockPrisma.academySite.findFirst.mockResolvedValue(null);
    await expect(setAcademyDomain('company-a', 'miacademia.cl')).rejects.toThrow(/crea el sitio/);
  });

  it('quitar el dominio lo borra solo del sitio de esta empresa', async () => {
    mockPrisma.academySite.findFirst.mockResolvedValueOnce({ ...site, customDomain: 'miacademia.cl' }).mockResolvedValue(site);
    const view = await removeAcademyDomain('company-a');
    expect(mockPrisma.academySite.updateMany).toHaveBeenCalledWith({ where: { id: 's1', companyId: 'company-a' }, data: { customDomain: null, customDomainVerifiedAt: null } });
    expect(view.domain).toBeNull();
  });
});

describe('sitio publicado bajo su dominio', () => {
  it('un dominio aún no verificado solo responde si la visita llegó por ese mismo dominio, y queda verificado', async () => {
    mockPrisma.academySite.findUnique.mockResolvedValue({ id: 's1', companyId: 'company-a', slug: 'academia-cr', customDomainVerifiedAt: null });
    expect(await getAcademySlugByDomain('miacademia.cl', false)).toBeNull();
    expect(mockPrisma.academySite.updateMany).not.toHaveBeenCalled();
    expect(await getAcademySlugByDomain('miacademia.cl', true)).toBe('academia-cr');
    expect(mockPrisma.academySite.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: 's1', companyId: 'company-a', customDomain: 'miacademia.cl' }) }));
  });

  it('la dirección de la plataforma redirige al dominio solo cuando está verificado', async () => {
    const row = (verifiedAt: Date | null) => ({
      companyId: 'company-a', slug: 'academia-cr', name: 'Academia CR', heroImageUrl: null, whatsapp: '56912345678', contactEmail: null, instagramHandle: null, address: null,
      content: emptyAcademyContent(), customDomain: 'miacademia.cl', customDomainVerifiedAt: verifiedAt,
      company: { businessName: 'CR', status: 'ACTIVE', features: { hasAcademy: true } },
    });
    mockPrisma.academyGroup.findMany.mockResolvedValue([]);
    mockPrisma.companySettings.findUnique.mockResolvedValue(null);
    mockPrisma.academySite.findFirst.mockResolvedValue(row(null));
    expect((await getPublicAcademySite('academia-cr'))?.customDomain).toBeNull();
    mockPrisma.academySite.findFirst.mockResolvedValue(row(new Date()));
    expect((await getPublicAcademySite('academia-cr'))?.customDomain).toBe('miacademia.cl');
  });
});
