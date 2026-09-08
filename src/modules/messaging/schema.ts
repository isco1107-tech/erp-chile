import { z } from 'zod';

export const startDirectConversationSchema = z.object({
  otherUserId: z.string().min(1, 'Selecciona una persona'),
});

export const startGroupConversationSchema = z.object({
  name: z.string().trim().min(1, 'El grupo necesita un nombre').max(80, 'Máximo 80 caracteres'),
  participantIds: z.array(z.string().min(1)).min(1, 'Selecciona al menos un integrante'),
});

export const sendMessageSchema = z
  .object({
    conversationId: z.string().min(1),
    body: z.string().trim().max(4000, 'Máximo 4.000 caracteres').optional(),
    attachmentIds: z.array(z.string().min(1)).max(10, 'Máximo 10 archivos por mensaje').optional(),
  })
  .refine((data) => Boolean(data.body?.length) || Boolean(data.attachmentIds?.length), {
    message: 'Escribe un mensaje o adjunta un archivo',
    path: ['body'],
  });

export const listMessagesSchema = z.object({
  conversationId: z.string().min(1),
  /** Trae mensajes anteriores a este id (scroll hacia arriba). */
  before: z.string().optional(),
  take: z.number().int().min(1).max(100).optional(),
});

export const markConversationReadSchema = z.object({
  conversationId: z.string().min(1),
});

export const deleteMessageSchema = z.object({
  messageId: z.string().min(1),
});

export const deleteConversationSchema = z.object({
  conversationId: z.string().min(1),
});

export type StartDirectConversationInput = z.infer<typeof startDirectConversationSchema>;
export type StartGroupConversationInput = z.infer<typeof startGroupConversationSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type ListMessagesInput = z.infer<typeof listMessagesSchema>;
