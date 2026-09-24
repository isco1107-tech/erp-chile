'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';

const TABS = [
  { href: '/dashboard/accounting/journal', label: 'Libro Diario' },
  { href: '/dashboard/accounting/ledger', label: 'Libro Mayor' },
  { href: '/dashboard/accounting/trial-balance', label: 'Balance de Comprobación' },
  { href: '/dashboard/accounting/reconciliation', label: 'Cuadraturas' },
  { href: '/dashboard/accounting/mappings', label: 'Cuentas del Sistema' },
] as const;

/** Navegación entre libros que conserva el período elegido (`?year&month`). */
export default function AccountingTabs() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const period = new URLSearchParams();
  const year = searchParams.get('year');
  const month = searchParams.get('month');
  if (year) period.set('year', year);
  if (month) period.set('month', month);
  const query = period.toString();

  return (
    <nav aria-label="Libros contables" className="-mb-px flex gap-1 overflow-x-auto border-b border-border print:hidden">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={query ? `${tab.href}?${query}` : tab.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
              active ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
