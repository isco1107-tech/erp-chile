'use client';

import { useState } from 'react';
import TurnstileWidget, { isTurnstileConfigured } from '@/components/security/TurnstileWidget';
import { REQUEST_TYPES, REQUEST_TYPE_DESCRIPTIONS, REQUEST_TYPE_LABELS } from '@/lib/privacy/constants';

/**
 * Formulario público (sin sesión) para ejercer derechos sobre datos
 * personales. La empresa sale del token del enlace en el servidor. El campo
 * `website` es el señuelo: oculto para personas, lo llena un bot.
 */
export default function DataSubjectRequestForm({ token, companyName }: { token: string; companyName: string }) {
  const [status, setStatus] = useState<'idle' | 'sending' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileKey, setTurnstileKey] = useState(0);
  const [form, setForm] = useState({ type: 'ACCESS', requesterName: '', requesterEmail: '', requesterRut: '', details: '', acceptsIdentityCheck: false, website: '' });

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setStatus('sending');
    setError(null);
    try {
      const response = await fetch(`/api/public/privacy/${token}/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, ...(turnstileToken ? { 'cf-turnstile-response': turnstileToken } : {}) }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) {
        setError(result?.error ?? 'No pudimos enviar tu solicitud. Intenta de nuevo.');
        setStatus('idle');
        if (isTurnstileConfigured) {
          setTurnstileToken(null);
          setTurnstileKey((key) => key + 1);
        }
        return;
      }
      setStatus('done');
    } catch {
      setError('No pudimos conectarnos. Revisa tu conexión e intenta de nuevo.');
      setStatus('idle');
    }
  }

  if (status === 'done') {
    return (
      <div role="status" className="rounded-xl border border-border bg-card p-5">
        <p className="font-semibold">Recibimos tu solicitud</p>
        <p className="mt-2 text-sm text-muted-foreground">
          {companyName} te enviará un correo de confirmación con la fecha límite de respuesta. Antes de responder verificará tu identidad.
          Revisa también tu carpeta de spam.
        </p>
      </div>
    );
  }

  const field = 'mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm';

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-border bg-card p-5" noValidate>
      <fieldset>
        <legend className="text-sm font-medium">¿Qué quieres hacer?</legend>
        <div className="mt-2 space-y-2">
          {REQUEST_TYPES.map((type) => (
            <label key={type} className="flex cursor-pointer items-start gap-2 text-sm">
              <input type="radio" name="type" className="mt-1" checked={form.type === type} onChange={() => setForm({ ...form, type })} />
              <span><strong>{REQUEST_TYPE_LABELS[type]}.</strong> <span className="text-muted-foreground">{REQUEST_TYPE_DESCRIPTIONS[type]}</span></span>
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="dsrName" className="text-sm font-medium">Tu nombre completo</label>
        <input id="dsrName" className={field} autoComplete="name" maxLength={150} value={form.requesterName} onChange={(e) => setForm({ ...form, requesterName: e.target.value })} required />
      </div>
      <div>
        <label htmlFor="dsrEmail" className="text-sm font-medium">Tu correo</label>
        <input id="dsrEmail" type="email" className={field} autoComplete="email" maxLength={200} value={form.requesterEmail} onChange={(e) => setForm({ ...form, requesterEmail: e.target.value })} required />
        <p className="mt-1 text-xs text-muted-foreground">Te responderemos a este correo.</p>
      </div>
      <div>
        <label htmlFor="dsrRut" className="text-sm font-medium">Tu RUT <span className="font-normal text-muted-foreground">(opcional; nos ayuda a ubicar tus datos)</span></label>
        <input id="dsrRut" className={field} maxLength={12} value={form.requesterRut} onChange={(e) => setForm({ ...form, requesterRut: e.target.value })} placeholder="12.345.678-5" />
      </div>
      <div>
        <label htmlFor="dsrDetails" className="text-sm font-medium">Cuéntanos más <span className="font-normal text-muted-foreground">(opcional)</span></label>
        <textarea id="dsrDetails" className={field} rows={4} maxLength={2000} value={form.details} onChange={(e) => setForm({ ...form, details: e.target.value })} />
      </div>

      {/* Señuelo anti-bots: fuera de la vista y del orden de tabulación. */}
      <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', width: 1, height: 1, overflow: 'hidden' }}>
        <label>No completar<input tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} /></label>
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={form.acceptsIdentityCheck} onChange={(e) => setForm({ ...form, acceptsIdentityCheck: e.target.checked })} />
        <span>Entiendo que {companyName} puede pedirme que acredite mi identidad antes de responder, para no entregar mis datos a otra persona.</span>
      </label>

      <TurnstileWidget key={turnstileKey} action="privacy-request" onToken={setTurnstileToken} />

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      <button
        type="submit"
        className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        disabled={status === 'sending' || !form.acceptsIdentityCheck || !form.requesterName.trim() || !form.requesterEmail.trim() || (isTurnstileConfigured && !turnstileToken)}
      >
        {status === 'sending' ? 'Enviando…' : 'Enviar solicitud'}
      </button>
    </form>
  );
}
