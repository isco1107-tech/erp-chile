/**
 * Aviso de privacidad de los formularios públicos: la empresa responsable
 * sale SOLO del token del enlace, y un token mal formado ni siquiera llega a
 * la base (no sirve para enumerar empresas).
 */
const findFirst = jest.fn();

jest.mock('@/lib/prisma', () => ({
  prisma: {
    project: { findFirst: (...args: unknown[]) => findFirst('project', ...args) },
    sponsorshipContract: { findFirst: (...args: unknown[]) => findFirst('sponsorship', ...args) },
    companySettings: { findFirst: (...args: unknown[]) => findFirst('settings', ...args) },
    customerSurvey: { findFirst: (...args: unknown[]) => findFirst('survey', ...args) },
    webSite: { findFirst: (...args: unknown[]) => findFirst('site', ...args) },
  },
}));

import { getPublicNoticeInfo, isPublicNoticeFlow } from '@/modules/data-protection/services/public-notice.service';

const company = (overrides: Record<string, unknown> = {}) => ({
  businessName: 'Producciones Sur SpA',
  rut: '76.123.456-0',
  status: 'ACTIVE',
  address: 'Av. Siempre Viva 123',
  comuna: 'Temuco',
  ciudad: null,
  email: 'contacto@sur.cl',
  settings: { privacyPortalToken: 'portal-token-1234567890' },
  ...overrides,
});

beforeEach(() => findFirst.mockReset());

describe('getPublicNoticeInfo', () => {
  it('rechaza flujos desconocidos y tokens mal formados sin consultar la base', async () => {
    expect(isPublicNoticeFlow('nomina')).toBe(false);
    expect(await getPublicNoticeInfo('entradas', 'corto')).toBeNull();
    expect(await getPublicNoticeInfo('entradas', "x' OR 1=1 --------")).toBeNull();
    expect(await getPublicNoticeInfo('sitio', 'Sitio_Con_Mayusculas')).toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('identifica a una persona jurídica con RUT, domicilio y portal de derechos', async () => {
    findFirst.mockResolvedValue({ name: 'Miss Araucanía', publicContactEmail: 'miss@sur.cl', company: company() });
    const info = await getPublicNoticeInfo('entradas', 'ticket-token-1234567890');
    expect(findFirst).toHaveBeenCalledWith('project', expect.objectContaining({ where: { ticketSalesToken: 'ticket-token-1234567890' } }));
    expect(info).toMatchObject({
      companyName: 'Producciones Sur SpA',
      companyRut: '76.123.456-0',
      companyAddress: 'Av. Siempre Viva 123, Temuco',
      contactEmail: 'miss@sur.cl',
      projectName: 'Miss Araucanía',
      privacyPortalToken: 'portal-token-1234567890',
    });
  });

  it('no publica RUT ni domicilio de una persona natural', async () => {
    findFirst.mockResolvedValue({ name: 'Gala', publicContactEmail: null, company: company({ rut: '12.345.678-5' }) });
    const info = await getPublicNoticeInfo('votos', 'vote-token-1234567890');
    expect(info?.companyRut).toBeNull();
    expect(info?.companyAddress).toBeNull();
    expect(info?.contactEmail).toBeNull();
  });

  it('una empresa suspendida no expone contacto ni portal', async () => {
    findFirst.mockResolvedValue({ company: company({ status: 'SUSPENDED' }) });
    const info = await getPublicNoticeInfo('cuotas', 'installment-token-123456');
    expect(info?.companyRut).toBeNull();
    expect(info?.privacyPortalToken).toBeNull();
  });

  it('el aviso de un sitio solo existe si el sitio está publicado', async () => {
    findFirst.mockResolvedValue(null);
    expect(await getPublicNoticeInfo('sitio', 'mi-panaderia')).toBeNull();
    expect(findFirst).toHaveBeenCalledWith('site', expect.objectContaining({ where: { slug: 'mi-panaderia', status: 'PUBLISHED' } }));
  });
});
