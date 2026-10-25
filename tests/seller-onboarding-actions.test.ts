const allowed = new Set<string>();
const current = {
  id: 'u-owner',
  name: 'Dueña',
  email: 'owner@prueba.local',
  companyId: 'company-a',
};
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));
jest.mock('@/lib/auth/guards', () => ({
  requireAuthWithPermission: jest.fn(async (permission: string) => {
    if (!allowed.has(permission)) throw new Error(`Falta ${permission}`);
    return current;
  }),
  can: (_current: unknown, permission: string) => allowed.has(permission),
  assertModuleEnabled: jest.fn(),
  authErrorMessage: () => null,
}));
jest.mock('@/lib/auth/audit', () => ({ createAuditLog: jest.fn() }));
jest.mock('@/modules/contacts/services/contacts.service', () => ({
  createContact: jest.fn(),
}));
jest.mock('@/modules/contacts/services/seller-onboarding.service', () => ({
  createSellerWithInvitation: jest.fn(),
}));
import { createContactAction } from '@/modules/contacts/actions/contacts.actions';
import { createSellerWithInvitation } from '@/modules/contacts/services/seller-onboarding.service';
import { createContact } from '@/modules/contacts/services/contacts.service';
import { assertModuleEnabled } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
const contact = {
  rut: '12.345.678-5',
  razonSocial: 'Miel del Sur',
  isConsignor: true,
  consignmentCommissionBps: 2000,
};
const access = { name: 'Rosa', email: 'rosa@campo.cl' };
beforeEach(() => {
  allowed.clear();
  jest.clearAllMocks();
});
it('crear un seller no permite conceder accesos sin settings:company', async () => {
  allowed.add('contacts:write');
  allowed.add('consignment:write');
  expect(
    await createContactAction({ ...contact, sellerCenterAccess: access }),
  ).toMatchObject({ success: false });
  expect(createSellerWithInvitation).not.toHaveBeenCalled();
  expect(createContact).not.toHaveBeenCalled();
});
it('un módulo apagado se rechaza antes de crear el seller', async () => {
  ['contacts:write', 'consignment:write', 'settings:company'].forEach(
    (permission) => allowed.add(permission),
  );
  jest.mocked(assertModuleEnabled).mockImplementationOnce(() => {
    throw new Error('Módulo desactivado');
  });
  expect(
    await createContactAction({ ...contact, sellerCenterAccess: access }),
  ).toMatchObject({ success: false });
  expect(createSellerWithInvitation).not.toHaveBeenCalled();
});
it('no crea un contacto normal con acceso de seller', async () => {
  allowed.add('contacts:write');
  expect(
    await createContactAction({
      ...contact,
      isConsignor: false,
      sellerCenterAccess: access,
    }),
  ).toMatchObject({ success: false });
  expect(createSellerWithInvitation).not.toHaveBeenCalled();
});
it('el contacto guardado se devuelve aunque el correo falle y se audita solo su acceso', async () => {
  ['contacts:write', 'consignment:write', 'settings:company'].forEach(
    (permission) => allowed.add(permission),
  );
  const saved = { id: 'contact-a', ...contact };
  jest
    .mocked(createSellerWithInvitation)
    .mockResolvedValue({
      contact: saved,
      onboarding: { membershipId: 'membership-a', delivery: 'failed' },
    } as Awaited<ReturnType<typeof createSellerWithInvitation>>);
  const result = await createContactAction({
    ...contact,
    sellerCenterAccess: access,
  });
  expect(result).toMatchObject({
    success: true,
    data: saved,
    onboarding: { delivery: 'failed' },
    message: expect.stringContaining('no pudo enviarse'),
  });
  expect(createSellerWithInvitation).toHaveBeenCalledWith(
    'company-a',
    { id: 'u-owner', name: 'Dueña' },
    contact,
    access,
  );
  expect(createContact).not.toHaveBeenCalled();
  expect(createAuditLog).toHaveBeenCalledWith(
    expect.objectContaining({
      companyId: 'company-a',
      entityId: 'membership-a',
    }),
  );
});
