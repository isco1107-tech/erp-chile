'use client';

import { useEffect, useState } from 'react';
import { HelpCircle, X, Send, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { parseChatResponse, parseConfirmResponse } from '@/lib/ai/chat-response';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface PendingAction {
  token: string;
  summary: string;
}

/**
 * Botón flotante + panel deslizante del asistente del Manual de Usuario.
 * Mismo estilo que `AiCopilotDrawer.tsx` (superficie flotante de baja
 * densidad → mismo criterio "Obsidian HUD" de `PROMPT_ERP_V2.md` §G.1), pero
 * a la izquierda para que ambos widgets convivan sin superponerse en una
 * empresa que además tenga `hasCrm`. Disponible siempre, sin depender de
 * ningún módulo contratado — es ayuda de uso de la app, no una feature de
 * negocio.
 *
 * Overlay/panel montados a mano (sin `Dialog`/`DialogPortal` de base-ui):
 * ese primitivo espera que su contenido sea un `Popup` real para poder
 * detectar cuándo termina la animación de salida antes de liberar el
 * `inert`/bloqueo de clics que aplica al resto de la página mientras el
 * modal está abierto. Acá el panel es un `div` con su propia transición CSS,
 * no un `Popup` — ese desajuste dejaba la página bloqueada (sin poder hacer
 * clic en nada) después de cerrar el panel. Con un overlay propio no hay
 * ninguna lógica de "esperar a que un elemento anime" de la que depender.
 */
export default function ManualAssistantWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  async function handleSend() {
    const content = input.trim();
    if (!content || sending) return;

    const nextMessages: ChatMessage[] = [...messages, { role: 'user', content }];
    setMessages(nextMessages);
    setInput('');
    setPendingAction(null);
    setSending(true);
    try {
      const res = await fetch('/api/ai/manual-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextMessages }),
      });
      const json = parseChatResponse(await res.json());
      if (!json.success) {
        setMessages([...nextMessages, { role: 'assistant', content: `⚠️ ${json.error}` }]);
        return;
      }
      setMessages([...nextMessages, { role: 'assistant', content: json.data.reply }]);
      setPendingAction(json.data.pendingAction ?? null);
    } catch {
      setMessages([...nextMessages, { role: 'assistant', content: '⚠️ No se pudo conectar con el asistente.' }]);
    } finally {
      setSending(false);
    }
  }

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
      setMessages((prev) => [...prev, { role: 'assistant', content: json.success ? `✅ ${json.data.message}` : `⚠️ ${json.error}` }]);
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

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Abrir asistente del manual"
        className="hud-surface fixed bottom-5 left-5 z-40 flex size-14 items-center justify-center rounded-full text-cyan-300 shadow-[0_0_24px_-8px_rgba(34,211,238,0.8)] transition-transform duration-150 hover:scale-105 print:hidden lg:left-[280px]"
      >
        <HelpCircle className="size-6" strokeWidth={1.75} />
      </button>

      {open && (
        <>
          <div
            role="presentation"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-50 bg-black/50"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Asistente del Manual"
            className={cn('hud-surface fixed inset-y-0 left-0 z-50 flex w-full max-w-md flex-col')}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
              <div>
                <p className="hud-label">Asistente</p>
                <p className="text-sm text-muted-foreground">Te explico cómo hacer algo, o lo hago yo si me lo pides</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Cerrar"
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="hud-scroll flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {messages.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Pregúntame por ejemplo: &ldquo;¿Cómo emito una boleta?&rdquo;, o pídeme directamente &ldquo;Créame un contacto para Juan Pérez, RUT 12.345.678-9, es cliente&rdquo;.
                </p>
              )}
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={cn(
                    'max-w-[85%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap',
                    message.role === 'user' ? 'ml-auto bg-primary text-primary-foreground' : 'bg-muted text-foreground'
                  )}
                >
                  {message.content}
                </div>
              ))}
              {sending && <p className="hud-label">Pensando...</p>}

              {pendingAction && (
                <div className="rounded-xl border border-cyan-300/40 bg-cyan-950/20 p-3">
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
                  void handleSend();
                }}
                className="flex gap-2"
              >
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Escribe tu pregunta..."
                  disabled={sending}
                  maxLength={2000}
                  className="h-10 flex-1 rounded-xl border border-input bg-muted px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
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
      )}
    </>
  );
}
