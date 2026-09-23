'use client';

import { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { listContactsAction } from '@/modules/contacts/actions/contacts.actions';

export interface ContactOption {
  id: string;
  razonSocial: string;
  rut: string;
}

interface Props {
  id?: string;
  value: ContactOption | null;
  onChange: (contact: ContactOption | null) => void;
  placeholder?: string;
  /** Filtra la lista a clientes o proveedores. Sin esto, muestra ambos. */
  kind?: 'customer' | 'supplier';
}

/**
 * Buscador de clientes/proveedores contra el servidor (por RUT o nombre),
 * con espera de 250 ms entre teclas para no disparar una consulta por letra.
 */
export function ContactSearchSelect({ id, value, onChange, placeholder = 'Buscar por nombre o RUT…', kind }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ContactOption[]>([]);
  const [open, setOpen] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      return;
    }
    const current = ++requestId.current;
    const timer = window.setTimeout(async () => {
      const result = await listContactsAction(trimmed);
      if (current !== requestId.current || !result.success) return;
      const filtered = result.data.filter((c) => (kind === 'customer' ? c.isCustomer : kind === 'supplier' ? c.isSupplier : true));
      setResults(filtered.slice(0, 8).map((c) => ({ id: c.id, razonSocial: c.razonSocial, rut: c.rut })));
      setOpen(true);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query, kind]);

  if (value) {
    return (
      <div className="flex h-8 items-center justify-between gap-2 rounded-lg border border-input bg-muted/40 px-2.5 text-sm">
        <span className="min-w-0 truncate">
          <span className="font-medium text-foreground">{value.razonSocial}</span>
          <span className="ml-2 text-xs text-muted-foreground">{value.rut}</span>
        </span>
        <button type="button" onClick={() => onChange(null)} className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Quitar contacto">
          <X className="size-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <Input
        id={id}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        className="pl-8"
        autoComplete="off"
      />
      {open && results.length > 0 && (
        <ul className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-border bg-popover py-1 shadow-popover" role="listbox">
          {results.map((contact) => (
            <li key={contact.id}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-sm hover:bg-muted"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(contact);
                  setQuery('');
                  setOpen(false);
                }}
              >
                <span className="truncate">{contact.razonSocial}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{contact.rut}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
