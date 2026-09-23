'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Search, UserPlus, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { createPersonAction, searchPeopleAction } from '@/modules/crm/actions/crm.actions';
import type { PersonOption } from '@/modules/crm/services/crm.service';

interface Props {
  id?: string;
  value: PersonOption | null;
  onChange: (person: PersonOption | null) => void;
  /** Empresa a la que se asocia una persona creada al vuelo (ficha con RUT o nombre libre). */
  organization?: { contactId?: string; name?: string };
  canCreate?: boolean;
}

/**
 * Buscador de personas de contacto comercial, con alta rápida: si la persona
 * no existe, se crea con el nombre escrito y queda asociada a la empresa del
 * negocio — completar su ficha (correo, cargo) se hace después en Contactos.
 */
export function PersonSearchSelect({ id, value, onChange, organization, canCreate = true }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PersonOption[]>([]);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      return;
    }
    const current = ++requestId.current;
    const timer = window.setTimeout(async () => {
      const result = await searchPeopleAction(trimmed);
      if (current !== requestId.current || !result.success) return;
      setResults(result.data);
      setOpen(true);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  async function quickCreate() {
    const fullName = query.trim();
    if (fullName.length < 2) return;
    setCreating(true);
    try {
      const result = await createPersonAction({
        fullName,
        contactId: organization?.contactId,
        organizationName: organization?.contactId ? undefined : organization?.name,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      onChange(result.data);
      setQuery('');
      setOpen(false);
    } finally {
      setCreating(false);
    }
  }

  if (value) {
    return (
      <div className="flex h-8 items-center justify-between gap-2 rounded-lg border border-input bg-muted/40 px-2.5 text-sm">
        <span className="min-w-0 truncate">
          <span className="font-medium text-foreground">{value.fullName}</span>
          {(value.jobTitle || value.organization) && (
            <span className="ml-2 text-xs text-muted-foreground">{[value.jobTitle, value.organization].filter(Boolean).join(' · ')}</span>
          )}
        </span>
        <button type="button" onClick={() => onChange(null)} className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Quitar persona">
          <X className="size-3.5" />
        </button>
      </div>
    );
  }

  const trimmed = query.trim();
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <Input
        id={id}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        placeholder="Buscar o crear persona…"
        className="pl-8"
        autoComplete="off"
      />
      {open && trimmed.length >= 2 && (
        <ul className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-popover">
          {results.map((person) => (
            <li key={person.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(person);
                  setQuery('');
                  setOpen(false);
                }}
                className="block w-full rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-muted"
              >
                <span className="font-medium text-foreground">{person.fullName}</span>
                {(person.jobTitle || person.organization) && (
                  <span className="block text-xs text-muted-foreground">{[person.jobTitle, person.organization].filter(Boolean).join(' · ')}</span>
                )}
              </button>
            </li>
          ))}
          {canCreate && (
            <li>
              <button
                type="button"
                disabled={creating}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void quickCreate()}
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-primary hover:bg-muted disabled:opacity-60"
              >
                <UserPlus className="size-3.5" aria-hidden="true" />
                {creating ? 'Creando…' : `Crear "${trimmed}" como contacto`}
              </button>
            </li>
          )}
          {!canCreate && results.length === 0 && <li className="px-2.5 py-1.5 text-sm text-muted-foreground">Sin resultados</li>}
        </ul>
      )}
    </div>
  );
}
