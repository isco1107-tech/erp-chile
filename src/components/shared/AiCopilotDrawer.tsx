'use client';

import { useEffect, useState } from 'react';
import { Sparkles, X, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { parseChatResponse } from '@/lib/ai/chat-response';
import { COPILOT_OPEN_EVENT } from './assistant-events';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Panel deslizante del Copiloto Financiero. Se abre desde la barra superior
 * (`HeaderAssistantButtons` dispara `COPILOT_OPEN_EVENT`) y usa el mismo tema
 * claro del resto del panel.
 *
 * Overlay/panel montados a mano (sin `Dialog`/`DialogPortal` de base-ui):
 * ese primitivo espera que su contenido sea un `Popup` real para poder
 * detectar cuándo termina la animación de salida antes de liberar el
 * `inert`/bloqueo de clics que aplica al resto de la página mientras el
 * modal está abierto. Acá el panel es un `div` con su propia transición CSS,
 * no un `Popup` — ese desajuste dejaba la página bloqueada (sin poder hacer
 * clic en nada) después de cerrar el panel. Sin streaming ni persistencia:
 * el historial vive en `useState` y se pierde al cerrar la pestaña — a
 * propósito, ver el plan.
 */
export default function AiCopilotDrawer() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const openPanel = () => setOpen(true);
    window.addEventListener(COPILOT_OPEN_EVENT, openPanel);
    return () => window.removeEventListener(COPILOT_OPEN_EVENT, openPanel);
  }, []);

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
    setSending(true);
    try {
      const res = await fetch('/api/ai/copilot', {
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
    } catch {
      setMessages([...nextMessages, { role: 'assistant', content: '⚠️ No se pudo conectar con el copiloto.' }]);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {open && (
        <>
          <div role="presentation" onClick={() => setOpen(false)} className="fixed inset-0 z-50 bg-neutral-950/30 backdrop-blur-[2px] print:hidden" />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Copiloto Financiero"
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-card text-card-foreground shadow-popover print:hidden"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
              <div>
                <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  <Sparkles className="size-3.5 text-primary" aria-hidden="true" /> Copiloto Financiero
                </p>
                <p className="text-sm text-muted-foreground">Ventas, morosidad e IVA en tiempo real</p>
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

            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {messages.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Pregúntame por ejemplo: &ldquo;¿Cuál fue el margen de ventas este mes?&rdquo;, &ldquo;¿Qué proveedores están morosos?&rdquo; o &ldquo;¿Cómo viene el IVA de este mes?&rdquo;
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
              {sending && <p className="text-xs text-muted-foreground">Consultando datos…</p>}
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
