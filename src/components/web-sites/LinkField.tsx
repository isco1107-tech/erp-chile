'use client';

import { useEffect, useId, useState } from 'react';
import { ExternalLink, FileText, Globe, Hash, Link2Off, Mail, MessageCircle, Phone } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { nativeSelectClass } from '@/components/ui/field-classes';
import { findPage, homeOf, isValidSiteLink, pageAnchors, pageLink, parsePageLink, type SiteDocument } from '@/lib/web-sites/site';
import { safeHref, whatsappHref } from '@/lib/web-sites/urls';
import { cn } from '@/lib/utils';

/**
 * Campo de enlace para botones, menús y tarjetas. En vez de pedir "escribe una
 * URL", pregunta "¿a dónde lleva?" y ofrece lo que la gente quiere de verdad:
 * otra página del sitio (y, si quiere, una sección de ella), una sección de
 * esta página, WhatsApp con mensaje listo, correo, teléfono o un sitio
 * externo. Guarda siempre un texto que entiende `resolveLink`
 * (`page:<id>#ancla`, `#ancla`, `https://wa.me/…`, `mailto:`, `tel:`, `https://`).
 */

export type LinkKind = 'none' | 'page' | 'section' | 'whatsapp' | 'email' | 'phone' | 'url';

const KINDS: { id: LinkKind; label: string; Icon: typeof Globe }[] = [
  { id: 'page', label: 'Una página de mi sitio', Icon: FileText },
  { id: 'section', label: 'Una sección de esta página', Icon: Hash },
  { id: 'whatsapp', label: 'WhatsApp', Icon: MessageCircle },
  { id: 'email', label: 'Correo', Icon: Mail },
  { id: 'phone', label: 'Llamada telefónica', Icon: Phone },
  { id: 'url', label: 'Otro sitio web', Icon: Globe },
  { id: 'none', label: 'Sin enlace', Icon: Link2Off },
];

/** Qué tipo de enlace es un valor guardado. */
export function linkKindOf(value: string, pageId: string): LinkKind {
  const raw = value.trim();
  if (!raw) return 'none';
  const internal = parsePageLink(raw);
  if (internal) return internal.pageId === pageId && internal.anchor ? 'section' : 'page';
  if (raw.startsWith('#')) return 'section';
  if (/^https:\/\/wa\.me\//i.test(raw)) return 'whatsapp';
  if (/^mailto:/i.test(raw) || (/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(raw) && !raw.includes('/'))) return 'email';
  if (/^tel:/i.test(raw) || /^\+?[\d\s()-]{7,20}$/.test(raw)) return 'phone';
  return 'url';
}

function parseWhatsapp(value: string): { number: string; message: string } {
  try {
    const url = new URL(value);
    return { number: url.pathname.replace(/\D/g, ''), message: url.searchParams.get('text') ?? '' };
  } catch {
    return { number: '', message: '' };
  }
}

export interface LinkFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Sitio completo: para listar páginas y secciones. */
  document: SiteDocument;
  /** Página donde está el enlace (para "una sección de esta página"). */
  pageId: string;
  disabled?: boolean;
  hint?: string;
  /** Muestra "Abrir en una pestaña nueva". */
  newTab?: { checked: boolean; onChange: (checked: boolean) => void };
}

export function LinkField({ label, value, onChange, document, pageId, disabled, hint, newTab }: LinkFieldProps) {
  const id = useId();
  const [kind, setKind] = useState<LinkKind>(() => linkKindOf(value, pageId));

  // Si el valor cambia desde afuera (deshacer, otra sección), el tipo lo sigue; un campo vacío conserva el tipo elegido.
  useEffect(() => {
    if (value.trim()) setKind(linkKindOf(value, pageId));
  }, [value, pageId]);

  const internal = parsePageLink(value);
  const home = homeOf(document);
  const targetPage = kind === 'page' ? (internal ? findPage(document, internal.pageId) : null) : null;
  const currentPage = findPage(document, pageId) ?? home;
  const anchorsOfTarget = targetPage ? pageAnchors(targetPage) : [];
  const anchorsHere = pageAnchors(currentPage);
  const sectionAnchor = kind === 'section' ? (internal?.anchor ?? (value.startsWith('#') ? value.slice(1) : '')) : '';
  const whatsapp = kind === 'whatsapp' ? parseWhatsapp(value) : { number: '', message: '' };

  const problem = (() => {
    const raw = value.trim();
    if (!raw) return null;
    if (internal) {
      const page = findPage(document, internal.pageId);
      if (!page) return 'Esa página ya no existe: elige otra.';
      if (page.hidden && page.id !== home.id) return `La página «${page.title}» está oculta: el enlace no aparecerá hasta que la muestres.`;
      return null;
    }
    if (kind === 'whatsapp' && !whatsappHref(whatsapp.number)) return 'Escribe el número completo, por ejemplo +56 9 1234 5678.';
    return isValidSiteLink(raw, document) ? null : kind === 'email' ? 'Este correo no parece válido.' : kind === 'phone' ? 'Este teléfono no parece válido.' : 'Este enlace no parece válido. Revisa que empiece con https://';
  })();

  function changeKind(next: LinkKind) {
    setKind(next);
    if (next === 'none') onChange('');
    else if (next === 'page') onChange(pageLink(document.pages.find((page) => page.id !== pageId)?.id ?? home.id));
    else if (next === 'section') onChange(anchorsHere[0] ? `#${anchorsHere[0].anchor}` : '');
    else onChange('');
  }

  const selectId = `${id}-kind`;
  const describedBy = [hint ? `${id}-hint` : null, problem ? `${id}-problem` : null].filter(Boolean).join(' ') || undefined;

  return (
    <div role="group" aria-labelledby={`${id}-label`} className="space-y-2 rounded-lg border border-border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p id={`${id}-label`} className="text-sm font-medium text-foreground">
          {label}
        </p>
        {value.trim() && !problem && kind !== 'none' ? <span className="text-xs font-medium text-success">Enlace listo</span> : null}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={selectId} className="text-xs text-muted-foreground">
          ¿A dónde lleva?
        </Label>
        <select id={selectId} className={nativeSelectClass} value={kind} disabled={disabled} onChange={(event) => changeKind(event.target.value as LinkKind)}>
          {KINDS.map((option) => (
            <option key={option.id} value={option.id} disabled={option.id === 'section' && anchorsHere.length === 0 && kind !== 'section'}>
              {option.label}
              {option.id === 'section' && anchorsHere.length === 0 ? ' (esta página aún no tiene secciones con título)' : ''}
            </option>
          ))}
        </select>
      </div>

      {kind === 'page' ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-page`} className="text-xs text-muted-foreground">
              Página
            </Label>
            <select id={`${id}-page`} className={nativeSelectClass} disabled={disabled} value={internal?.pageId ?? ''} onChange={(event) => onChange(pageLink(event.target.value))} aria-describedby={describedBy}>
              {!internal ? <option value="">Elige una página…</option> : null}
              {document.pages.map((page, index) => (
                <option key={page.id} value={page.id}>
                  {page.title}
                  {index === 0 ? ' (inicio)' : ''}
                  {page.hidden && index > 0 ? ' (oculta)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-anchor`} className="text-xs text-muted-foreground">
              Ir directo a una sección (opcional)
            </Label>
            <select
              id={`${id}-anchor`}
              className={nativeSelectClass}
              disabled={disabled || !internal || anchorsOfTarget.length === 0}
              value={internal?.anchor ?? ''}
              onChange={(event) => internal && onChange(pageLink(internal.pageId, event.target.value || null))}
            >
              <option value="">Al comienzo de la página</option>
              {anchorsOfTarget.map((entry) => (
                <option key={entry.anchor} value={entry.anchor}>
                  {entry.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : null}

      {kind === 'section' ? (
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-section`} className="text-xs text-muted-foreground">
            Sección
          </Label>
          <select id={`${id}-section`} className={nativeSelectClass} disabled={disabled} value={sectionAnchor} onChange={(event) => onChange(event.target.value ? `#${event.target.value}` : '')} aria-describedby={describedBy}>
            {!sectionAnchor ? <option value="">Elige una sección…</option> : null}
            {sectionAnchor && !anchorsHere.some((entry) => entry.anchor === sectionAnchor) ? <option value={sectionAnchor}>#{sectionAnchor} (ya no existe)</option> : null}
            {anchorsHere.map((entry) => (
              <option key={entry.anchor} value={entry.anchor}>
                {entry.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">Al hacer clic, la página baja hasta esa sección. Solo aparecen las secciones con título.</p>
        </div>
      ) : null}

      {kind === 'whatsapp' ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-wa`} className="text-xs text-muted-foreground">
              Número de WhatsApp
            </Label>
            <Input
              id={`${id}-wa`}
              type="tel"
              inputMode="tel"
              placeholder="+56 9 1234 5678"
              disabled={disabled}
              defaultValue={whatsapp.number ? `+${whatsapp.number}` : ''}
              aria-describedby={describedBy}
              onChange={(event) => onChange(whatsappHref(event.target.value, whatsapp.message || undefined) ?? (event.target.value.trim() ? `https://wa.me/${event.target.value.replace(/\D/g, '')}` : ''))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-wa-msg`} className="text-xs text-muted-foreground">
              Mensaje inicial (opcional)
            </Label>
            <Input
              id={`${id}-wa-msg`}
              placeholder="Hola, quiero cotizar…"
              maxLength={200}
              disabled={disabled || !whatsapp.number}
              defaultValue={whatsapp.message}
              onChange={(event) => onChange(whatsappHref(whatsapp.number, event.target.value.trim() || undefined) ?? value)}
            />
          </div>
        </div>
      ) : null}

      {kind === 'email' ? (
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-email`} className="text-xs text-muted-foreground">
            Correo
          </Label>
          <Input
            id={`${id}-email`}
            type="email"
            placeholder="hola@tunegocio.cl"
            disabled={disabled}
            value={value.replace(/^mailto:/i, '')}
            aria-describedby={describedBy}
            onChange={(event) => onChange(event.target.value.trim() ? `mailto:${event.target.value.trim()}` : '')}
          />
        </div>
      ) : null}

      {kind === 'phone' ? (
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-tel`} className="text-xs text-muted-foreground">
            Teléfono
          </Label>
          <Input
            id={`${id}-tel`}
            type="tel"
            inputMode="tel"
            placeholder="+56 2 2345 6789"
            disabled={disabled}
            value={value.replace(/^tel:/i, '')}
            aria-describedby={describedBy}
            onChange={(event) => onChange(event.target.value.trim() ? `tel:${event.target.value.trim()}` : '')}
          />
        </div>
      ) : null}

      {kind === 'url' ? (
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-url`} className="text-xs text-muted-foreground">
            Dirección del sitio
          </Label>
          <Input
            id={`${id}-url`}
            type="url"
            inputMode="url"
            placeholder="https://…"
            disabled={disabled}
            value={value}
            aria-describedby={describedBy}
            onChange={(event) => onChange(event.target.value)}
            onBlur={() => {
              const safe = safeHref(value);
              if (safe && safe !== value && /^https?:/i.test(safe)) onChange(safe);
            }}
          />
        </div>
      ) : null}

      {newTab && kind !== 'none' ? (
        <label className={cn('flex items-center gap-2 text-sm', disabled && 'opacity-60')}>
          <input type="checkbox" className="size-4 accent-[var(--color-primary)]" checked={newTab.checked} disabled={disabled} onChange={(event) => newTab.onChange(event.target.checked)} />
          <ExternalLink className="size-3.5 text-muted-foreground" aria-hidden="true" /> Abrir en una pestaña nueva
        </label>
      ) : null}

      {hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {problem ? (
        <p id={`${id}-problem`} className="text-xs font-medium text-danger">
          {problem}
        </p>
      ) : null}
    </div>
  );
}
