'use client';

import { useState, type ReactNode } from 'react';
import { AlertTriangle, ChevronDown, Lightbulb } from 'lucide-react';
import type { WebSiteBlock } from '@/lib/web-sites/blocks';
import type { SiteDocument } from '@/lib/web-sites/site';
import { LinkField } from './LinkField';
import { TextField } from './fields';

/** Props que reciben los campos de cada tipo de sección. */
export interface FieldsProps<T extends WebSiteBlock> {
  block: T;
  disabled: boolean;
  onChange: (block: WebSiteBlock) => void;
  /** Sitio completo y página actual: los necesitan los campos de enlace para ofrecer páginas y secciones. */
  document: SiteDocument;
  pageId: string;
}

/** Recordatorio que acompaña a todo selector de fotos. */
export const PHOTO_TIP = 'Usa fotos propias: las de internet se notan y pueden tener derechos de autor.';

/** Consejo breve (fondo suave, ampolleta). */
export function Tip({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
      <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-accent-foreground" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

/** Aviso amable que no bloquea (ámbar). */
export function Notice({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning">
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

/** Bloque plegable para lo opcional; parte abierto si ya tiene contenido. */
export function Optional({ title, filled, children }: { title: string; filled: boolean; children: ReactNode }) {
  const [initiallyOpen] = useState(filled);
  return (
    <details className="group rounded-lg border border-border bg-card" open={initiallyOpen}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
        <span>
          {title}
          {filled ? <span className="ml-2 text-xs font-normal text-success">con contenido</span> : null}
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="space-y-3 border-t border-border p-3">{children}</div>
    </details>
  );
}

interface ButtonFieldsProps {
  /** "Botón principal", "Segundo botón"… */
  legend: string;
  label: string;
  href: string;
  onLabel: (value: string) => void;
  onHref: (value: string) => void;
  document: SiteDocument;
  pageId: string;
  disabled: boolean;
  labelPlaceholder: string;
  labelHint?: string;
  linkHint?: string;
  maxLabel?: number;
}

/** Texto + destino de un botón, con los avisos de "sin texto" y "sin destino". */
export function ButtonFields({ legend, label, href, onLabel, onHref, document, pageId, disabled, labelPlaceholder, labelHint, linkHint, maxLabel = 40 }: ButtonFieldsProps) {
  return (
    <fieldset className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
      <legend className="px-1 text-sm font-semibold">{legend}</legend>
      <TextField
        label="Texto del botón"
        value={label}
        onChange={onLabel}
        max={maxLabel}
        disabled={disabled}
        placeholder={labelPlaceholder}
        hint={labelHint ?? 'Empieza con un verbo: “Cotizar”, “Reservar”, “Escribir por WhatsApp”.'}
        error={href.trim() && !label.trim() ? 'Escribe el texto del botón; sin texto no se puede publicar.' : null}
        warning={label.trim() && !href.trim() ? 'Este botón todavía no lleva a ningún lado: elige abajo a dónde va.' : null}
      />
      <LinkField label="¿A dónde lleva el botón?" value={href} onChange={onHref} document={document} pageId={pageId} disabled={disabled} hint={linkHint} />
    </fieldset>
  );
}

/** Cantidad de líneas con texto (para "3 beneficios"). */
export function countLines(value: string): number {
  return value.split('\n').filter((line) => line.trim()).length;
}
