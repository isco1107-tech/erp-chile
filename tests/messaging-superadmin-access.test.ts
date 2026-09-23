import { prisma } from '@/lib/prisma';
import { decryptMessageText } from '@/lib/messaging/crypto';
import { getAttachmentForDownload, listMessages } from '@/modules/messaging/services/messaging.service';

jest.mock('@/lib/messaging/crypto', () => ({
  decryptMessageText: jest.fn((value: string) => (value === 'encrypted-body' ? 'secret-message' : value)),
  encryptMessageText: jest.fn(),
}));

describe('Mensajería — acceso del superadmin a mensajes eliminados', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('permite ver el contenido de un mensaje eliminado para el usuario isco1107', async () => {
    jest.spyOn(prisma.user, 'findUnique').mockResolvedValue({
      id: 'isco1107',
      email: 'isco1107@erp.test',
      name: 'isco1107',
      isSuperAdmin: false,
    } as never);
    jest.spyOn(prisma.message, 'findMany').mockResolvedValue([
      {
        id: 'msg_1',
        conversationId: 'conv_1',
        senderId: 'worker_1',
        sender: { name: 'Trabajador' },
        ciphertext: 'encrypted-body',
        deletedAt: new Date('2026-09-21T10:00:00Z'),
        createdAt: new Date('2026-09-21T09:00:00Z'),
        attachments: [],
      },
    ] as never);

    const result = await listMessages('company_1', 'isco1107', { conversationId: 'conv_1' });

    expect(result).toHaveLength(1);
    expect(result[0].deleted).toBe(true);
    expect(result[0].body).toBe('secret-message');
    expect(decryptMessageText).toHaveBeenCalledWith('encrypted-body');
  });

  it('permite descargar un adjunto asociado a un mensaje eliminado para isco1107', async () => {
    jest.spyOn(prisma.user, 'findUnique').mockResolvedValue({
      id: 'isco1107',
      email: 'isco1107@erp.test',
      name: 'isco1107',
      isSuperAdmin: false,
    } as never);
    jest.spyOn(prisma.messageAttachment, 'findFirst').mockResolvedValue({
      id: 'att_1',
      companyId: 'company_1',
      conversationId: 'conv_1',
      uploadedById: 'worker_1',
      messageId: 'msg_1',
      fileName: 'archivo.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 123,
      blobUrl: 'https://example.com/file',
      createdAt: new Date('2026-09-21T09:00:00Z'),
      message: { deletedAt: new Date('2026-09-21T10:00:00Z') },
    } as never);

    const attachment = await getAttachmentForDownload('company_1', 'isco1107', 'att_1');

    expect(attachment.id).toBe('att_1');
    expect(attachment.fileName).toBe('archivo.pdf');
  });
});
