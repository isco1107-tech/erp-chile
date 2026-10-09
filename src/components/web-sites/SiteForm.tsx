'use client';

import { useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { formatRut, validateRut } from '@/lib/chile/rut';
import { WEB_SITE_HONEYPOT_FIELD } from '@/lib/web-sites/constants';
import { layoutFields, stepChunks, type FormField } from '@/lib/web-sites/forms';

/**
 * Formulario de un sitio publicado (sección «Formulario» y el del bloque
 * «Contacto»). Habla con `/api/public/web-sites/[slug]/contact` (sin sesión,
 * con límite por IP y campo señuelo), que valida las respuestas contra el
 * formulario PUBLICADO: lo que se revisa acá es solo para avisar antes.
 * En la vista previa del editor no envía nada.
 *
 * Usa los tonos de la franja (`--s-*`): se lee igual sobre fondo claro, de
 * color u oscuro. Recibe las preguntas sin su rol en el ERP (eso no sale al
 * navegador).
 */

export type PublicFormField = Pick<FormField, 'id' | 'kind' | 'label' | 'help' | 'required' | 'options'> & { autoComplete?: string };

interface SiteFormProps {
  slug: string;
  preview: boolean;
  formId: string;
  fields: PublicFormField[];
  submitLabel: string;
  successTitle: string;
  successText: string;
  /** Casilla obligatoria de aceptación del aviso de privacidad (si no, solo el aviso). */
  consentCheckbox: boolean;
  /** Diseño «Por pasos»: las preguntas en pasos cortos con barra de avance. */
  steps?: boolean;
}

type Status = 'idle' | 'sending' | 'sent' | 'error';

const today = (): string => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });

function Required() {
  return (
    <span className="ws-muted font-normal" aria-hidden="true">
      {' '}*
    </span>
  );
}

export default function SiteForm({ slug, preview, formId, fields, submitLabel, successTitle, successText, consentCheckbox, steps = false }: SiteFormProps) {
  const uid = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const chunks = useMemo(() => (steps ? stepChunks(fields) : [fields]), [fields, steps]);
  const [step, setStep] = useState(0);
  const total = chunks.length;
  const isLast = step >= total - 1;
  const stepOf = useMemo(() => {
    const map = new Map<string, number>();
    chunks.forEach((chunk, index) => chunk.forEach((field) => map.set(field.id, index)));
    return map;
  }, [chunks]);
  const half = useMemo(() => new Set(layoutFields(fields).filter((entry) => entry.span === 'half').map((entry) => entry.field.id)), [fields]);
  const idOf = (fieldId: string) => `${uid}-${fieldId}`;

  function setFieldError(fieldId: string, message: string | null) {
    setFieldErrors((current) => {
      if (!message) {
        if (!(fieldId in current)) return current;
        const { [fieldId]: _removed, ...rest } = current;
        return rest;
      }
      return { ...current, [fieldId]: message };
    });
  }

  /** Primer control inválido del formulario o del paso indicado. */
  function firstInvalid(onlyStep?: number): HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null {
    const form = formRef.current;
    if (!form) return null;
    for (const element of Array.from(form.elements)) {
      if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement)) continue;
      const fieldId = element.dataset.field;
      if (!fieldId && element.name !== 'acceptPrivacy') continue;
      if (onlyStep !== undefined && fieldId && stepOf.get(fieldId) !== onlyStep) continue;
      if (onlyStep !== undefined && !fieldId && onlyStep !== total - 1) continue;
      if (!element.checkValidity()) return element;
    }
    return null;
  }

  function reveal(element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement) {
    const target = element.dataset.field ? stepOf.get(element.dataset.field) : total - 1;
    if (target !== undefined && target !== step) setStep(target);
    // Tras cambiar de paso, el control ya está en pantalla.
    window.requestAnimationFrame(() => {
      element.focus();
      element.reportValidity();
    });
  }

  function next() {
    if (!preview) {
      const invalid = firstInvalid(step);
      if (invalid) return reveal(invalid);
    }
    setStep((current) => Math.min(current + 1, total - 1));
  }

  function collect(form: HTMLFormElement): Record<string, string | boolean> {
    const data = new FormData(form);
    const answers: Record<string, string | boolean> = {};
    for (const field of fields) {
      if (field.kind === 'checkbox') answers[field.id] = data.get(field.id) === 'on';
      else answers[field.id] = String(data.get(field.id) ?? '');
    }
    return answers;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (preview || status === 'sending') return;
    if (steps && !isLast) return next();
    const form = event.currentTarget;
    const invalid = firstInvalid();
    if (invalid) return reveal(invalid);
    const data = new FormData(form);
    setStatus('sending');
    setError('');
    try {
      const response = await fetch(`/api/public/web-sites/${encodeURIComponent(slug)}/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formId,
          answers: collect(form),
          acceptPrivacy: consentCheckbox ? data.get('acceptPrivacy') === 'on' : undefined,
          [WEB_SITE_HONEYPOT_FIELD]: data.get(WEB_SITE_HONEYPOT_FIELD) ?? '',
        }),
      });
      const result = (await response.json().catch(() => null)) as { success?: boolean; error?: string; fieldId?: string } | null;
      if (!response.ok || !result?.success) {
        const message = result?.error ?? 'No pudimos enviar el formulario. Intenta de nuevo en unos minutos.';
        setError(message);
        setStatus('error');
        if (result?.fieldId) {
          setFieldError(result.fieldId, message);
          const element = form.querySelector<HTMLInputElement>(`[data-field="${CSS.escape(result.fieldId)}"]`);
          const target = stepOf.get(result.fieldId);
          if (target !== undefined) setStep(target);
          if (element) window.requestAnimationFrame(() => element.focus());
        }
        return;
      }
      form.reset();
      setFieldErrors({});
      setStep(0);
      setStatus('sent');
    } catch {
      setError('No hay conexión. Revisa tu internet e intenta de nuevo.');
      setStatus('error');
    }
  }

  if (status === 'sent') {
    return (
      <div role="status" className="ws-form-done">
        <span className="ws-icon-tile size-11 shrink-0 rounded-full" aria-hidden="true">
          <Check className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-lg font-semibold">{successTitle}</p>
          {successText && <p className="ws-muted mt-1">{successText}</p>}
          <button type="button" onClick={() => setStatus('idle')} className="mt-3 text-sm font-semibold underline underline-offset-4">
            Enviar otra respuesta
          </button>
        </div>
      </div>
    );
  }

  const renderField = (field: PublicFormField): ReactNode => {
    const id = idOf(field.id);
    const helpId = field.help ? `${id}-help` : undefined;
    const errorId = fieldErrors[field.id] ? `${id}-error` : undefined;
    const describedBy = [helpId, errorId].filter(Boolean).join(' ') || undefined;
    const invalid = Boolean(fieldErrors[field.id]);
    const common = {
      id,
      name: field.id,
      'data-field': field.id,
      required: field.required,
      disabled: preview,
      'aria-describedby': describedBy,
      'aria-invalid': invalid || undefined,
      onInput: () => setFieldError(field.id, null),
    };
    const label = (
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {field.label}
        {field.required && <Required />}
      </label>
    );
    const help = field.help ? (
      <p id={helpId} className="ws-muted mt-1 text-xs">
        {field.help}
      </p>
    ) : null;
    const fieldError = fieldErrors[field.id] ? (
      <p id={errorId} className="ws-error mt-1">
        {fieldErrors[field.id]}
      </p>
    ) : null;

    switch (field.kind) {
      case 'longtext':
        return (
          <>
            {label}
            <textarea {...common} rows={4} maxLength={3000} className="ws-field" />
            {help}
            {fieldError}
          </>
        );
      case 'select':
        return (
          <>
            {label}
            <select {...common} defaultValue="" className="ws-field ws-field-select">
              <option value="" disabled={field.required}>
                Elige una opción
              </option>
              {field.options.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            {help}
            {fieldError}
          </>
        );
      case 'choice':
        return (
          <fieldset aria-describedby={describedBy} className="min-w-0">
            <legend className="mb-1.5 text-sm font-medium">
              {field.label}
              {field.required && <Required />}
            </legend>
            <div className="flex flex-wrap gap-2">
              {field.options.map((option, index) => (
                <label key={option} className="ws-choice">
                  <input type="radio" name={field.id} value={option} data-field={index === 0 ? field.id : undefined} required={field.required} disabled={preview} onInput={() => setFieldError(field.id, null)} />
                  <span className="min-w-0">{option}</span>
                </label>
              ))}
            </div>
            {help}
            {fieldError}
          </fieldset>
        );
      case 'checkbox':
        return (
          <>
            <label htmlFor={id} className="flex items-start gap-3 text-sm">
              <input {...common} type="checkbox" className="mt-0.5 size-4 shrink-0" />
              <span className="min-w-0">
                {field.label}
                {field.required && <Required />}
              </span>
            </label>
            {help}
            {fieldError}
          </>
        );
      case 'rut':
        return (
          <>
            {label}
            <input
              {...common}
              type="text"
              inputMode="text"
              autoComplete="off"
              maxLength={14}
              placeholder="12.345.678-5"
              className="ws-field"
              onBlur={(event) => {
                const value = event.currentTarget.value.trim();
                if (!value) return event.currentTarget.setCustomValidity('');
                const ok = validateRut(value);
                event.currentTarget.setCustomValidity(ok ? '' : 'El RUT no es válido: revisa el dígito verificador.');
                if (ok) event.currentTarget.value = formatRut(value);
                setFieldError(field.id, ok ? null : 'El RUT no es válido: revisa el dígito verificador.');
              }}
              onInput={(event) => {
                event.currentTarget.setCustomValidity('');
                setFieldError(field.id, null);
              }}
            />
            {help}
            {fieldError}
          </>
        );
      case 'date':
        return (
          <>
            {label}
            <input {...common} type="date" max={field.autoComplete === 'bday' ? today() : undefined} autoComplete={field.autoComplete} className="ws-field" />
            {help}
            {fieldError}
          </>
        );
      case 'number':
        return (
          <>
            {label}
            <input {...common} type="text" inputMode="numeric" maxLength={14} pattern="[0-9.\s$]*" className="ws-field" />
            {help}
            {fieldError}
          </>
        );
      case 'email':
        return (
          <>
            {label}
            <input {...common} type="email" maxLength={120} autoComplete={field.autoComplete ?? 'email'} className="ws-field" />
            {help}
            {fieldError}
          </>
        );
      case 'phone':
        return (
          <>
            {label}
            <input {...common} type="tel" inputMode="tel" minLength={8} maxLength={30} autoComplete={field.autoComplete ?? 'tel'} placeholder="+56 9 1234 5678" className="ws-field" />
            {help}
            {fieldError}
          </>
        );
      case 'text':
        return (
          <>
            {label}
            <input {...common} type="text" maxLength={200} autoComplete={field.autoComplete} className="ws-field" />
            {help}
            {fieldError}
          </>
        );
    }
  };

  const privacy = (
    <a href={`/aviso-privacidad?flujo=sitio&t=${encodeURIComponent(slug)}`} target="_blank" rel="noopener" className="underline underline-offset-2">
      aviso de privacidad
    </a>
  );

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="relative grid gap-5" aria-describedby={status === 'error' ? `${uid}-error` : undefined}>
      {steps && total > 1 && (
        <div>
          <p className="ws-muted mb-2 text-xs font-semibold tracking-wider uppercase" aria-live="polite">
            Paso {step + 1} de {total}
          </p>
          <div className="ws-progress" aria-hidden="true">
            <div className="ws-progress-bar" style={{ transform: `scaleX(${(step + 1) / total})` }} />
          </div>
        </div>
      )}
      {chunks.map((chunk, index) => (
        <div key={index} hidden={index !== step} className="grid min-w-0 gap-4 @md:grid-cols-2">
          {chunk.map((field) => (
            <div key={field.id} className={half.has(field.id) ? 'min-w-0' : 'min-w-0 @md:col-span-2'}>
              {renderField(field)}
            </div>
          ))}
          {/* La aceptación del aviso va con las últimas preguntas (en el diseño por pasos, en el último paso). */}
          {consentCheckbox && index === total - 1 ? (
            <label className="flex items-start gap-3 text-sm @md:col-span-2">
              <input type="checkbox" name="acceptPrivacy" required disabled={preview} className="mt-0.5 size-4 shrink-0" />
              <span className="min-w-0">
                Leí y acepto el {privacy}.<Required />
              </span>
            </label>
          ) : null}
        </div>
      ))}
      {/* Señuelo anti-bots: invisible para personas, los bots suelen completarlo. */}
      <div aria-hidden="true" data-trap="" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          No completar
          <input type="text" name={WEB_SITE_HONEYPOT_FIELD} tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      {status === 'error' && (
        <p id={`${uid}-error`} role="alert" className="ws-error">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        {steps && step > 0 && (
          <button type="button" onClick={() => setStep((current) => Math.max(0, current - 1))} className="ws-btn ws-btn-alt">
            <ArrowLeft className="size-4" aria-hidden="true" /> Atrás
          </button>
        )}
        {steps && !isLast ? (
          <button type="button" onClick={next} className="ws-btn ws-btn-main">
            Siguiente <ArrowRight className="size-4" aria-hidden="true" />
          </button>
        ) : (
          <button type="submit" disabled={preview || status === 'sending'} className="ws-btn ws-btn-main disabled:cursor-not-allowed disabled:opacity-60">
            {status === 'sending' ? 'Enviando…' : submitLabel}
          </button>
        )}
      </div>
      {preview && <p className="ws-muted -mt-2 text-sm">Vista previa: el formulario funciona solo en el sitio publicado.</p>}
      {!consentCheckbox && <p className="ws-muted -mt-2 text-xs">Usaremos tus datos solo para responderte, según el {privacy}.</p>}
    </form>
  );
}
