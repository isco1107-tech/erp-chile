'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  FileSignature,
  ClipboardList,
  Tags,
  BadgePercent,
  ClipboardCheck,
  Hourglass,
  Barcode,
  HandCoins,
  Vault,
  FileCheck2,
  Send,
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
  MailOpen,
  ClipboardPen,
  Ship,
  Wrench,
  BookOpen,
  Factory,
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
  Radar,
  ChartSpline,
  Workflow,
  Target,
  IdCard,
  Banknote,
  TreePalm,
  Building2,
  ReceiptText,
  CalendarCheck,
  Contact,
  BarChart3,
  Globe,
  Layers,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { findNavLinkForPath, type NavGroup, type NavIconKey, type NavLink } from '@/lib/navigation/workspace-nav';

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
  intelligence: Radar,
  forecast: ChartSpline,
  flows: Workflow,
  crm: Target,
  employees: IdCard,
  payroll: Banknote,
  leave: TreePalm,
  fixedAssets: Building2,
  expenses: ReceiptText,
  contracts: FileSignature,
  salesOrders: ClipboardList,
  priceLists: Tags,
  commissions: BadgePercent,
  inventoryCount: ClipboardCheck,
  lots: Hourglass,
  labels: Barcode,
  collections: HandCoins,
  banks: Vault,
  cheques: FileCheck2,
  paymentBatches: Send,
  receivedDte: MailOpen,
  rcv: FileSpreadsheet,
  purchaseRequests: ClipboardPen,
  imports: Ship,
  manufacturing: Factory,
  boms: BookOpen,
  serviceDesk: Wrench,
  crmTasks: CalendarCheck,
  crmPeople: Contact,
  crmReports: BarChart3,
  pageantSite: Globe,
  packages: Layers,
  casting: Sparkles,
};


/**
 * El enlace activo es el de coincidencia MÁS específica: en
 * `/dashboard/purchases/orders` tanto "Compras" como "Órdenes de Compra"
 * coinciden por prefijo, pero solo el segundo debe marcarse.
 */
function findActiveHref(groups: NavGroup[], pathname: string): string | null {
  return findNavLinkForPath(groups.flatMap((group) => group.links), pathname)?.href ?? null;
}

const NAV_GROUPS_STORAGE_KEY = 'aether.sidebar.groups';

export function SidebarNav({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname();
  const activeHref = findActiveHref(groups, pathname);
  const isLinkActive = (link: NavLink) => link.href === activeHref;

  // Grupos abiertos/cerrados a mano por el usuario, recordados en este navegador.
  const [manualState, setManualState] = useState<Record<string, boolean>>({});
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(NAV_GROUPS_STORAGE_KEY);
      if (saved) setManualState(JSON.parse(saved) as Record<string, boolean>);
    } catch {
      // Sin almacenamiento (modo privado): los grupos parten en su estado por defecto.
    }
  }, []);
  const toggleGroup = (label: string, expanded: boolean) =>
    setManualState((prev) => {
      const next = { ...prev, [label]: !expanded };
      try {
        window.localStorage.setItem(NAV_GROUPS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignorado: solo se pierde recordar el estado entre visitas.
      }
      return next;
    });

  return (
    <nav aria-label="Módulos" className="hud-scroll -mr-2 flex-1 space-y-2 overflow-y-auto pr-2">
      {groups.map((group, index) => {
        const groupHasActiveLink = group.links.some(isLinkActive);
        // Por defecto solo quedan abiertos "Principal" y el grupo de la pantalla actual;
        // el grupo activo nunca se esconde, aunque el usuario lo haya cerrado antes.
        const expanded = groupHasActiveLink || (manualState[group.label] ?? (index === 0 && !group.collapsedByDefault));
        const listId = `nav-group-${group.label.replace(/\W+/g, '-').toLowerCase()}`;

        return (
          <div key={group.label}>
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={listId}
              onClick={() => toggleGroup(group.label, expanded)}
              className="group flex w-full items-center justify-between rounded-md px-3 py-1 text-[11px] font-medium tracking-[0.06em] text-sidebar-foreground/60 uppercase transition-colors hover:text-sidebar-foreground focus-visible:outline-2 focus-visible:outline-sidebar-ring"
            >
              <span className="truncate">{group.label}</span>
              <span className="flex items-center gap-1.5">
                {!expanded && <span className="rounded-full bg-white/[0.06] px-1.5 text-[10px] tracking-normal">{group.links.length}</span>}
                <ChevronDown className={cn('size-3.5 transition-transform', expanded ? 'rotate-180' : '')} aria-hidden="true" />
              </span>
            </button>
            {expanded && (
              <ul id={listId} className="space-y-0.5 pb-2">
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
