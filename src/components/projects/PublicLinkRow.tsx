'use client';

import { useState } from 'react';
import { Check, Copy, ExternalLink } from 'lucide-react';

/** Enlace público con copiar y abrir; arma la URL absoluta con el dominio actual. */
export function PublicLinkRow({ label, path, hint }: { label: string; path: string; hint?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${path}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-2 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="truncate font-mono text-xs text-muted-foreground">{path}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <button type="button" onClick={() => void copy()} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted" aria-label={`Copiar enlace: ${label}`}>
        {copied ? <Check className="size-3.5 text-success" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
        {copied ? 'Copiado' : 'Copiar'}
      </button>
      <a href={path} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted">
        <ExternalLink className="size-3.5" aria-hidden="true" />
        Abrir
      </a>
    </li>
  );
}
