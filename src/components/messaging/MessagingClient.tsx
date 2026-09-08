'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { MessageSquarePlus, Paperclip, Send, X, FileText, Lock, ArrowLeft, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  listConversationsAction,
  listMessagesAction,
  listNewMessagesAction,
  sendMessageAction,
  markConversationReadAction,
  deleteMessageAction,
  deleteConversationAction,
} from '@/modules/messaging/actions/messaging.actions';
import type { ConversationSummary, MessageView, MessageAttachmentView } from '@/modules/messaging/services/messaging.service';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import NewConversationDialog from './NewConversationDialog';

const POLL_MS = 4000;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(date: Date): string {
  return new Date(date).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
}

interface PendingAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export default function MessagingClient({
  currentUserId,
  currentUserName,
}: {
  currentUserId: string;
  currentUserName: string;
}) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageView[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [body, setBody] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteConversationTarget, setDeleteConversationTarget] = useState<{ id: string; title: string } | null>(null);
  const [deletingConversation, setDeletingConversation] = useState(false);

  // Refs sincronizados en un efecto, no durante el render: el polling
  // (setInterval de más abajo) necesita el valor más reciente de `activeId`/
  // `messages` sin recrear el interval en cada cambio, pero mutar `.current`
  // en el cuerpo del componente rompe la garantía de que el render sea puro.
  const activeIdRef = useRef(activeId);
  const messagesRef = useRef(messages);
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // El polling reintenta cada POLL_MS: sin este flag, una falla sostenida
  // (sesión vencida, red inestable) dispararía un toast nuevo cada 4s de
  // forma indefinida. Solo avisa una vez, hasta que vuelva a funcionar.
  const conversationsErrorShownRef = useRef(false);

  const refreshConversations = useCallback(async () => {
    const result = await listConversationsAction();
    if (result.success) {
      setConversations(result.data);
      conversationsErrorShownRef.current = false;
    } else if (!conversationsErrorShownRef.current) {
      toast.error(result.error);
      conversationsErrorShownRef.current = true;
    }
    setLoadingConversations(false);
  }, []);

  useEffect(() => {
    refreshConversations();
    const interval = setInterval(refreshConversations, POLL_MS);
    return () => clearInterval(interval);
  }, [refreshConversations]);

  // Trae mensajes nuevos de la conversación activa sin releer el hilo completo.
  useEffect(() => {
    if (!activeId) return;
    const interval = setInterval(async () => {
      const lastId = messagesRef.current[messagesRef.current.length - 1]?.id;
      if (!lastId) return;
      const result = await listNewMessagesAction(activeId, lastId);
      if (result.success && result.data.length > 0 && activeIdRef.current === activeId) {
        setMessages((current) => [...current, ...result.data]);
        markConversationReadAction({ conversationId: activeId });
      }
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [activeId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  async function openConversation(id: string) {
    setActiveId(id);
    setLoadingMessages(true);
    setPendingAttachments([]);
    setError(null);
    const result = await listMessagesAction({ conversationId: id });
    setLoadingMessages(false);
    if (result.success) setMessages(result.data);
    await markConversationReadAction({ conversationId: id });
    refreshConversations();
  }

  async function handleFilesSelected(fileList: FileList | null) {
    if (!fileList || fileList.length === 0 || !activeId) return;
    setUploading(true);
    setError(null);
    for (const file of Array.from(fileList)) {
      const form = new FormData();
      form.append('file', file);
      form.append('conversationId', activeId);
      try {
        const res = await fetch('/api/messaging/attachments/upload', { method: 'POST', body: form });
        const json = await res.json();
        if (!json.success) {
          setError(json.error ?? 'No se pudo subir el archivo');
          continue;
        }
        setPendingAttachments((prev) => [
          ...prev,
          { id: json.data.id, fileName: file.name, mimeType: file.type, sizeBytes: file.size },
        ]);
      } catch {
        setError('No se pudo subir el archivo');
      }
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleSend() {
    if (!activeId || sending) return;
    if (!body.trim() && pendingAttachments.length === 0) return;
    setSending(true);
    setError(null);
    const result = await sendMessageAction({
      conversationId: activeId,
      body: body.trim() || undefined,
      attachmentIds: pendingAttachments.length > 0 ? pendingAttachments.map((a) => a.id) : undefined,
    });
    setSending(false);
    if (!result.success) return setError(result.error);
    setMessages((prev) => [...prev, result.data]);
    setBody('');
    setPendingAttachments([]);
    refreshConversations();
  }

  async function handleDelete(messageId: string) {
    const result = await deleteMessageAction({ messageId });
    if (result.success) {
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, body: null, deleted: true, attachments: [] } : m)));
    }
  }

  function openDeleteConversation(conversationId: string, title: string, event?: React.MouseEvent) {
    event?.stopPropagation();
    setDeleteConversationTarget({ id: conversationId, title });
  }

  async function handleDeleteConversation() {
    if (!deleteConversationTarget) return;
    const { id: conversationId } = deleteConversationTarget;
    setDeletingConversation(true);
    const result = await deleteConversationAction({ conversationId });
    setDeletingConversation(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    setDeleteConversationTarget(null);
    setConversations((prev) => prev.filter((c) => c.id !== conversationId));
    if (activeIdRef.current === conversationId) {
      setActiveId(null);
      setMessages([]);
    }
  }

  const activeConversation = conversations.find((c) => c.id === activeId) ?? null;

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-card">
      {/* Lista de conversaciones — en móvil ocupa toda la pantalla y se oculta
          al abrir un hilo (una sola columna visible a la vez bajo `sm`). */}
      <div className={cn('flex w-full shrink-0 flex-col border-r border-border sm:w-72', activeId && 'hidden sm:flex')}>
        <div className="flex items-center justify-between border-b border-border p-3">
          <span className="text-sm font-semibold text-foreground">Conversaciones</span>
          <button
            type="button"
            onClick={() => setShowNewChat(true)}
            className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Nueva conversación"
          >
            <MessageSquarePlus className="size-4.5" />
          </button>
        </div>
        <div className="hud-scroll flex-1 space-y-0.5 overflow-y-auto p-2">
          {loadingConversations && (
            <p className="p-4 text-center text-sm text-muted-foreground">Cargando conversaciones...</p>
          )}
          {!loadingConversations && conversations.length === 0 && (
            <p className="p-4 text-center text-sm text-muted-foreground">Sin conversaciones todavía</p>
          )}
          {!loadingConversations && conversations.map((c) => (
            <div key={c.id} className="group/row relative">
              <button
                type="button"
                onClick={() => openConversation(c.id)}
                className={cn(
                  'flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2.5 pr-8 text-left transition-colors hover:bg-muted',
                  activeId === c.id && 'bg-muted'
                )}
              >
                <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent text-xs font-semibold text-accent-foreground">
                  {c.otherUserPhotoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.otherUserPhotoUrl} alt={c.title} className="size-full object-cover" />
                  ) : (
                    c.title.slice(0, 1).toUpperCase()
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-1">
                    <span className="truncate text-sm font-medium text-foreground">{c.title}</span>
                    {c.unreadCount > 0 && (
                      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                        {c.unreadCount > 9 ? '9+' : c.unreadCount}
                      </span>
                    )}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">{c.subtitle ?? 'Sin mensajes aún'}</span>
                </span>
              </button>
              <button
                type="button"
                onClick={(e) => openDeleteConversation(c.id, c.title, e)}
                aria-label={`Eliminar conversación con ${c.title}`}
                title="Eliminar conversación"
                className="absolute top-2 right-1.5 rounded-lg p-1.5 text-muted-foreground opacity-100 hover:bg-destructive/10 hover:text-destructive sm:opacity-0 sm:group-hover/row:opacity-100"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Hilo activo — oculto en móvil hasta elegir una conversación. */}
      <div className={cn('flex min-w-0 flex-1 flex-col', !activeId && 'hidden sm:flex')}>
        {!activeId && (
          <div className="hidden flex-1 flex-col items-center justify-center gap-3 text-center text-muted-foreground sm:flex">
            <MessageSquarePlus className="size-10 opacity-40" />
            <p className="text-sm">Selecciona una conversación o crea una nueva</p>
          </div>
        )}

        {activeId && (
          <>
            <div className="flex items-center gap-2 border-b border-border p-3">
              <button
                type="button"
                onClick={() => setActiveId(null)}
                aria-label="Volver a conversaciones"
                className="-ml-1.5 flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground sm:hidden"
              >
                <ArrowLeft className="size-4.5" />
              </button>
              {activeConversation?.otherUserPhotoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={activeConversation.otherUserPhotoUrl}
                  alt={activeConversation.title}
                  className="size-7 shrink-0 rounded-full object-cover"
                />
              )}
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{activeConversation?.title ?? '...'}</span>
              <span className="hidden shrink-0 items-center gap-1 text-[11px] text-muted-foreground sm:flex">
                <Lock className="size-3" /> cifrado
              </span>
              <button
                type="button"
                onClick={() => openDeleteConversation(activeId, activeConversation?.title ?? 'esta conversación')}
                aria-label="Eliminar conversación"
                title="Eliminar conversación"
                className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="size-4" />
              </button>
            </div>

            <div className="hud-scroll flex-1 space-y-3 overflow-y-auto p-4">
              {loadingMessages && <p className="text-center text-sm text-muted-foreground">Cargando mensajes...</p>}
              {!loadingMessages && messages.length === 0 && (
                <p className="text-center text-sm text-muted-foreground">Todavía no hay mensajes. Escribe el primero.</p>
              )}
              {messages.map((m) => {
                const isOwn = m.senderId === currentUserId;
                return (
                  <div key={m.id} className={cn('flex', isOwn ? 'justify-end' : 'justify-start')}>
                    <div className={cn('group max-w-[70%] rounded-2xl px-3.5 py-2', isOwn ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground')}>
                      {!isOwn && activeConversation?.type === 'GROUP' && (
                        <p className="mb-0.5 text-[11px] font-semibold opacity-70">{m.senderName}</p>
                      )}
                      {m.deleted ? (
                        <p className="text-sm italic opacity-60">Mensaje eliminado</p>
                      ) : (
                        <>
                          {m.body && <p className="text-sm whitespace-pre-wrap">{m.body}</p>}
                          {m.attachments.map((a: MessageAttachmentView) =>
                            a.mimeType.startsWith('image/') ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                key={a.id}
                                src={`/api/messaging/attachments/${a.id}`}
                                alt={a.fileName}
                                className="mt-1.5 max-h-64 w-full max-w-xs rounded-lg object-contain"
                              />
                            ) : (
                              <a
                                key={a.id}
                                href={`/api/messaging/attachments/${a.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={cn(
                                  'mt-1.5 flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs',
                                  isOwn ? 'border-primary-foreground/25' : 'border-border'
                                )}
                              >
                                <FileText className="size-3.5 shrink-0" />
                                <span className="truncate">{a.fileName}</span>
                                <span className="shrink-0 opacity-60">{formatBytes(a.sizeBytes)}</span>
                              </a>
                            )
                          )}
                        </>
                      )}
                      <div className="mt-1 flex items-center justify-end gap-1.5">
                        <span className={cn('text-[10px]', isOwn ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
                          {formatTime(m.createdAt)}
                        </span>
                        {isOwn && !m.deleted && (
                          <button
                            type="button"
                            onClick={() => handleDelete(m.id)}
                            className="text-[10px] text-primary-foreground/70 opacity-0 hover:underline group-hover:opacity-100"
                          >
                            Eliminar
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {error && <p className="px-4 text-sm text-danger">{error}</p>}

            {pendingAttachments.length > 0 && (
              <div className="flex flex-wrap gap-2 border-t border-border px-4 pt-3">
                {pendingAttachments.map((a) => (
                  <span key={a.id} className="flex items-center gap-1.5 rounded-lg border border-border bg-muted px-2 py-1 text-xs">
                    <FileText className="size-3.5" />
                    <span className="max-w-[10rem] truncate">{a.fileName}</span>
                    <button
                      type="button"
                      onClick={() => setPendingAttachments((prev) => prev.filter((p) => p.id !== a.id))}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="size-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="flex items-end gap-2 border-t border-border p-3">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                hidden
                onChange={(e) => handleFilesSelected(e.target.files)}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex size-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                aria-label="Adjuntar archivo"
              >
                <Paperclip className="size-4.5" />
              </button>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Escribe un mensaje..."
                rows={1}
                className="max-h-32 min-h-10 flex-1 resize-none rounded-xl border border-input bg-muted px-3 py-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={sending || (!body.trim() && pendingAttachments.length === 0)}
                className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
                aria-label="Enviar"
              >
                <Send className="size-4.5" />
              </button>
            </div>
          </>
        )}
      </div>

      <NewConversationDialog
        open={showNewChat}
        onOpenChange={setShowNewChat}
        onCreated={(id) => {
          refreshConversations();
          openConversation(id);
        }}
      />

      <ConfirmDialog
        open={deleteConversationTarget !== null}
        onOpenChange={(open) => !open && setDeleteConversationTarget(null)}
        title="Eliminar conversación"
        description={
          deleteConversationTarget
            ? `¿Eliminar la conversación con "${deleteConversationTarget.title}"? Solo desaparece de tu bandeja — si llega un mensaje nuevo, vuelve a aparecer.`
            : ''
        }
        confirmLabel="Eliminar"
        loading={deletingConversation}
        onConfirm={handleDeleteConversation}
      />
    </div>
  );
}
