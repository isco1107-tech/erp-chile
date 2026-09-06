'use client';

import { useState } from 'react';
import { HelpCircle, X, Send } from 'lucide-react';
import { Dialog, DialogPortal, DialogBackdrop } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { parseChatResponse } from '@/lib/ai/chat-response';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Botón flotante + panel deslizante del asistente del Manual de Usuario.
 * Mismo patrón/estilo que `AiCopilotDrawer.tsx` (superficie flotante de baja
 * densidad → mismo criterio "Obsidian HUD" de `PROMPT_ERP_V2.md` §G.1), pero
 * en la esquina opuesta (`left-5`) para que ambos widgets convivan sin
 * superponerse en una empresa que además tenga `hasCrm`. Disponible siempre,
 * sin depender de ningún módulo contratado — es ayuda de uso de la app, no
 * una feature de negocio.
 */
export default function ManualAssistantWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  async function handleSend() {
    const content = input.trim();
    if (!content || sending) return;

    const nextMessages: ChatMessage[] = [...messages, { role: 'user', content }];
    setMessages(nextMessages);
    setInput('');
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
    } catch {
      setMessages([...nextMessages, { role: 'assistant', content: '⚠️ No se pudo conectar con el asistente.' }]);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Abrir asistente del manual"
        className="hud-surface fixed bottom-5 left-5 z-40 flex size-14 items-center justify-center rounded-full text-cyan-300 shadow-[0_0_24px_-8px_rgba(34,211,238,0.8)] transition-transform duration-150 hover:scale-105 print:hidden"
      >
        <HelpCircle className="size-6" strokeWidth={1.75} />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogPortal>
          <DialogBackdrop />
          <div
            className={cn(
              'hud-surface fixed inset-y-0 left-0 z-50 flex w-full max-w-md flex-col transition-transform duration-200 ease-out',
              open ? 'translate-x-0' : '-translate-x-full'
            )}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
              <div>
                <p className="hud-label">Asistente del Manual</p>
                <p className="text-sm text-muted-foreground">Pregúntame cómo hacer algo en el sistema</p>
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
                  Pregúntame por ejemplo: &ldquo;¿Cómo emito una boleta?&rdquo;, &ldquo;¿Cómo paso asistencia a una sesión?&rdquo; o &ldquo;¿Cómo creo un plan de pago?&rdquo;
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
        </DialogPortal>
      </Dialog>
    </>
  );
}
