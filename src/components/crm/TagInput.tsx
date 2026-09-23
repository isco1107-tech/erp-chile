'use client';

import { useId, useState } from 'react';
import { X } from 'lucide-react';
import { normalizeTags } from '@/lib/crm/analytics';
import { cn } from '@/lib/utils';

interface Props {
  id?: string;
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
  className?: string;
}

/**
 * Etiquetas libres ("Miss Universe", "Canje", "Renovación"): Enter o coma
 * agrega, la X quita. Las etiquetas ya usadas en la empresa se sugieren para
 * no terminar con "VIP", "vip" y "V.I.P." como tres grupos distintos.
 */
export function TagInput({ id, value, onChange, suggestions = [], placeholder = 'Agregar etiqueta…', className }: Props) {
  const [draft, setDraft] = useState('');
  const listId = useId();

  function commit(raw: string) {
    const next = normalizeTags([...value, ...raw.split(',')]);
    onChange(next);
    setDraft('');
  }

  return (
    <div className={cn('flex min-h-8 flex-wrap items-center gap-1.5 rounded-lg border border-input px-2 py-1', className)}>
      {value.map((tag) => (
        <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-foreground">
          {tag}
          <button type="button" onClick={() => onChange(value.filter((t) => t !== tag))} className="rounded-full text-muted-foreground hover:text-foreground" aria-label={`Quitar etiqueta ${tag}`}>
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        id={id}
        list={listId}
        value={draft}
        onChange={(e) => {
          const next = e.target.value;
          if (next.endsWith(',')) commit(next);
          else setDraft(next);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (draft.trim()) commit(draft);
          } else if (e.key === 'Backspace' && !draft && value.length > 0) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => draft.trim() && commit(draft)}
        placeholder={value.length === 0 ? placeholder : ''}
        className="min-w-[8rem] flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
      <datalist id={listId}>
        {suggestions
          .filter((s) => !value.some((v) => v.toLocaleLowerCase('es-CL') === s.toLocaleLowerCase('es-CL')))
          .map((s) => (
            <option key={s} value={s} />
          ))}
      </datalist>
    </div>
  );
}
