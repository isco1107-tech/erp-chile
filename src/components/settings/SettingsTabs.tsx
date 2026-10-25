'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

export type SettingsTabsGroup = {
  id: string;
  title: string;
  links: Array<{ href: string; title: string }>;
};

/**
 * Pestañas entre las pantallas de un mismo tema de Configuración. Solo aparece
 * dentro de un grupo con más de una pantalla visible para el rol; en el índice
 * y en pantallas fuera de los grupos no se dibuja nada.
 */
export default function SettingsTabs({ groups }: { groups: SettingsTabsGroup[] }) {
  const pathname = usePathname();
  const group = groups.find((g) => g.links.some((l) => pathname === l.href || pathname.startsWith(`${l.href}/`)));
  if (!group || group.links.length < 2) return null;

  return (
    <nav aria-label={`Configuración: ${group.title}`} className="-mx-1 overflow-x-auto px-1 print:hidden">
      <ul className="flex min-w-max items-center gap-1 border-b border-border">
        {group.links.map((link) => {
          const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  '-mb-px inline-flex items-center border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset',
                  active
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
                )}
              >
                {link.title}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
