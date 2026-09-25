'use client';

import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { formatRut } from '@/lib/chile/rut';
import { CANDIDATE_HONEYPOT_FIELD, MINOR_AGE, candidateSelfRegistrationSchema } from '@/modules/candidates/schema';
import TurnstileWidget, { isTurnstileConfigured } from '@/components/security/TurnstileWidget';
import { Arrow, Check } from './icons';

/**
 * Formulario de inscripción de candidatas: solo los 8 datos de la
 * convocatoria (nombre, RUT, edad, comuna, teléfono, correo, Instagram y por
 * qué quiere participar). Lo usan el micrositio del certamen y la página de
 * inscripción (`/register/candidate/[token]`). Valida con el mismo esquema
 * que el servidor (`candidateSelfRegistrationSchema`) y envía a
 * `/api/public/candidates/{token}/apply`.
 */

const EMPTY = { fullName: '', rut: '', age: '', comuna: '', phone: '', email: '', instagram: '', motivacion: '', guardianName: '', guardianRut: '' };
type Values = typeof EMPTY;

function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: ReactNode }) {
  return (
    <div className={`pgs-field${error ? ' has-error' : ''}`}>
      <label htmlFor={id}>{label}</label>
      {children}
      {error && (
        <p className="pgs-field-error" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}

export function CandidateApplicationForm({
  token,
  minAge,
  privacyHref,
  onSubmitted,
}: {
  token: string;
  minAge: number;
  privacyHref: string;
  /** Aviso al contenedor (p.ej. para mover el foco o cambiar la cabecera). */
  onSubmitted?: (folio: string) => void;
}) {
  const [values, setValues] = useState<Values>(EMPTY);
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<'idle' | 'sending'>('idle');
  const [folio, setFolio] = useState<string | null>(null);
  const [serverError, setServerError] = useState('');
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileKey, setTurnstileKey] = useState(0);
  const honeypot = useRef<HTMLInputElement>(null);

  const set = (key: keyof Values, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };
  const ageNumber = values.age.trim() === '' ? null : Number(values.age);
  const isMinor = ageNumber !== null && Number.isFinite(ageNumber) && ageNumber > 0 && ageNumber < MINOR_AGE;
  const described = (key: keyof Values | 'aceptaTratamientoDatos') => (errors[key] ? { 'aria-invalid': true, 'aria-describedby': `insc-${key}-error` } : {});

  async function submit(event: FormEvent) {
    event.preventDefault();
    setServerError('');
    if (honeypot.current?.value) return;

    const payload = {
      ...values,
      age: ageNumber ?? undefined,
      // Los datos del apoderado solo viajan si declara ser menor de edad.
      guardianName: isMinor ? values.guardianName : undefined,
      guardianRut: isMinor ? values.guardianRut : undefined,
      aceptaTratamientoDatos: consent,
    };
    const parsed = candidateSelfRegistrationSchema.safeParse(payload);
    const next: Record<string, string> = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form');
        if (!next[key]) next[key] = issue.message;
      }
    } else if (parsed.data.age < minAge) {
      next.age = `Debes tener al menos ${minAge} años para postular.`;
    }
    // La regla del apoderado vive en un `superRefine`, que Zod no corre mientras falten otros datos:
    // se adelanta acá para mostrar todos los errores de una vez.
    if (isMinor && !parsed.success) {
      if (values.guardianName.trim().length < 3) next.guardianName ??= 'Como eres menor de edad, indica el nombre de tu madre, padre o apoderado';
      if (!values.guardianRut.trim()) next.guardianRut ??= 'Ingresa el RUT de tu apoderado';
    }
    if (Object.keys(next).length > 0) {
      setErrors(next);
      document.getElementById(`insc-${Object.keys(next)[0]}`)?.focus();
      return;
    }

    setErrors({});
    setStatus('sending');
    try {
      const response = await fetch(`/api/public/candidates/${encodeURIComponent(token)}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          [CANDIDATE_HONEYPOT_FIELD]: honeypot.current?.value ?? '',
          ...(turnstileToken ? { 'cf-turnstile-response': turnstileToken } : {}),
        }),
      });
      const json = (await response.json().catch(() => null)) as { success: boolean; data?: { folio: string }; error?: string } | null;
      if (!json?.success || !json.data) {
        setServerError(json?.error ?? 'No pudimos enviar tu inscripción. Intenta de nuevo.');
        return;
      }
      setFolio(json.data.folio);
      onSubmitted?.(json.data.folio);
    } catch {
      setServerError('No pudimos conectar con el servidor. Revisa tu conexión e intenta de nuevo: tus datos siguen aquí.');
    } finally {
      setStatus('idle');
      if (isTurnstileConfigured) {
        setTurnstileToken(null);
        setTurnstileKey((key) => key + 1);
      }
    }
  }

  if (folio) {
    const firstName = values.fullName.trim().split(/\s+/)[0] ?? '';
    return (
      <div className="pgs-sent" role="status">
        <span className="pgs-sent-mark">
          <Check />
        </span>
        <h3>{firstName ? `¡Gracias, ${firstName}!` : '¡Gracias por inscribirte!'}</h3>
        <p>
          Tu folio es <strong>{folio}</strong>. Te enviamos una copia a tu correo. Espera el llamado, correo o WhatsApp de la organización con el resultado de tu
          preselección.
        </p>
      </div>
    );
  }

  return (
    <form className="pgs-form" onSubmit={submit} noValidate>
      <Field id="insc-fullName" label="Nombre completo" error={errors.fullName}>
        <input id="insc-fullName" value={values.fullName} onChange={(e) => set('fullName', e.target.value)} autoComplete="name" required {...described('fullName')} />
      </Field>
      <div className="pgs-form-grid">
        <Field id="insc-rut" label="RUT" error={errors.rut}>
          <input
            id="insc-rut"
            value={values.rut}
            onChange={(e) => set('rut', e.target.value)}
            onBlur={(e) => e.target.value && set('rut', formatRut(e.target.value))}
            placeholder="12.345.678-9"
            required
            {...described('rut')}
          />
        </Field>
        <Field id="insc-age" label="Edad" error={errors.age}>
          <input id="insc-age" type="number" inputMode="numeric" min={1} max={99} value={values.age} onChange={(e) => set('age', e.target.value)} required {...described('age')} />
        </Field>
      </div>
      <Field id="insc-comuna" label="Comuna donde vives" error={errors.comuna}>
        <input id="insc-comuna" value={values.comuna} onChange={(e) => set('comuna', e.target.value)} autoComplete="address-level2" required {...described('comuna')} />
      </Field>
      <div className="pgs-form-grid">
        <Field id="insc-phone" label="Teléfono de contacto" error={errors.phone}>
          <input id="insc-phone" type="tel" value={values.phone} onChange={(e) => set('phone', e.target.value)} autoComplete="tel" placeholder="+56 9 1234 5678" required {...described('phone')} />
        </Field>
        <Field id="insc-email" label="Correo electrónico" error={errors.email}>
          <input id="insc-email" type="email" value={values.email} onChange={(e) => set('email', e.target.value)} autoComplete="email" required {...described('email')} />
        </Field>
      </div>
      <Field id="insc-instagram" label="Instagram" error={errors.instagram}>
        <input id="insc-instagram" value={values.instagram} onChange={(e) => set('instagram', e.target.value)} placeholder="@usuario" autoCapitalize="none" required {...described('instagram')} />
      </Field>
      <Field id="insc-motivacion" label="¿Por qué quieres participar?" error={errors.motivacion}>
        <textarea id="insc-motivacion" rows={4} value={values.motivacion} onChange={(e) => set('motivacion', e.target.value)} required {...described('motivacion')} />
      </Field>
      {isMinor && (
        <div className="pgs-form-grid">
          <Field id="insc-guardianName" label="Nombre de tu apoderado/a" error={errors.guardianName}>
            <input id="insc-guardianName" value={values.guardianName} onChange={(e) => set('guardianName', e.target.value)} required {...described('guardianName')} />
          </Field>
          <Field id="insc-guardianRut" label="RUT de tu apoderado/a" error={errors.guardianRut}>
            <input
              id="insc-guardianRut"
              value={values.guardianRut}
              onChange={(e) => set('guardianRut', e.target.value)}
              onBlur={(e) => e.target.value && set('guardianRut', formatRut(e.target.value))}
              required
              {...described('guardianRut')}
            />
          </Field>
        </div>
      )}
      <div className={`pgs-consent${errors.aceptaTratamientoDatos ? ' has-error' : ''}`}>
        <label htmlFor="insc-aceptaTratamientoDatos">
          <input
            id="insc-aceptaTratamientoDatos"
            type="checkbox"
            checked={consent}
            onChange={(e) => {
              setConsent(e.target.checked);
              setErrors((prev) => {
                const next = { ...prev };
                delete next.aceptaTratamientoDatos;
                return next;
              });
            }}
            {...described('aceptaTratamientoDatos')}
          />
          <span>
            Acepto el tratamiento de mis datos según la{' '}
            <a href={privacyHref} target="_blank" rel="noopener noreferrer">
              política de privacidad
            </a>{' '}
            del certamen.
          </span>
        </label>
        {errors.aceptaTratamientoDatos && (
          <p className="pgs-field-error" id="insc-aceptaTratamientoDatos-error">
            {errors.aceptaTratamientoDatos}
          </p>
        )}
      </div>
      <input ref={honeypot} type="text" name={CANDIDATE_HONEYPOT_FIELD} tabIndex={-1} autoComplete="off" aria-hidden="true" className="pgs-hp" />
      <TurnstileWidget key={turnstileKey} action="candidate-application" onToken={setTurnstileToken} />
      {serverError && (
        <p className="pgs-form-error" role="alert">
          {serverError}
        </p>
      )}
      <button type="submit" className="pgs-btn is-ink pgs-btn-block" disabled={status === 'sending' || (isTurnstileConfigured && !turnstileToken)}>
        <span>{status === 'sending' ? 'Enviando…' : 'Enviar inscripción'}</span>
        <Arrow className="pgs-btn-icon" />
      </button>
    </form>
  );
}
