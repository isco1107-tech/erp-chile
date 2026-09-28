'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { ChevronsUpDown } from 'lucide-react';
import { toast } from 'sonner';
import {
  listSwitchableCompaniesAction,
  switchActiveCompanyAction,
  type SwitchableCompany,
} from '@/lib/auth/actions/switch-company.actions';

/**
 * Reemplaza el bloque estático que antes mostraba "empresa + plan" a secas
 * (comentario original: "no hay switching entre múltiples empresas
 * implementado"). Si el usuario solo tiene una empresa (el caso normal, sin
 * `hasMultiCompany`), se ve exactamente igual — sin dropdown, sin flecha —
 * para no sumar ruido visual a nadie que no use el módulo.
 */
export function CompanySwitcher({
  companyName,
  planName,
  isTrial,
}: {
  companyName: string;
  planName: string;
  isTrial: boolean;
}) {
  const [companies, setCompanies] = useState<SwitchableCompany[] | null>(null);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [pending, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);

  // Se cierra con Escape o al hacer clic fuera, como cualquier menú.
  useEffect(() => {
    if (!open) {
      setFilter('');
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onPointer = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  useEffect(() => {
    listSwitchableCompaniesAction().then((r) => {
      if (r.success) setCompanies(r.data);
    });
  }, []);

  const canSwitch = companies !== null && companies.filter((c) => c.available).length > 1;

  // Con muchas empresas (un estudio contable con sus clientes) se busca por nombre.
  const searchable = (companies?.length ?? 0) > 5;
  const needle = filter.trim().toLocaleLowerCase('es-CL');
  const visible = (companies ?? []).filter((c) => !needle || c.name.toLocaleLowerCase('es-CL').includes(needle));

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        disabled={!canSwitch || pending}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-[10px] bg-white/[0.04] px-3 py-2 text-left disabled:cursor-default"
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-sidebar-primary/15 text-xs font-semibold text-sidebar-primary">
          {companyName.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-white">{companyName}</p>
          <p className="truncate text-[11px] text-sidebar-foreground">
            Plan {planName}
            {isTrial ? ' · Prueba' : ''}
          </p>
        </div>
        {canSwitch && <ChevronsUpDown className="size-3.5 shrink-0 text-sidebar-foreground" />}
      </button>

      {open && canSwitch && (
        <div className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-[10px] border border-white/10 bg-sidebar-accent shadow-lg">
          {searchable && (
            <input
              autoFocus
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Buscar empresa…"
              aria-label="Buscar empresa"
              className="w-full border-b border-white/10 bg-transparent px-3 py-2 text-xs text-white outline-none placeholder:text-sidebar-foreground"
            />
          )}
          <div className="max-h-72 overflow-y-auto">
          {visible.length === 0 && <p className="px-3 py-2 text-xs text-sidebar-foreground">Sin coincidencias</p>}
          {visible.map((c) => (
            <button
              key={c.id}
              type="button"
              disabled={c.isActive || !c.available || pending}
              onClick={() => {
                setOpen(false);
                startTransition(async () => {
                  // `switchActiveCompanyAction` redirige por dentro en el
                  // camino feliz (lanza internamente, nunca retorna acá) — si
                  // sí retorna, fue porque falló antes de llegar al redirect.
                  const result = await switchActiveCompanyAction(c.id);
                  if (!result.success) toast.error(result.error);
                });
              }}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-xs text-white hover:bg-white/[0.06] disabled:cursor-default disabled:opacity-60"
            >
              <span className="min-w-0">
                <span className="block truncate">{c.name}</span>
                {c.roleLabel && <span className="block truncate text-[10px] text-sidebar-foreground">{c.roleLabel}</span>}
              </span>
              {c.isActive && <span className="shrink-0 text-[10px] text-sidebar-primary">Actual</span>}
              {!c.available && <span className="shrink-0 text-[10px] text-sidebar-foreground">Suspendida</span>}
            </button>
          ))}
          </div>
        </div>
      )}
    </div>
  );
}
