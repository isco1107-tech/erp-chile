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
  Gavel,
  Scale,
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

/**
 * Los íconos se resuelven por clave dentro de este componente cliente, en vez
 * de recibir el componente `LucideIcon` como prop: una función no puede
 * cruzar el límite Server -> Client Component como prop serializable (RSC
 * rechaza pasar referencias de función/componente), así que el layout
 * (Server Component) solo manda claves de string.
 */
const ICONS = {
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
  judging: Gavel,
  accounting: Scale,
  budgets: PiggyBank,
  promissoryNotes: ScrollText,
  paymentPlans: CalendarClock,
  ticketing: Ticket,
  voting: Vote,
  help: HelpCircle,
  messaging: MessageSquare,
} satisfies Record<string, LucideIcon>;

export type SidebarIconKey = keyof typeof ICONS;

export interface SidebarLinkItem {
  href: string;
  label: string;
  icon: SidebarIconKey;
  /** Solo `/dashboard` necesita match exacto; el resto se activa también en subrutas. */
  exact?: boolean;
}

export interface SidebarNavGroup {
  label: string;
  links: SidebarLinkItem[];
  /** Colapsado por defecto (ej. plantillas/cumplimiento — configuración ocasional, no uso diario). Se auto-expande igual si la ruta activa cae adentro. */
  collapsedByDefault?: boolean;
}

/**
 * Lista de navegación del sidebar, con estado activo real basado en la ruta
 * actual (`usePathname`). El layout que la envuelve sigue siendo un Server
 * Component: solo esta lista necesita ser cliente para saber en qué ruta
 * está el usuario.
 *
 * Grupos marcados `collapsedByDefault` arrancan colapsados — con módulos de
 * certámenes activos, "Producción de Eventos" solo puede superar 10 ítems
 * con el mismo peso visual que el resto; separar lo ocasional
 * (plantillas/cumplimiento) del uso diario y colapsarlo por defecto reduce
 * esa pared de texto para un usuario nuevo sin esconder nada de forma
 * permanente (un clic lo despliega, y si la ruta activa cae adentro se
 * autoexpande solo).
 */
export function SidebarNav({ groups }: { groups: SidebarNavGroup[] }) {
  const pathname = usePathname();
  const isLinkActive = (link: SidebarLinkItem) =>
    link.exact ? pathname === link.href : pathname === link.href || pathname.startsWith(`${link.href}/`);
  const activeHref = groups.flatMap((group) => group.links).filter(isLinkActive)
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  const [manualState, setManualState] = useState<Record<string, boolean>>({});

  return (
    <nav aria-label="Navegación principal" className="hud-scroll min-h-0 flex-1 space-y-4 overflow-y-auto px-3 pb-5">
      {groups.map((group, groupIndex) => {
        const groupHasActiveLink = group.links.some(isLinkActive);
        const stateKey = `${pathname}:${group.label}`;
        const expanded = manualState[stateKey] ?? (!group.collapsedByDefault || groupHasActiveLink);

        return (
          <div key={group.label}>
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={`nav-group-${groupIndex}`}
                onClick={() => setManualState((prev) => ({ ...prev, [stateKey]: !expanded }))}
                className="flex min-h-8 w-full items-center justify-between gap-2 px-3 pb-1 text-left text-[10px] font-semibold tracking-[0.13em] text-sidebar-foreground uppercase transition-colors hover:text-white"
              >
                {group.label}
                <ChevronDown className={cn('size-3.5 transition-transform', expanded ? 'rotate-180' : '')} />
              </button>
              <div id={`nav-group-${groupIndex}`} hidden={!expanded} className="space-y-1">
                {group.links.map((link) => {
                  const Icon = ICONS[link.icon];
                  const active = link.href === activeHref;

                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      aria-current={active ? 'page' : undefined}
                      title={link.label}
                      className={cn(
                        'flex min-h-10 items-center gap-3 rounded-xl px-3 py-2 text-[13px] transition-colors duration-150',
                        active
                          ? 'bg-sidebar-primary font-semibold text-sidebar-primary-foreground shadow-sm'
                          : 'text-sidebar-foreground hover:bg-white/[0.06] hover:text-white'
                      )}
                    >
                      <Icon
                        className="size-[18px] shrink-0"
                        aria-hidden
                        strokeWidth={1.75}
                      />
                      <span className="min-w-0">{link.label}</span>
                    </Link>
                  );
                })}
              </div>
          </div>
        );
      })}
    </nav>
  );
}
