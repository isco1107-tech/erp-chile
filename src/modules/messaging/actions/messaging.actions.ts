'use server';

import { revalidatePath } from 'next/cache';
import { requireAuthWithPermission, authErrorMessage } from '@/lib/auth/guards';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import {
  startDirectConversationSchema,
  startGroupConversationSchema,
  sendMessageSchema,
  listMessagesSchema,
  markConversationReadSchema,
  deleteMessageSchema,
} from '../schema';
import * as messagingService from '../services/messaging.service';
import type {
  CompanyChatUser,
  ConversationSummary,
  MessageView,
} from '../services/messaging.service';

export type ActionResult<T> = { success: true; data: T; message?: string } | { success: false; error: string };

function toErrorMessage(error: unknown): string {
  const authMessage = authErrorMessage(error);
  if (authMessage) return authMessage;
  return toFriendlyErrorMessage(error);
}

export async function listConversationsAction(): Promise<ActionResult<ConversationSummary[]>> {
  try {
    const session = await requireAuthWithPermission('messaging:use');
    const data = await messagingService.listConversations(session.companyId, session.id);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function getTotalUnreadCountAction(): Promise<ActionResult<number>> {
  try {
    const session = await requireAuthWithPermission('messaging:use');
    const data = await messagingService.getTotalUnreadCount(session.companyId, session.id);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function listCompanyUsersForChatAction(): Promise<ActionResult<CompanyChatUser[]>> {
  try {
    const session = await requireAuthWithPermission('messaging:use');
    const data = await messagingService.listCompanyUsersForChat(session.companyId, session.id);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function startDirectConversationAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requireAuthWithPermission('messaging:use');
    const parsed = startDirectConversationSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const data = await messagingService.getOrCreateDirectConversation(session.companyId, session.id, parsed.data.otherUserId);
    revalidatePath('/dashboard/messaging');
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function startGroupConversationAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requireAuthWithPermission('messaging:use');
    const parsed = startGroupConversationSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const data = await messagingService.createGroupConversation(
      session.companyId,
      session.id,
      parsed.data.name,
      parsed.data.participantIds
    );
    revalidatePath('/dashboard/messaging');
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function listMessagesAction(input: unknown): Promise<ActionResult<MessageView[]>> {
  try {
    const session = await requireAuthWithPermission('messaging:use');
    const parsed = listMessagesSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const data = await messagingService.listMessages(session.companyId, session.id, parsed.data);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function listNewMessagesAction(
  conversationId: string,
  afterId: string
): Promise<ActionResult<MessageView[]>> {
  try {
    const session = await requireAuthWithPermission('messaging:use');
    const data = await messagingService.listNewMessages(session.companyId, session.id, conversationId, afterId);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function sendMessageAction(input: unknown): Promise<ActionResult<MessageView>> {
  try {
    const session = await requireAuthWithPermission('messaging:use');
    const parsed = sendMessageSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const data = await messagingService.sendMessage(session.companyId, session.id, parsed.data);
    revalidatePath('/dashboard/messaging');
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function markConversationReadAction(input: unknown): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('messaging:use');
    const parsed = markConversationReadSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    await messagingService.markConversationRead(session.companyId, session.id, parsed.data.conversationId);
    return { success: true, data: null };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function deleteMessageAction(input: unknown): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('messaging:use');
    const parsed = deleteMessageSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    await messagingService.deleteMessage(session.companyId, session.id, parsed.data.messageId);
    revalidatePath('/dashboard/messaging');
    return { success: true, data: null };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}
