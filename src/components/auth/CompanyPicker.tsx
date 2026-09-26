'use client';

import { useState, useTransition } from 'react';
import { ChevronRight, Loader2 } from 'lucide-react';
import { switchActiveCompanyAction, type SwitchableCompany } from '@/lib/auth/actions/switch-company.actions';
import { AuthError } from '@/components/auth/AuthShell';
import { cn } from '@/lib/utils';

/**
 * Lista de empresas de `/seleccionar-empresa`. Elegir una llama a
 * `switchActiveCompanyAction`, que revalida el acceso, reemite la sesión y
 * redirige al panel (el redirect lanza por dentro: si la acción retorna, fue
 * un error).
 */
export function CompanyPicker({ companies }: { companies: SwitchableCompany[] }) {
  const [pending, startTransition] = useTransition();
  const [chosen, setChosen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function choose(companyId: string) {
    setChosen(companyId);
    setError(null);
    startTransition(async () => {
      const result = await switchActiveCompanyAction(companyId);
      if (!result.success) {
        setError(result.error);
        setChosen(null);
      }
    });
  }

  return (
    <div>
      {error && <AuthError>{error}</AuthError>}
      <ul className="space-y-2.5">
        {companies.map((company) => (
          <li key={company.id}>
            <button
              type="button"
              onClick={() => choose(company.id)}
              disabled={pending || !company.available}
              className={cn(
                'flex w-full items-center gap-3 rounded-xl border border-border bg-background/40 px-4 py-3 text-left transition-colors',
                'hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
                'disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-border disabled:hover:bg-background/40'
              )}
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-sm font-semibold text-primary">
                {company.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">{company.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {!company.available ? 'No disponible: cuenta suspendida' : company.isHome ? 'Empresa principal' : 'Acceso adicional'}
                </span>
              </span>
              {chosen === company.id ? (
                <Loader2 className="size-4 shrink-0 animate-spin text-primary" aria-label="Entrando" />
              ) : (
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
