'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  Route,
  ShieldAlert,
  ArrowLeftRight,
  PackageOpen,
  HeartHandshake,
  FileText,
  UserCheck,
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
  LayoutGrid,
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
  Activity,
  CalendarSync,
  ShoppingBasket,
  Flame,
  Snail,
  Archive,
  BookOpen,
  Factory,
  Settings,
  Store,
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
  Download,
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
  GraduationCap,
  Layers,
  Sparkles,
  Smartphone,
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
  apps: LayoutGrid,
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
  traceability: Route,
  recall: ShieldAlert,
  labels: Barcode,
  mobile: Smartphone,
  movements: ArrowLeftRight,
  consignment: PackageOpen,
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
  academy: GraduationCap,
  webSites: Globe,
  store: Store,
  invoiceArchive: Archive,
  customerCare: HeartHandshake,
  quality: ShieldCheck,
  procedures: FileText,
  tasks: ListChecks,
  delegation: UserCheck,
  crmTasks: CalendarCheck,
  crmPeople: Contact,
  crmReports: BarChart3,
  pageantSite: Globe,
  packages: Layers,
  casting: Sparkles,
  retail: Activity,
  deadStock: Snail,
  heatmap: Flame,
  basket: ShoppingBasket,
  reorder: CalendarSync,
  shrinkage: Scale,
  exports: Download,
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
  const [collapsedActivePath, setCollapsedActivePath] = useState<string | null>(null);
  const [manualState, setManualState] = useState<Record<string, boolean>>({});
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(NAV_GROUPS_STORAGE_KEY);
      if (saved) setManualState(JSON.parse(saved) as Record<string, boolean>);
    } catch {
      // Sin almacenamiento (modo privado): los grupos parten en su estado por defecto.
    }
  }, []);
  useEffect(() => setCollapsedActivePath(null), [pathname]);

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
    <nav aria-label="Módulos" data-tutorial="sidebar-nav" className="hud-scroll -mr-2 flex-1 space-y-1.5 overflow-y-auto overscroll-contain pr-2">
      {groups.map((group, index) => {
        const groupHasActiveLink = group.links.some(isLinkActive);
        const expanded = groupHasActiveLink
          ? collapsedActivePath !== pathname
          : manualState[group.label] ?? (index === 0 && !group.collapsedByDefault);
        const listId = `nav-group-${index}`;

        return (
          <div key={group.label}>
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={listId}
              onClick={() => {
                if (groupHasActiveLink) setCollapsedActivePath(expanded ? pathname : null);
                else toggleGroup(group.label, expanded);
              }}
              className={cn(
                'flex min-h-10 w-full items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-left text-xs font-medium transition-colors hover:bg-sidebar-accent hover:text-white focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-sidebar-ring xl:min-h-8 pointer-coarse:min-h-11',
                groupHasActiveLink ? 'text-sidebar-primary' : 'text-sidebar-foreground',
              )}
            >
              <span className="truncate">{group.label}</span>
              <ChevronDown className={cn('size-4 shrink-0 motion-safe:transition-transform', expanded && 'rotate-180')} aria-hidden="true" />
            </button>
            <ul id={listId} hidden={!expanded} className="space-y-0.5 pb-1">
              {expanded && group.links.map((link) => {
                const Icon = NAV_ICONS[link.icon];
                const active = isLinkActive(link);

                return (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex min-h-11 items-center gap-3 rounded-[10px] border-l-[3px] py-1.5 pr-3 pl-[9px] text-sm leading-snug transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-sidebar-ring xl:min-h-9 pointer-coarse:min-h-11',
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
                      <span>{link.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
