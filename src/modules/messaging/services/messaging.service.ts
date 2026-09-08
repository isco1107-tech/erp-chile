import { prisma } from '@/lib/prisma';
import type { ConversationType } from '@prisma/client';
import { decryptMessageText, encryptMessageText } from '@/lib/messaging/crypto';
import type { SendMessageInput } from '../schema';

export interface ConversationSummary {
  id: string;
  type: ConversationType;
  /** Nombre del grupo, o nombre de la otra persona si es DIRECT. */
  title: string;
  /** Vista previa del último mensaje (ya descifrada), o null si no hay mensajes. */
  subtitle: string | null;
  /** Solo DIRECT: el otro participante, para mostrar su iniciales/estado. */
  otherUserId: string | null;
  otherUserPhotoUrl: string | null;
  updatedAt: Date;
  unreadCount: number;
}

export interface MessageAttachmentView {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface MessageView {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  body: string | null;
  deleted: boolean;
  createdAt: Date;
  attachments: MessageAttachmentView[];
}

export interface CompanyChatUser {
  id: string;
  name: string;
  email: string;
  role: string;
  photoUrl: string | null;
}

/** Lanza si `userId` no participa de `conversationId` dentro de `companyId` — mismo mensaje genérico para no confirmar si la conversación existe. */
async function assertParticipant(companyId: string, conversationId: string, userId: string) {
  const participant = await prisma.conversationParticipant.findFirst({
    where: { conversationId, userId, conversation: { companyId } },
  });
  if (!participant) throw new Error('Conversación no encontrada');
  return participant;
}

async function computeUnreadCounts(
  participations: Array<{ conversationId: string; lastReadAt: Date | null }>
): Promise<Map<string, number>> {
  const counts = await Promise.all(
    participations.map((p) =>
      prisma.message.count({
        where: { conversationId: p.conversationId, deletedAt: null, createdAt: { gt: p.lastReadAt ?? new Date(0) } },
      })
    )
  );
  return new Map(participations.map((p, i) => [p.conversationId, counts[i]]));
}

export async function listConversations(companyId: string, userId: string): Promise<ConversationSummary[]> {
  const participations = await prisma.conversationParticipant.findMany({
    where: { userId, hiddenAt: null, conversation: { companyId } },
    select: {
      conversationId: true,
      lastReadAt: true,
      conversation: {
        select: {
          id: true,
          type: true,
          name: true,
          updatedAt: true,
          participants: { select: { userId: true, user: { select: { id: true, name: true, photoUrl: true } } } },
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              ciphertext: true,
              deletedAt: true,
              attachments: { select: { fileName: true } },
            },
          },
        },
      },
    },
    orderBy: { conversation: { updatedAt: 'desc' } },
  });

  const unreadCounts = await computeUnreadCounts(
    participations.map((p) => ({ conversationId: p.conversationId, lastReadAt: p.lastReadAt }))
  );

  return participations.map((p) => {
    const conv = p.conversation;
    const other = conv.type === 'DIRECT' ? conv.participants.find((x) => x.userId !== userId)?.user : undefined;
    const title = conv.type === 'GROUP' ? conv.name ?? 'Grupo' : other?.name ?? 'Usuario';

    const lastMessage = conv.messages[0];
    let subtitle: string | null = null;
    if (lastMessage) {
      if (lastMessage.deletedAt) {
        subtitle = 'Mensaje eliminado';
      } else if (lastMessage.ciphertext) {
        const text = decryptMessageText(lastMessage.ciphertext);
        subtitle = text.length > 80 ? `${text.slice(0, 80)}…` : text;
      } else if (lastMessage.attachments.length > 0) {
        subtitle =
          lastMessage.attachments.length === 1
            ? `📎 ${lastMessage.attachments[0].fileName}`
            : `📎 ${lastMessage.attachments.length} archivos`;
      }
    }

    return {
      id: conv.id,
      type: conv.type,
      title,
      subtitle,
      otherUserId: other?.id ?? null,
      otherUserPhotoUrl: other?.photoUrl ?? null,
      updatedAt: conv.updatedAt,
      unreadCount: unreadCounts.get(conv.id) ?? 0,
    };
  });
}

/** Reutiliza la conversación 1 a 1 si ya existía; nunca crea duplicados entre el mismo par. */
export async function getOrCreateDirectConversation(
  companyId: string,
  userId: string,
  otherUserId: string
): Promise<{ id: string }> {
  if (userId === otherUserId) throw new Error('No puedes iniciar una conversación contigo mismo');

  const other = await prisma.user.findFirst({ where: { id: otherUserId, companyId, isActive: true } });
  if (!other) throw new Error('Esa persona no pertenece a tu empresa');

  const directKey = [userId, otherUserId].sort().join(':');
  const existing = await prisma.conversation.findUnique({
    where: { companyId_directKey: { companyId, directKey } },
  });
  if (existing) return { id: existing.id };

  const created = await prisma.conversation.create({
    data: {
      companyId,
      type: 'DIRECT',
      directKey,
      createdById: userId,
      participants: { create: [{ userId }, { userId: otherUserId }] },
    },
  });
  return { id: created.id };
}

export async function createGroupConversation(
  companyId: string,
  creatorId: string,
  name: string,
  participantIds: string[]
): Promise<{ id: string }> {
  const uniqueIds = Array.from(new Set([creatorId, ...participantIds]));
  const validUsers = await prisma.user.findMany({
    where: { id: { in: uniqueIds }, companyId, isActive: true },
    select: { id: true },
  });
  if (validUsers.length !== uniqueIds.length) {
    throw new Error('Algún integrante seleccionado no pertenece a tu empresa');
  }

  const created = await prisma.conversation.create({
    data: {
      companyId,
      type: 'GROUP',
      name,
      createdById: creatorId,
      participants: { create: uniqueIds.map((id) => ({ userId: id })) },
    },
  });
  return { id: created.id };
}

function toMessageView(m: {
  id: string;
  conversationId: string;
  senderId: string;
  sender: { name: string };
  ciphertext: string | null;
  deletedAt: Date | null;
  createdAt: Date;
  attachments: MessageAttachmentView[];
}): MessageView {
  return {
    id: m.id,
    conversationId: m.conversationId,
    senderId: m.senderId,
    senderName: m.sender.name,
    body: !m.deletedAt && m.ciphertext ? decryptMessageText(m.ciphertext) : null,
    deleted: Boolean(m.deletedAt),
    createdAt: m.createdAt,
    attachments: m.deletedAt ? [] : m.attachments,
  };
}

export async function listMessages(
  companyId: string,
  userId: string,
  input: { conversationId: string; before?: string; take?: number }
): Promise<MessageView[]> {
  await assertParticipant(companyId, input.conversationId, userId);
  const take = input.take ?? 30;

  let beforeDate: Date | undefined;
  if (input.before) {
    const cursor = await prisma.message.findFirst({
      where: { id: input.before, conversationId: input.conversationId },
      select: { createdAt: true },
    });
    beforeDate = cursor?.createdAt;
  }

  const messages = await prisma.message.findMany({
    where: { conversationId: input.conversationId, ...(beforeDate ? { createdAt: { lt: beforeDate } } : {}) },
    orderBy: { createdAt: 'desc' },
    take,
    include: {
      sender: { select: { name: true } },
      attachments: { select: { id: true, fileName: true, mimeType: true, sizeBytes: true } },
    },
  });

  return messages.reverse().map(toMessageView);
}

/** Trae solo los mensajes nuevos desde `afterId` — usado por el polling para no releer el hilo completo. */
export async function listNewMessages(
  companyId: string,
  userId: string,
  conversationId: string,
  afterId: string
): Promise<MessageView[]> {
  await assertParticipant(companyId, conversationId, userId);

  const cursor = await prisma.message.findFirst({ where: { id: afterId, conversationId }, select: { createdAt: true } });
  if (!cursor) return [];

  const messages = await prisma.message.findMany({
    where: { conversationId, createdAt: { gt: cursor.createdAt } },
    orderBy: { createdAt: 'asc' },
    include: {
      sender: { select: { name: true } },
      attachments: { select: { id: true, fileName: true, mimeType: true, sizeBytes: true } },
    },
  });

  return messages.map(toMessageView);
}

export async function sendMessage(companyId: string, senderId: string, input: SendMessageInput): Promise<MessageView> {
  await assertParticipant(companyId, input.conversationId, senderId);

  const ciphertext = input.body?.length ? encryptMessageText(input.body) : null;

  const messageId = await prisma.$transaction(async (tx) => {
    const created = await tx.message.create({
      data: { conversationId: input.conversationId, companyId, senderId, ciphertext },
    });

    if (input.attachmentIds?.length) {
      const linked = await tx.messageAttachment.updateMany({
        where: {
          id: { in: input.attachmentIds },
          companyId,
          conversationId: input.conversationId,
          uploadedById: senderId,
          messageId: null,
        },
        data: { messageId: created.id },
      });
      if (linked.count !== input.attachmentIds.length) {
        throw new Error('Uno de los archivos adjuntos ya no está disponible');
      }
    }

    await tx.conversation.update({ where: { id: input.conversationId }, data: { updatedAt: created.createdAt } });
    // El propio remitente nunca debe ver su mensaje como "no leído".
    await tx.conversationParticipant.updateMany({
      where: { conversationId: input.conversationId, userId: senderId },
      data: { lastReadAt: created.createdAt },
    });
    // "Borrar conversación" es ocultarla solo para quien la borra (`hiddenAt`
    // en su propia fila) — un mensaje nuevo la vuelve a hacer relevante para
    // TODOS los participantes, incluso quien la había ocultado.
    await tx.conversationParticipant.updateMany({
      where: { conversationId: input.conversationId, hiddenAt: { not: null } },
      data: { hiddenAt: null },
    });

    return created.id;
  });

  const withRelations = await prisma.message.findUniqueOrThrow({
    where: { id: messageId },
    include: {
      sender: { select: { name: true } },
      attachments: { select: { id: true, fileName: true, mimeType: true, sizeBytes: true } },
    },
  });
  return toMessageView(withRelations);
}

export async function markConversationRead(companyId: string, userId: string, conversationId: string): Promise<void> {
  await assertParticipant(companyId, conversationId, userId);
  await prisma.conversationParticipant.updateMany({
    where: { conversationId, userId },
    data: { lastReadAt: new Date() },
  });
}

export async function deleteMessage(companyId: string, userId: string, messageId: string): Promise<void> {
  const result = await prisma.message.updateMany({
    where: { id: messageId, companyId, senderId: userId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  if (result.count === 0) throw new Error('Mensaje no encontrado');
}

/**
 * "Borrar conversación" oculta la conversación solo para quien la borra
 * (`hiddenAt` en su propia fila de `ConversationParticipant`) — nunca destruye
 * el historial de la otra persona, mismo criterio que `Message.deletedAt`.
 * Vuelve a aparecer automáticamente si llega un mensaje nuevo (ver `sendMessage`).
 */
export async function deleteConversation(companyId: string, userId: string, conversationId: string): Promise<void> {
  await assertParticipant(companyId, conversationId, userId);
  await prisma.conversationParticipant.updateMany({
    where: { conversationId, userId, conversation: { companyId } },
    data: { hiddenAt: new Date() },
  });
}

export async function getTotalUnreadCount(companyId: string, userId: string): Promise<number> {
  // `hiddenAt: null` a propósito, igual que `listConversations`: una
  // conversación borrada (oculta) no debe seguir inflando el badge global —
  // el usuario no tiene forma de "leerla" si ya no aparece en su lista.
  const participations = await prisma.conversationParticipant.findMany({
    where: { userId, hiddenAt: null, conversation: { companyId } },
    select: { conversationId: true, lastReadAt: true },
  });
  const counts = await computeUnreadCounts(participations);
  let total = 0;
  for (const count of counts.values()) total += count;
  return total;
}

export async function listCompanyUsersForChat(companyId: string, excludeUserId: string): Promise<CompanyChatUser[]> {
  return prisma.user.findMany({
    where: { companyId, isActive: true, id: { not: excludeUserId } },
    select: { id: true, name: true, email: true, role: true, photoUrl: true },
    orderBy: { name: 'asc' },
  });
}

/** Crea el registro del adjunto ya cifrado y subido a Blob, sin asociarlo aún a un mensaje. */
export async function createPendingAttachment(
  companyId: string,
  conversationId: string,
  uploadedById: string,
  file: { fileName: string; mimeType: string; sizeBytes: number; blobUrl: string }
): Promise<{ id: string }> {
  await assertParticipant(companyId, conversationId, uploadedById);
  const created = await prisma.messageAttachment.create({
    data: { companyId, conversationId, uploadedById, ...file },
  });
  return { id: created.id };
}

export async function getAttachmentForDownload(companyId: string, userId: string, attachmentId: string) {
  const attachment = await prisma.messageAttachment.findFirst({
    where: { id: attachmentId, companyId },
    include: { message: { select: { deletedAt: true } } },
  });
  if (!attachment) throw new Error('Archivo no encontrado');
  if (attachment.message?.deletedAt) throw new Error('Archivo no encontrado');
  await assertParticipant(companyId, attachment.conversationId, userId);
  return attachment;
}
