'use client';

import { useEffect, useState, useTransition } from 'react';
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
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    listSwitchableCompaniesAction().then((r) => {
      if (r.success) setCompanies(r.data);
    });
  }, []);

  const canSwitch = companies !== null && companies.length > 1;

  return (
    <div className="relative">
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
          {companies!.map((c) => (
            <button
              key={c.id}
              type="button"
              disabled={c.isActive || pending}
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
              <span className="truncate">{c.name}</span>
              {c.isActive && <span className="text-[10px] text-sidebar-primary">Actual</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
