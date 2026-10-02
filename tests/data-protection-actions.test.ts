/**
 * Server Actions de protección de datos: permisos y reglas de la copia descargable.
 *
 *  - la copia exige `company:export` además de `settings:company`;
 *  - solo sale de una solicitud de acceso/portabilidad con la identidad ya verificada,
 *    armada con los datos DE LA SOLICITUD (nunca con texto libre);
 *  - la búsqueda entrega solo lo que los permisos de quien consulta permiten;
 *  - la auditoría no guarda el correo ni el RUT consultados, solo su huella.
 */

const permissions = new Set<string>();
const session = { id: 'u1', email: 'admin@chakra.cl', companyId: 'company-a' };

jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));
jest.mock('@/lib/observability', () => ({ captureException: jest.fn() }));
jest.mock('@/lib/auth/audit', () => ({ createAuditLog: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/lib/email/mailer', () => ({ getAppUrl: () => 'https://app.test' }));
jest.mock('@/lib/auth/guards', () => ({
  requireAuthWithPermission: jest.fn(async (permission: string) => {
    if (!permissions.has(permission)) throw new Error('sin permiso');
    return session;
  }),
  authErrorMessage: () => null,
  can: (_session: unknown, permission: string) => permissions.has(permission),
}));
jest.mock('@/lib/prisma', () => ({ prisma: { company: { findUnique: jest.fn().mockResolvedValue({ businessName: 'Chakra' }) } } }));
jest.mock('@/modules/data-protection/services/requests.service', () => ({
  DataProtectionError: class DataProtectionError extends Error {},
  getDataSubjectRequest: jest.fn(),
}));
jest.mock('@/modules/data-protection/services/personal-data.service', () => ({
  findPersonalData: jest.fn(),
  buildPersonalDataExport: jest.fn(() => ({ datos: {} })),
}));

import { createAuditLog } from '@/lib/auth/audit';
import { exportPersonalDataAction, searchPersonalDataAction } from '@/modules/data-protection/actions/data-protection.actions';
import { getDataSubjectRequest } from '@/modules/data-protection/services/requests.service';
import { findPersonalData } from '@/modules/data-protection/services/personal-data.service';

const verifiedAccess = (over: Record<string, unknown> = {}) => ({
  id: 'r1', type: 'ACCESS', requesterEmail: 'ana@test.cl', requesterRutClean: '123456785', identityVerifiedAt: new Date(), ...over,
});
const emptyResult = { query: { email: 'ana@test.cl', rutClean: null }, sections: [], totalRecords: 0, omitted: [] };

beforeEach(() => {
  jest.clearAllMocks();
  permissions.clear();
  permissions.add('settings:company');
  (findPersonalData as jest.Mock).mockResolvedValue(emptyResult);
});

describe('exportPersonalDataAction', () => {
  it('sin company:export no entrega nada', async () => {
    (getDataSubjectRequest as jest.Mock).mockResolvedValue(verifiedAccess());
    const result = await exportPersonalDataAction('r1');
    expect(result).toEqual({ success: false, error: expect.stringMatching(/permiso/i) });
    expect(findPersonalData).not.toHaveBeenCalled();
  });

  describe('con company:export', () => {
    beforeEach(() => permissions.add('company:export'));

    it('exige identidad verificada', async () => {
      (getDataSubjectRequest as jest.Mock).mockResolvedValue(verifiedAccess({ identityVerifiedAt: null }));
      expect(await exportPersonalDataAction('r1')).toEqual({ success: false, error: expect.stringMatching(/verifica la identidad/i) });
      expect(findPersonalData).not.toHaveBeenCalled();
    });

    it('solo en solicitudes de acceso o portabilidad', async () => {
      (getDataSubjectRequest as jest.Mock).mockResolvedValue(verifiedAccess({ type: 'ERASURE' }));
      expect(await exportPersonalDataAction('r1')).toEqual({ success: false, error: expect.stringMatching(/acceso o portabilidad/i) });
    });

    it('una solicitud inexistente o de otra empresa no se encuentra', async () => {
      (getDataSubjectRequest as jest.Mock).mockResolvedValue(null);
      expect(await exportPersonalDataAction('ajena')).toEqual({ success: false, error: expect.stringMatching(/no encontrada/i) });
      expect(getDataSubjectRequest).toHaveBeenCalledWith('company-a', 'ajena');
    });

    it('busca con el correo y RUT de LA SOLICITUD y con los permisos de quien descarga', async () => {
      (getDataSubjectRequest as jest.Mock).mockResolvedValue(verifiedAccess({ type: 'PORTABILITY' }));
      const result = await exportPersonalDataAction('r1');
      expect(result.success).toBe(true);
      expect(findPersonalData).toHaveBeenCalledWith('company-a', { email: 'ana@test.cl', rut: '123456785' }, { candidatesSensitive: false, payroll: false });
    });

    it('si además tiene los permisos sensibles, los pasa a la búsqueda', async () => {
      permissions.add('candidates:sensitive');
      permissions.add('payroll:read');
      (getDataSubjectRequest as jest.Mock).mockResolvedValue(verifiedAccess());
      await exportPersonalDataAction('r1');
      expect(findPersonalData).toHaveBeenCalledWith('company-a', expect.anything(), { candidatesSensitive: true, payroll: true });
    });

    it('la auditoría guarda la solicitud y una huella, no el correo ni el RUT', async () => {
      (getDataSubjectRequest as jest.Mock).mockResolvedValue(verifiedAccess());
      await exportPersonalDataAction('r1');
      const audit = (createAuditLog as jest.Mock).mock.calls[0]![0] as { metadata: Record<string, unknown> };
      expect(audit.metadata).toMatchObject({ kind: 'export', requestId: 'r1' });
      expect(JSON.stringify(audit)).not.toContain('ana@test.cl');
      expect(JSON.stringify(audit)).not.toContain('123456785');
      expect(audit.metadata.emailRef).toMatch(/^[a-f0-9]{16}$/);
    });
  });
});

describe('searchPersonalDataAction', () => {
  it('valida la entrada con Zod', async () => {
    expect(await searchPersonalDataAction({})).toEqual({ success: false, error: expect.stringMatching(/correo o el RUT/i) });
    expect(await searchPersonalDataAction({ email: 'no-es-correo' })).toEqual({ success: false, error: expect.stringMatching(/correo inválido/i) });
    expect(findPersonalData).not.toHaveBeenCalled();
  });

  it('busca con los permisos sensibles que tenga quien consulta', async () => {
    await searchPersonalDataAction({ email: 'ana@test.cl' });
    expect(findPersonalData).toHaveBeenLastCalledWith('company-a', { email: 'ana@test.cl', rut: undefined }, { candidatesSensitive: false, payroll: false });
    permissions.add('candidates:sensitive');
    await searchPersonalDataAction({ email: 'ana@test.cl' });
    expect(findPersonalData).toHaveBeenLastCalledWith('company-a', expect.anything(), { candidatesSensitive: true, payroll: false });
  });

  it('audita la consulta con una huella y la solicitud de origen, sin el dato consultado', async () => {
    await searchPersonalDataAction({ email: 'ana@test.cl' }, 'r1');
    const audit = (createAuditLog as jest.Mock).mock.calls[0]![0] as { metadata: Record<string, unknown> };
    expect(audit.metadata).toMatchObject({ kind: 'search', requestId: 'r1' });
    expect(JSON.stringify(audit)).not.toContain('ana@test.cl');
  });

  it('sin settings:company no hace nada', async () => {
    permissions.clear();
    const result = await searchPersonalDataAction({ email: 'ana@test.cl' });
    expect(result.success).toBe(false);
    expect(findPersonalData).not.toHaveBeenCalled();
  });
});
