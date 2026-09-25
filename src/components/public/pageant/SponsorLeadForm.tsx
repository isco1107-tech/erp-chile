'use client';

import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { publicSponsorLeadSchema, SPONSOR_LEAD_HONEYPOT_FIELD } from '@/modules/crm/schema';
import type { PublicPageantSite } from '@/modules/projects/services/public-site.service';
import { Arrow, Check } from './icons';

/**
 * "Quiero auspiciar": crea la oportunidad en el embudo comercial de la
 * organización (`/api/public/pageants/{slug}/sponsor-lead`). Misma
 * validación que el servidor (`publicSponsorLeadSchema`) y el mismo campo
 * trampa contra bots.
 */

function Field({ id, label, optional, error, children }: { id: string; label: string; optional?: boolean; error?: string; children: ReactNode }) {
  return (
    <div className={`pgs-field${error ? ' has-error' : ''}`}>
      <label htmlFor={id}>
        {label}
        {optional && <span> · opcional</span>}
      </label>
      {children}
      {error && (
        <p className="pgs-field-error" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}

export function SponsorLeadForm({ slug, packages }: { slug: string; packages: PublicPageantSite['packages'] }) {
  const [values, setValues] = useState({ companyName: '', contactName: '', jobTitle: '', email: '', phone: '', packageId: '', message: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [serverError, setServerError] = useState('');
  const honeypot = useRef<HTMLInputElement>(null);
  const set = (key: keyof typeof values, value: string) => setValues((prev) => ({ ...prev, [key]: value }));
  const described = (key: string) => (errors[key] ? { 'aria-invalid': true, 'aria-describedby': `lead-${key}-error` } : {});

  async function submit(event: FormEvent) {
    event.preventDefault();
    setServerError('');
    const payload = { ...values, [SPONSOR_LEAD_HONEYPOT_FIELD]: honeypot.current?.value ?? '' };
    const parsed = publicSponsorLeadSchema.safeParse(payload);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form');
        if (!next[key]) next[key] = issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    setStatus('sending');
    try {
      const response = await fetch(`/api/public/pageants/${encodeURIComponent(slug)}/sponsor-lead`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = (await response.json()) as { success: boolean; error?: string };
      if (!json.success) {
        setServerError(json.error ?? 'No pudimos enviar tu solicitud');
        setStatus('idle');
        return;
      }
      setStatus('sent');
    } catch {
      setServerError('No pudimos enviar tu solicitud. Revisa tu conexión e intenta de nuevo.');
      setStatus('idle');
    }
  }

  if (status === 'sent') {
    return (
      <div className="pgs-sent" role="status">
        <span className="pgs-sent-mark">
          <Check />
        </span>
        <h3>¡Gracias! Recibimos tu interés</h3>
        <p>El equipo comercial te contactará dentro de las próximas 24 horas hábiles con la propuesta.</p>
      </div>
    );
  }

  return (
    <form className="pgs-form" onSubmit={submit} noValidate>
      <div className="pgs-form-grid">
        <Field id="lead-companyName" label="Marca o empresa" error={errors.companyName}>
          <input id="lead-companyName" value={values.companyName} onChange={(e) => set('companyName', e.target.value)} autoComplete="organization" {...described('companyName')} />
        </Field>
        <Field id="lead-contactName" label="Tu nombre" error={errors.contactName}>
          <input id="lead-contactName" value={values.contactName} onChange={(e) => set('contactName', e.target.value)} autoComplete="name" {...described('contactName')} />
        </Field>
        <Field id="lead-email" label="Correo" error={errors.email}>
          <input id="lead-email" type="email" value={values.email} onChange={(e) => set('email', e.target.value)} autoComplete="email" {...described('email')} />
        </Field>
        <Field id="lead-phone" label="Teléfono / WhatsApp" optional error={errors.phone}>
          <input id="lead-phone" type="tel" value={values.phone} onChange={(e) => set('phone', e.target.value)} autoComplete="tel" placeholder="+56 9 …" {...described('phone')} />
        </Field>
        <Field id="lead-jobTitle" label="Cargo" optional error={errors.jobTitle}>
          <input id="lead-jobTitle" value={values.jobTitle} onChange={(e) => set('jobTitle', e.target.value)} autoComplete="organization-title" {...described('jobTitle')} />
        </Field>
        {packages.length > 0 && (
          <Field id="lead-packageId" label="Plan de interés" optional>
            <select id="lead-packageId" value={values.packageId} onChange={(e) => set('packageId', e.target.value)}>
              <option value="">Aún no lo sé</option>
              {packages.map((p) => (
                <option key={p.id} value={p.id} disabled={p.slotsLeft === 0}>
                  {p.name}
                  {p.slotsLeft === 0 ? ' (agotado)' : ''}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
      <Field id="lead-message" label="Cuéntanos qué buscas" optional error={errors.message}>
        <textarea id="lead-message" rows={4} value={values.message} onChange={(e) => set('message', e.target.value)} placeholder="Objetivos de tu marca, público al que quieres llegar, canje posible…" {...described('message')} />
      </Field>
      <input ref={honeypot} type="text" name={SPONSOR_LEAD_HONEYPOT_FIELD} tabIndex={-1} autoComplete="off" aria-hidden="true" className="pgs-hp" />
      {serverError && (
        <p className="pgs-form-error" role="alert">
          {serverError}
        </p>
      )}
      <button type="submit" className="pgs-btn is-ink" disabled={status === 'sending'}>
        <span>{status === 'sending' ? 'Enviando…' : 'Quiero auspiciar'}</span>
        <Arrow className="pgs-btn-icon" />
      </button>
    </form>
  );
}
