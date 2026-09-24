import { prisma } from '@/lib/prisma';

/**
 * N-15 (auditoría 2026-09-14): `registerPromissoryNotePayment` recibe un
 * TOTAL acumulado (no un incremento), así que el `Payment` de tesorería que
 * genera debe ser por la DIFERENCIA respecto al `paidAmount` anterior — de lo
 * contrario, volver a guardar el mismo pagaré duplicaría el cobro cada vez.
 */

jest.mock('@/lib/workflows/engine', () => ({ emitWorkflowEvent: jest.fn() }));

import { emitWorkflowEvent } from '@/lib/workflows/engine';
import { registerPromissoryNotePayment } from '@/modules/promissory-notes/services/promissory-notes.service';

const note = { id: 'note1', companyId: 'c1', contactId: 'contact1', amount: 100000, paidAmount: 30000, paymentStatus: 'PARTIAL' as const };

function fakeTx() {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    promissoryNote: {
      findFirst: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    payment: { create: jest.fn().mockResolvedValue({ id: 'payment1' }) },
  };
  jest.spyOn(prisma, '$transaction').mockImplementation((async (callback: (t: typeof tx) => unknown) => callback(tx)) as never);
  jest.spyOn(prisma.contact, 'findFirst').mockResolvedValue({ razonSocial: 'Marca Auspiciadora' } as never);
  return tx;
}

afterEach(() => {
  jest.restoreAllMocks();
  jest.mocked(emitWorkflowEvent).mockClear();
});

describe('registerPromissoryNotePayment', () => {
  it('genera el Payment por la diferencia, no por el total acumulado', async () => {
    const tx = fakeTx();
    // Segunda lectura (post-update) refleja el nuevo paidAmount.
    tx.promissoryNote.findFirst.mockResolvedValueOnce(note).mockResolvedValueOnce({ ...note, paidAmount: 70000, paymentStatus: 'PARTIAL' });

    await registerPromissoryNotePayment('c1', 'note1', { paidAmount: 70000, method: 'TRANSFERENCIA' });

    expect(tx.payment.create).toHaveBeenCalledWith({
      data: {
        companyId: 'c1',
        type: 'INCOME',
        contactId: 'contact1',
        promissoryNoteId: 'note1',
        amount: 40000, // 70000 - 30000, nunca 70000
        paymentMethod: 'TRANSFERENCIA',
      },
    });
  });

  it('no genera Payment si se reenvía el mismo paidAmount (sin diferencia)', async () => {
    const tx = fakeTx();
    tx.promissoryNote.findFirst.mockResolvedValueOnce(note).mockResolvedValueOnce(note);

    await registerPromissoryNotePayment('c1', 'note1', { paidAmount: 30000, method: 'TRANSFERENCIA' });

    expect(tx.payment.create).not.toHaveBeenCalled();
  });

  it('rechaza un paidAmount menor al ya registrado', async () => {
    const tx = fakeTx();
    tx.promissoryNote.findFirst.mockResolvedValueOnce(note);

    await expect(registerPromissoryNotePayment('c1', 'note1', { paidAmount: 10000, method: 'TRANSFERENCIA' })).rejects.toThrow(
      'no puede ser menor'
    );
    expect(tx.payment.create).not.toHaveBeenCalled();
  });

  it('emite PROMISSORY_NOTE_PAID solo en la transición a PAID', async () => {
    const tx = fakeTx();
    tx.promissoryNote.findFirst
      .mockResolvedValueOnce(note)
      .mockResolvedValueOnce({ ...note, paidAmount: 100000, paymentStatus: 'PAID', status: 'PAID' });

    await registerPromissoryNotePayment('c1', 'note1', { paidAmount: 100000, method: 'TRANSFERENCIA' });

    expect(emitWorkflowEvent).toHaveBeenCalledWith('c1', 'PROMISSORY_NOTE_PAID', {
      noteId: 'note1',
      contactName: 'Marca Auspiciadora',
      amount: 100000,
    });
  });
});
