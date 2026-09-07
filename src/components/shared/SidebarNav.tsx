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

  const [manualState, setManualState] = useState<Record<string, boolean>>({});

  return (
    <nav className="hud-scroll -mr-2 flex-1 space-y-5 overflow-y-auto pr-2">
      {groups.map((group) => {
        const groupHasActiveLink = group.links.some(isLinkActive);
        const expanded = manualState[group.label] ?? (!group.collapsedByDefault || groupHasActiveLink);

        return (
          <div key={group.label}>
            {group.collapsedByDefault ? (
              <button
                type="button"
                onClick={() => setManualState((prev) => ({ ...prev, [group.label]: !expanded }))}
                className="flex w-full items-center justify-between px-3 pb-1 text-[11px] font-medium tracking-[0.06em] text-sidebar-foreground/60 uppercase"
              >
                {group.label}
                <ChevronDown className={cn('size-3.5 transition-transform', expanded ? 'rotate-180' : '')} />
              </button>
            ) : (
              <p className="px-3 pb-1 text-[11px] font-medium tracking-[0.06em] text-sidebar-foreground/60 uppercase">
                {group.label}
              </p>
            )}
            {expanded && (
              <div className="space-y-0.5">
                {group.links.map((link) => {
                  const Icon = ICONS[link.icon];
                  const active = isLinkActive(link);

                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      className={cn(
                        'flex h-10 items-center gap-3 rounded-[10px] border-l-[3px] pr-3 pl-[9px] text-sm transition-colors duration-150',
                        active
                          ? 'border-l-sidebar-primary bg-sidebar-accent text-white'
                          : 'border-l-transparent text-sidebar-foreground hover:bg-white/[0.04] hover:text-white'
                      )}
                    >
                      <Icon
                        className={cn('size-[18px] shrink-0', active ? 'text-sidebar-primary' : 'text-sidebar-foreground')}
                        strokeWidth={1.75}
                      />
                      <span className="truncate">{link.label}</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
