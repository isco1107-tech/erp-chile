'use client';

import { useId, useState, type FormEvent } from 'react';
import { WEB_SITE_HONEYPOT_FIELD } from '@/lib/web-sites/constants';

/**
 * Formulario de contacto de un sitio publicado. Habla con
 * `/api/public/web-sites/[slug]/contact` (sin sesión, con límite por IP y
 * campo señuelo). En la vista previa del editor no envía nada.
 * Usa las variables de tema del sitio (`--ws-*`), no los tokens del panel.
 */

type Status = 'idle' | 'sending' | 'sent' | 'error';

const fieldClass =
  'w-full border border-[color:var(--ws-text)]/25 bg-transparent px-3 py-2.5 text-base text-[color:var(--ws-text)] placeholder:text-[color:var(--ws-text)]/50 focus:outline-2 focus:outline-offset-2 focus:outline-[color:var(--ws-accent)] rounded-[var(--ws-radius)]';

export default function ContactForm({ slug, preview }: { slug: string; preview: boolean }) {
  const uid = useId();
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (preview || status === 'sending') return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setStatus('sending');
    setError('');
    try {
      const response = await fetch(`/api/public/web-sites/${encodeURIComponent(slug)}/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.get('name'),
          email: data.get('email'),
          phone: data.get('phone') ?? '',
          message: data.get('message'),
          [WEB_SITE_HONEYPOT_FIELD]: data.get(WEB_SITE_HONEYPOT_FIELD) ?? '',
        }),
      });
      const result = (await response.json().catch(() => null)) as { success?: boolean; error?: string } | null;
      if (!response.ok || !result?.success) {
        setError(result?.error ?? 'No pudimos enviar tu mensaje. Intenta de nuevo en unos minutos.');
        setStatus('error');
        return;
      }
      form.reset();
      setStatus('sent');
    } catch {
      setError('No hay conexión. Revisa tu internet e intenta de nuevo.');
      setStatus('error');
    }
  }

  if (status === 'sent') {
    return (
      <div role="status" className="border border-[color:var(--ws-accent)] p-5 rounded-[var(--ws-radius)]">
        <p className="text-lg font-semibold">¡Gracias! Recibimos tu mensaje.</p>
        <p className="mt-1 text-[color:var(--ws-muted)]">Te responderemos lo antes posible al correo que dejaste.</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="relative grid gap-4" aria-describedby={status === 'error' ? `${uid}-error` : undefined}>
      <div>
        <label htmlFor={`${uid}-name`} className="mb-1 block text-sm font-medium">Nombre</label>
        <input id={`${uid}-name`} name="name" type="text" required minLength={2} maxLength={80} autoComplete="name" className={fieldClass} disabled={preview} />
      </div>
      <div className="grid gap-4 @md:grid-cols-2">
        <div>
          <label htmlFor={`${uid}-email`} className="mb-1 block text-sm font-medium">Correo</label>
          <input id={`${uid}-email`} name="email" type="email" required maxLength={120} autoComplete="email" className={fieldClass} disabled={preview} />
        </div>
        <div>
          <label htmlFor={`${uid}-phone`} className="mb-1 block text-sm font-medium">Teléfono <span className="font-normal opacity-70">(opcional)</span></label>
          <input id={`${uid}-phone`} name="phone" type="tel" maxLength={30} autoComplete="tel" className={fieldClass} disabled={preview} />
        </div>
      </div>
      <div>
        <label htmlFor={`${uid}-message`} className="mb-1 block text-sm font-medium">Mensaje</label>
        <textarea id={`${uid}-message`} name="message" required minLength={5} maxLength={2000} rows={5} className={fieldClass} disabled={preview} />
      </div>
      {/* Señuelo anti-bots: invisible para personas, los bots suelen completarlo. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          No completar
          <input type="text" name={WEB_SITE_HONEYPOT_FIELD} tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      {status === 'error' && (
        <p id={`${uid}-error`} role="alert" className="text-sm font-medium text-red-700">
          {error}
        </p>
      )}
      <div>
        <button
          type="submit"
          disabled={preview || status === 'sending'}
          className="bg-[color:var(--ws-accent)] px-6 py-3 font-semibold text-[color:var(--ws-on-accent)] rounded-[var(--ws-radius)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status === 'sending' ? 'Enviando…' : 'Enviar mensaje'}
        </button>
        {preview && <p className="mt-2 text-sm opacity-70">Vista previa: el formulario funciona solo en el sitio publicado.</p>}
        <p className="mt-3 text-xs opacity-70">
          Usaremos tus datos solo para responderte, según el{' '}
          <a href={`/aviso-privacidad?flujo=sitio&t=${encodeURIComponent(slug)}`} target="_blank" rel="noopener" className="underline underline-offset-2">
            aviso de privacidad
          </a>
          .
        </p>
      </div>
    </form>
  );
}
