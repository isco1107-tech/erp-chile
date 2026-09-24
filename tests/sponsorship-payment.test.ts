import { prisma } from '@/lib/prisma';

/**
 * N-15 (auditoría 2026-09-14): `updateSponsorshipPayment` recibe un TOTAL
 * acumulado (no un incremento), así que el `Payment` de tesorería que genera
 * debe ser por la DIFERENCIA respecto al `paidAmount` anterior. Además:
 *   - el tope `paidAmount <= cashAmount` aplica SIEMPRE, incluso cuando
 *     `cashAmount === 0` (canje puro) — antes solo se validaba con
 *     `cashAmount > 0`, así que un canje puro podía "cobrar" cualquier monto.
 *   - un abono mal digitado se puede corregir hacia abajo: genera un
 *     `Payment` EXPENSE por la diferencia en vez de rechazar la corrección.
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

  it('permite corregir hacia abajo un abono mal digitado con un Payment EXPENSE por la diferencia', async () => {
    const tx = fakeTx();
    tx.sponsorshipContract.findFirst
      .mockResolvedValueOnce(contract)
      .mockResolvedValueOnce({ ...contract, paidAmount: 50000, paymentStatus: 'PARTIAL' });

    await updateSponsorshipPayment('c1', 'contract1', { paidAmount: 50000, method: 'EFECTIVO' });

    expect(tx.payment.create).toHaveBeenCalledWith({
      data: {
        companyId: 'c1',
        type: 'EXPENSE',
        contactId: 'contact1',
        sponsorshipContractId: 'contract1',
        amount: 50000, // 100000 - 50000
        paymentMethod: 'EFECTIVO',
        notes: 'Corrección de abono',
      },
    });
  });

  it('rechaza un paidAmount negativo', async () => {
    const tx = fakeTx();
    tx.sponsorshipContract.findFirst.mockResolvedValueOnce(contract);

    await expect(updateSponsorshipPayment('c1', 'contract1', { paidAmount: -1000, method: 'EFECTIVO' })).rejects.toThrow(
      'no puede ser negativo'
    );
    expect(tx.payment.create).not.toHaveBeenCalled();
  });

  it('un canje puro (cashAmount 0) no puede registrar paidAmount > 0 ni generar Payment', async () => {
    const tx = fakeTx();
    const barterContract = { ...contract, cashAmount: 0, paidAmount: 0, isBarter: true };
    tx.sponsorshipContract.findFirst.mockResolvedValueOnce(barterContract);

    await expect(updateSponsorshipPayment('c1', 'contract1', { paidAmount: 50000, method: 'EFECTIVO' })).rejects.toThrow(
      'supera el aporte en efectivo acordado'
    );
    expect(tx.payment.create).not.toHaveBeenCalled();
  });
});
