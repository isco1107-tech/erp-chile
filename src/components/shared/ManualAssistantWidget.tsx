'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MessageCircleQuestion, X, Send, Check, ArrowRight, RotateCcw, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { parseChatResponse, parseConfirmResponse } from '@/lib/ai/chat-response';
import { parseAssistantMarkdown, type AssistantInline } from '@/lib/ai/assistant-markdown';
import { findHintForPath, hintTopicsForPath, type ManualHint } from '@/modules/manual/hints';
import { MANUAL_ASSISTANT_OPEN_EVENT, type AssistantOpenDetail } from './assistant-events';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  /** Pantalla de lo que el asistente acaba de crear (botón "Ver"). Solo local: no viaja al servidor. */
  href?: string;
}

interface PendingAction {
  token: string;
  summary: string;
}

/** Arranques que sirven en cualquier pantalla. */
const GENERAL_SUGGESTIONS = ['¿Qué puedo hacer en esta pantalla?', '¿Por dónde empiezo a usar el sistema?', 'No me deja hacer algo, ¿por qué?'];

/** Máximo de mensajes que se guardan y se mandan (el endpoint acepta 30). */
const MAX_MESSAGES = 30;

function storageKey(userId: string): string {
  return `assistant-chat:v1:${userId}`;
}

function loadMessages(userId: string): ChatMessage[] {
  try {
    const raw = window.sessionStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is ChatMessage =>
          typeof item === 'object' && item !== null && (item.role === 'user' || item.role === 'assistant') && typeof item.content === 'string'
      )
      .slice(-MAX_MESSAGES);
  } catch {
    return [];
  }
}

function saveMessages(userId: string, messages: ChatMessage[]): void {
  try {
    window.sessionStorage.setItem(storageKey(userId), JSON.stringify(messages.slice(-MAX_MESSAGES)));
  } catch {
    // Sin storage la conversación vive solo mientras la pestaña esté abierta: aceptable.
  }
}

interface ManualAssistantWidgetProps {
  /** Para guardar la conversación por usuario (no se mezcla si otra persona entra en la misma pestaña). */
  userId: string;
  /** Secciones del manual de este usuario, para sugerir preguntas sobre la pantalla actual. */
  manualHints: ManualHint[];
}

/**
 * Panel deslizante del Asistente. Se abre desde la barra superior, desde el
 * Manual ("Preguntar al asistente") o desde un tutorial, con
 * `MANUAL_ASSISTANT_OPEN_EVENT` (opcionalmente con una pregunta que envía
 * solo). Disponible siempre, sin depender de ningún módulo contratado.
 *
 * Overlay/panel montados a mano (sin `Dialog`/`DialogPortal` de base-ui):
 * ese primitivo espera que su contenido sea un `Popup` real para poder
 * detectar cuándo termina la animación de salida antes de liberar el
 * `inert`/bloqueo de clics que aplica al resto de la página mientras el
 * modal está abierto. Acá el panel es un `div` con su propia transición CSS,
 * no un `Popup` — ese desajuste dejaba la página bloqueada (sin poder hacer
 * clic en nada) después de cerrar el panel.
 *
 * La conversación se guarda en `sessionStorage` (por usuario y pestaña) para
 * que recargar o cambiar de pantalla no la borre.
 */
export default function ManualAssistantWidget({ userId, manualHints }: ManualAssistantWidgetProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [confirming, setConfirming] = useState(false);
  const pathname = usePathname();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const loadedRef = useRef(false);

  useEffect(() => {
    setMessages(loadMessages(userId));
    loadedRef.current = true;
  }, [userId]);

  useEffect(() => {
    if (loadedRef.current) saveMessages(userId, messages);
  }, [userId, messages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending, pendingAction]);

  const hint = useMemo(() => findHintForPath(manualHints, pathname), [manualHints, pathname]);
  const screenSuggestions = useMemo(
    () => (hint ? hintTopicsForPath(hint, pathname).slice(0, 3).map((topic) => topic.title) : []),
    [hint, pathname]
  );

  const sendMessage = useCallback(
    async (rawContent: string) => {
      const content = rawContent.trim();
      if (!content || sending) return;

      const nextMessages: ChatMessage[] = [...messages, { role: 'user' as const, content }].slice(-MAX_MESSAGES);
      setMessages(nextMessages);
      setInput('');
      setPendingAction(null);
      setSending(true);
      try {
        const res = await fetch('/api/ai/manual-assistant', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: nextMessages.map(({ role, content: text }) => ({ role, content: text.slice(0, 2000) })),
            currentPath: pathname,
          }),
        });
        const json = parseChatResponse(await res.json());
        if (!json.success) {
          setMessages([...nextMessages, { role: 'assistant', content: `⚠️ ${json.error}` }]);
          return;
        }
        setMessages([...nextMessages, { role: 'assistant', content: json.data.reply }]);
        setPendingAction(json.data.pendingAction ?? null);
      } catch {
        setMessages([...nextMessages, { role: 'assistant', content: '⚠️ No se pudo conectar con el asistente. Revisa tu conexión e inténtalo de nuevo.' }]);
      } finally {
        setSending(false);
      }
    },
    [messages, pathname, sending]
  );

  // Se mantiene una referencia a la última versión para el listener del evento.
  const sendRef = useRef(sendMessage);
  useEffect(() => {
    sendRef.current = sendMessage;
  }, [sendMessage]);

  useEffect(() => {
    function openPanel(event: Event) {
      setOpen(true);
      const question = (event as CustomEvent<AssistantOpenDetail>).detail?.question;
      if (question) void sendRef.current(question);
      else setTimeout(() => inputRef.current?.focus(), 50);
    }
    window.addEventListener(MANUAL_ASSISTANT_OPEN_EVENT, openPanel);
    return () => window.removeEventListener(MANUAL_ASSISTANT_OPEN_EVENT, openPanel);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  async function handleConfirm() {
    if (!pendingAction || confirming) return;
    setConfirming(true);
    try {
      const res = await fetch('/api/ai/manual-assistant/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: pendingAction.token }),
      });
      const json = parseConfirmResponse(await res.json());
      setMessages((prev) => [
        ...prev,
        json.success
          ? { role: 'assistant', content: `✅ ${json.data.message}`, href: json.data.href ?? undefined }
          : { role: 'assistant', content: `⚠️ ${json.error}` },
      ]);
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', content: '⚠️ No se pudo confirmar la acción.' }]);
    } finally {
      setPendingAction(null);
      setConfirming(false);
    }
  }

  function handleCancel() {
    setPendingAction(null);
    setMessages((prev) => [...prev, { role: 'assistant', content: 'Acción cancelada, no se guardó nada.' }]);
  }

  function resetConversation() {
    setMessages([]);
    setPendingAction(null);
    setInput('');
    inputRef.current?.focus();
  }

  if (!open) return null;

  return (
    <>
      <div role="presentation" onClick={() => setOpen(false)} className="fixed inset-0 z-50 bg-neutral-950/30 backdrop-blur-[2px] print:hidden" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Asistente"
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-card text-card-foreground shadow-popover print:hidden"
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              <MessageCircleQuestion className="size-3.5 text-primary" aria-hidden="true" /> Asistente
            </p>
            <p className="truncate text-sm text-muted-foreground">Te explico, te llevo a la pantalla o lo hago por ti</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {messages.length > 0 && (
              <button
                type="button"
                onClick={resetConversation}
                className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                title="Empezar una conversación nueva"
              >
                <RotateCcw className="size-3.5" aria-hidden="true" /> Nueva
              </button>
            )}
            <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar" className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted">
              <X className="size-4" />
            </button>
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
          {messages.length === 0 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Escríbeme con tus palabras lo que necesitas. Te explico paso a paso, te dejo el enlace a la pantalla correcta, te respondo cifras de tu
                empresa o lo hago yo por ti, siempre pidiéndote confirmar antes de guardar.
              </p>
              <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                <p className="font-medium text-foreground">Ejemplos de lo que puedo hacer</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  <li>&ldquo;Crea el cliente Comercial Sur, RUT 76.123.456-7&rdquo;</li>
                  <li>&ldquo;¿Cuánto stock queda del café de grano?&rdquo;</li>
                  <li>&ldquo;Recuérdame revisar la caja todos los lunes&rdquo;</li>
                </ul>
              </div>
              {screenSuggestions.length > 0 && hint && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Sobre esta pantalla ({hint.title})</p>
                  <div className="flex flex-wrap gap-2">
                    {screenSuggestions.map((title) => (
                      <SuggestionChip key={title} label={title} disabled={sending} onClick={() => void sendMessage(`Explícame paso a paso: ${title}`)} />
                    ))}
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Preguntas frecuentes</p>
                <div className="flex flex-wrap gap-2">
                  {GENERAL_SUGGESTIONS.map((suggestion) => (
                    <SuggestionChip key={suggestion} label={suggestion} disabled={sending} onClick={() => void sendMessage(suggestion)} />
                  ))}
                </div>
              </div>
              {hint && (
                <Link
                  href={`/dashboard/manual#${hint.id}`}
                  onClick={() => setOpen(false)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                >
                  <BookOpen className="size-3.5" aria-hidden="true" /> Leer el manual de {hint.title}
                </Link>
              )}
            </div>
          )}

          {messages.map((message, index) => (
            <div
              key={index}
              className={cn(
                'max-w-[88%] rounded-xl px-3 py-2 text-sm',
                message.role === 'user' ? 'ml-auto bg-primary whitespace-pre-wrap text-primary-foreground' : 'bg-muted text-foreground'
              )}
            >
              {message.role === 'user' ? message.content : <AssistantMessage text={message.content} onNavigate={() => setOpen(false)} />}
              {message.href && (
                <Link
                  href={message.href}
                  onClick={() => setOpen(false)}
                  className="mt-2 inline-flex items-center gap-1 rounded-lg bg-card px-2.5 py-1 text-xs font-medium text-foreground shadow-card hover:bg-accent"
                >
                  Ver <ArrowRight className="size-3.5" aria-hidden="true" />
                </Link>
              )}
            </div>
          ))}
          {sending && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-flex gap-0.5" aria-hidden="true">
                <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.2s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.1s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground" />
              </span>
              Pensando…
            </p>
          )}

          {pendingAction && (
            <div className="rounded-xl border border-primary/30 bg-accent p-3">
              <p className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">Revisa antes de confirmar</p>
              <p className="mb-2 text-sm text-foreground">{pendingAction.summary}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void handleConfirm()}
                  disabled={confirming}
                  className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
                >
                  <Check className="size-3.5" /> {confirming ? 'Guardando…' : 'Confirmar'}
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={confirming}
                  className="rounded-lg border border-input px-3 py-1.5 text-xs font-medium text-foreground disabled:opacity-50"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-border p-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void sendMessage(input);
            }}
            className="flex gap-2"
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Escribe tu pregunta o lo que necesitas hacer…"
              disabled={sending}
              maxLength={2000}
              aria-label="Mensaje para el asistente"
              className="h-10 min-w-0 flex-1 rounded-xl border border-input bg-muted px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              aria-label="Enviar"
              className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground disabled:opacity-50"
            >
              <Send className="size-4" />
            </button>
          </form>
        </div>
      </div>
    </>
  );
}

function SuggestionChip({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-full border border-input px-3 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground disabled:opacity-50"
    >
      {label}
    </button>
  );
}

function AssistantMessage({ text, onNavigate }: { text: string; onNavigate: () => void }) {
  const blocks = useMemo(() => parseAssistantMarkdown(text), [text]);
  return (
    <div className="space-y-2 break-words">
      {blocks.map((block, index) =>
        block.type === 'paragraph' ? (
          <p key={index}>
            <Inlines inlines={block.inlines} onNavigate={onNavigate} />
          </p>
        ) : block.ordered ? (
          <ol key={index} className="list-decimal space-y-1 pl-5">
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex}>
                <Inlines inlines={item} onNavigate={onNavigate} />
              </li>
            ))}
          </ol>
        ) : (
          <ul key={index} className="list-disc space-y-1 pl-5">
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex}>
                <Inlines inlines={item} onNavigate={onNavigate} />
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );
}

function Inlines({ inlines, onNavigate }: { inlines: AssistantInline[]; onNavigate: () => void }) {
  return (
    <>
      {inlines.map((inline, index) => {
        if (inline.type === 'bold') return <strong key={index} className="font-semibold">{inline.text}</strong>;
        if (inline.type === 'link') {
          return (
            <Link key={index} href={inline.href} onClick={onNavigate} className="font-medium text-primary underline underline-offset-2 hover:no-underline">
              {inline.text}
            </Link>
          );
        }
        return <span key={index}>{inline.text}</span>;
      })}
    </>
  );
}
