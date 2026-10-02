/**
 * La política pública de la postulación completa el RUT y el domicilio de la
 * organización responsable, pero NO los de una persona natural ni los de una
 * empresa suspendida (ver `getRegistrationPrivacyInfo`).
 */

import { prisma } from '@/lib/prisma';
import { getRegistrationPrivacyInfo } from '@/modules/candidates/services/candidates.service';

const project = (company: Record<string, unknown>) => ({
  name: 'Miss Temuco',
  publicContactEmail: 'hola@miss.cl',
  company: { businessName: 'Productora SpA', rut: '76.543.210-1', status: 'ACTIVE', address: 'Av. Alemania 100', comuna: 'Temuco', ciudad: 'Temuco', settings: { privacyPortalToken: 't'.repeat(64) }, ...company },
});

afterEach(() => jest.restoreAllMocks());

describe('getRegistrationPrivacyInfo', () => {
  it('una persona jurídica publica su RUT, domicilio y enlace de derechos', async () => {
    jest.spyOn(prisma.project, 'findUnique').mockResolvedValue(project({}) as never);
    expect(await getRegistrationPrivacyInfo('x'.repeat(32))).toMatchObject({
      companyRut: '76.543.210-1',
      companyAddress: 'Av. Alemania 100, Temuco, Temuco',
      privacyPortalToken: 't'.repeat(64),
    });
  });

  it('una persona natural NO publica su RUT ni su domicilio particular', async () => {
    jest.spyOn(prisma.project, 'findUnique').mockResolvedValue(project({ rut: '12.345.678-5', businessName: 'Juan Pérez' }) as never);
    const info = await getRegistrationPrivacyInfo('x'.repeat(32));
    expect(info).toMatchObject({ companyRut: null, companyAddress: null, companyName: 'Juan Pérez' });
    // El enlace para ejercer derechos sí se mantiene: es lo que el titular necesita.
    expect(info?.privacyPortalToken).toBe('t'.repeat(64));
  });

  it('una empresa suspendida no publica identidad ni enlace', async () => {
    jest.spyOn(prisma.project, 'findUnique').mockResolvedValue(project({ status: 'SUSPENDED' }) as never);
    expect(await getRegistrationPrivacyInfo('x'.repeat(32))).toMatchObject({ companyRut: null, companyAddress: null, privacyPortalToken: null });
  });

  it('un enlace de postulación inexistente no devuelve nada', async () => {
    jest.spyOn(prisma.project, 'findUnique').mockResolvedValue(null);
    expect(await getRegistrationPrivacyInfo('x'.repeat(32))).toBeNull();
  });
});
