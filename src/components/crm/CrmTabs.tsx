'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, CalendarCheck, Contact, KanbanSquare, List } from 'lucide-react';
import { cn } from '@/lib/utils';

const TABS = [
  { href: '/dashboard/crm', label: 'Embudo', icon: KanbanSquare, exact: true },
  { href: '/dashboard/crm/list', label: 'Lista', icon: List },
  { href: '/dashboard/crm/tasks', label: 'Agenda', icon: CalendarCheck },
  { href: '/dashboard/crm/people', label: 'Contactos', icon: Contact },
  { href: '/dashboard/crm/reports', label: 'Reportes', icon: BarChart3 },
] as const;

/** Navegación interna del CRM: las cinco vistas del mismo embudo. */
export function CrmTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Vistas del CRM" className="-mx-1 overflow-x-auto">
      <ul className="flex min-w-max gap-1 border-b border-border px-1">
        {TABS.map((tab) => {
          const active = 'exact' in tab && tab.exact ? pathname === tab.href : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          const Icon = tab.icon;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  '-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors',
                  active ? 'border-primary font-medium text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
