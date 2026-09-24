import { prisma } from '@/lib/prisma';

/**
 * N-15 (auditoría 2026-09-14): `updateSponsorshipPayment` recibe un TOTAL
 * acumulado (no un incremento), así que el `Payment` de tesorería que genera
 * debe ser por la DIFERENCIA respecto al `paidAmount` anterior.
 */

jest.mock('@/lib/email/mailer', () => ({ sendEmail: jest.fn().mockResolvedValue({ status: 'logged', provider: 'none' }) }));

import { updateSponsorshipPayment } from '@/modules/sponsorships/services/sponsorships.service';

const contract = {
  id: 'contract1',
  companyId: 'c1',
  contactId: 'contact1',
  cashAmount: 500000,
  paidAmount: 100000,
  paymentStatus: 'PARTIAL' as const,
  isBarter: false,
  tier: 'GOLD' as const,
  contact: { email: null, razonSocial: 'Marca X' },
  project: { name: 'Miss 2026' },
};

function fakeTx() {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    sponsorshipContract: {
      findFirst: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    payment: { create: jest.fn().mockResolvedValue({ id: 'payment1' }) },
  };
  jest.spyOn(prisma, '$transaction').mockImplementation((async (callback: (t: typeof tx) => unknown) => callback(tx)) as never);
  return tx;
}

afterEach(() => jest.restoreAllMocks());

describe('updateSponsorshipPayment', () => {
  it('genera el Payment por la diferencia, no por el total acumulado', async () => {
    const tx = fakeTx();
    tx.sponsorshipContract.findFirst
      .mockResolvedValueOnce(contract)
      .mockResolvedValueOnce({ ...contract, paidAmount: 250000, paymentStatus: 'PARTIAL' });

    await updateSponsorshipPayment('c1', 'contract1', { paidAmount: 250000, method: 'EFECTIVO' });

    expect(tx.payment.create).toHaveBeenCalledWith({
      data: {
        companyId: 'c1',
        type: 'INCOME',
        contactId: 'contact1',
        sponsorshipContractId: 'contract1',
        amount: 150000, // 250000 - 100000, nunca 250000
        paymentMethod: 'EFECTIVO',
      },
    });
  });

  it('no genera Payment si se reenvía el mismo paidAmount', async () => {
    const tx = fakeTx();
    tx.sponsorshipContract.findFirst.mockResolvedValueOnce(contract).mockResolvedValueOnce(contract);

    await updateSponsorshipPayment('c1', 'contract1', { paidAmount: 100000, method: 'EFECTIVO' });

    expect(tx.payment.create).not.toHaveBeenCalled();
  });

  it('rechaza un paidAmount menor al ya registrado', async () => {
    const tx = fakeTx();
    tx.sponsorshipContract.findFirst.mockResolvedValueOnce(contract);

    await expect(updateSponsorshipPayment('c1', 'contract1', { paidAmount: 50000, method: 'EFECTIVO' })).rejects.toThrow(
      'no puede ser menor'
    );
    expect(tx.payment.create).not.toHaveBeenCalled();
  });
});
