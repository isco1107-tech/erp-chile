'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, Orbit } from 'lucide-react';
import type { SidebarNavGroup } from './SidebarNav';

export function WorkspaceBreadcrumb({ groups }: { groups: SidebarNavGroup[] }) {
  const pathname = usePathname();
  const current = groups.flatMap((group) => group.links)
    .filter((link) => pathname === link.href || (!link.exact && pathname.startsWith(`${link.href}/`)))
    .sort((a, b) => b.href.length - a.href.length)[0];

  return (
    <nav aria-label="Ubicación actual" className="hidden min-w-0 items-center gap-2 text-xs lg:flex">
      <Link href="/dashboard" aria-label="Ir al centro de operaciones" className="flex items-center gap-2 font-semibold tracking-wide text-foreground">
        <Orbit className="size-4 text-primary" aria-hidden /> Aether
      </Link>
      <ChevronRight className="size-3 shrink-0 text-muted-foreground" aria-hidden />
      <span aria-current="page" className="max-w-44 truncate text-muted-foreground">{current?.label ?? 'Espacio de trabajo'}</span>
    </nav>
  );
}
