'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  Home,
  ScanBarcode,
  CreditCard,
  ShoppingCart,
  Package,
  Box,
  Users,
  Wallet,
  TrendingDown,
  Landmark,
  FileSpreadsheet,
  Settings,
  ShieldCheck,
  Bot,
  CalendarRange,
  Handshake,
  Receipt,
  Crown,
  Network,
  Clapperboard,
  ListVideo,
  Shirt,
  Gavel,
  Scale,
  BookOpenText,
  BookMarked,
  Sheet,
  ListChecks,
  Calendar,
  PiggyBank,
  ScrollText,
  CalendarClock,
  Ticket,
  Vote,
  HelpCircle,
  MessageSquare,
  ChevronDown,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { NavGroup, NavIconKey, NavLink } from '@/lib/navigation/workspace-nav';

/**
 * Los íconos se resuelven por clave dentro de este componente cliente: una
 * función (el componente `LucideIcon`) no puede cruzar el límite Server ->
 * Client Component como prop, así que el layout solo manda claves de string.
 * Compartido con la paleta de comandos para que ambos muestren el mismo ícono.
 */
export const NAV_ICONS: Record<NavIconKey, LucideIcon> = {
  home: Home,
  pos: ScanBarcode,
  sales: CreditCard,
  purchases: ShoppingCart,
  products: Package,
  inventory: Box,
  contacts: Users,
  cxc: Wallet,
  cxp: TrendingDown,
  cashflow: Landmark,
  reports: FileSpreadsheet,
  settings: Settings,
  platform: ShieldCheck,
  agents: Bot,
  projects: CalendarRange,
  calendar: Calendar,
  sponsorships: Handshake,
  fees: Receipt,
  candidates: Crown,
  orgchart: Network,
  production: Clapperboard,
  timeline: ListVideo,
  wardrobe: Shirt,
  judging: Gavel,
  accounting: Scale,
  journal: BookOpenText,
  ledger: BookMarked,
  trialBalance: Sheet,
  reconciliation: ListChecks,
  budgets: PiggyBank,
  promissoryNotes: ScrollText,
  paymentPlans: CalendarClock,
  ticketing: Ticket,
  voting: Vote,
  help: HelpCircle,
  messaging: MessageSquare,
};


/**
 * El enlace activo es el de coincidencia MÁS específica: en
 * `/dashboard/purchases/orders` tanto "Compras" como "Órdenes de Compra"
 * coinciden por prefijo, pero solo el segundo debe marcarse.
 */
function findActiveHref(groups: NavGroup[], pathname: string): string | null {
  let best: string | null = null;
  for (const group of groups) {
    for (const link of group.links) {
      const matches = link.exact ? pathname === link.href : pathname === link.href || pathname.startsWith(`${link.href}/`);
      if (matches && (!best || link.href.length > best.length)) best = link.href;
    }
  }
  return best;
}

export function SidebarNav({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname();
  const activeHref = findActiveHref(groups, pathname);
  const isLinkActive = (link: NavLink) => link.href === activeHref;

  const [manualState, setManualState] = useState<Record<string, boolean>>({});

  return (
    <nav aria-label="Módulos" className="hud-scroll -mr-2 flex-1 space-y-5 overflow-y-auto pr-2">
      {groups.map((group) => {
        const groupHasActiveLink = group.links.some(isLinkActive);
        const expanded = manualState[group.label] ?? (!group.collapsedByDefault || groupHasActiveLink);
        const listId = `nav-group-${group.label.replace(/\W+/g, '-').toLowerCase()}`;

        return (
          <div key={group.label}>
            {group.collapsedByDefault ? (
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={listId}
                onClick={() => setManualState((prev) => ({ ...prev, [group.label]: !expanded }))}
                className="flex w-full items-center justify-between rounded-md px-3 pb-1 text-[11px] font-medium tracking-[0.06em] text-sidebar-foreground/60 uppercase transition-colors hover:text-sidebar-foreground focus-visible:outline-2 focus-visible:outline-sidebar-ring"
              >
                {group.label}
                <ChevronDown className={cn('size-3.5 transition-transform', expanded ? 'rotate-180' : '')} aria-hidden="true" />
              </button>
            ) : (
              <p className="px-3 pb-1 text-[11px] font-medium tracking-[0.06em] text-sidebar-foreground/60 uppercase">
                {group.label}
              </p>
            )}
            {expanded && (
              <ul id={listId} className="space-y-0.5">
                {group.links.map((link) => {
                  const Icon = NAV_ICONS[link.icon];
                  const active = isLinkActive(link);

                  return (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'flex h-9 items-center gap-3 rounded-[10px] border-l-[3px] pr-3 pl-[9px] text-[13.5px] transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-sidebar-ring',
                          active
                            ? 'border-l-sidebar-primary bg-sidebar-accent font-medium text-white'
                            : 'border-l-transparent text-sidebar-foreground hover:bg-white/[0.04] hover:text-white'
                        )}
                      >
                        <Icon
                          className={cn('size-[17px] shrink-0', active ? 'text-sidebar-primary' : 'text-sidebar-foreground')}
                          strokeWidth={1.75}
                          aria-hidden="true"
                        />
                        <span className="truncate">{link.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </nav>
  );
}
