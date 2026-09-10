'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import type { Contact } from '@prisma/client';
import {
  Bot,
  Box,
  CalendarRange,
  Crown,
  CreditCard,
  FileSpreadsheet,
  Handshake,
  Home,
  Landmark,
  Network,
  Package,
  PackagePlus,
  Receipt,
  Search,
  Settings,
  ShieldCheck,
  ShoppingCart,
  TrendingDown,
  UserPlus,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { Dialog, DialogBackdrop, DialogDescription, DialogPortal, DialogTitle } from '@/components/ui/dialog';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/chile/tax';
import { listContactsAction } from '@/modules/contacts/actions/contacts.actions';
import { listProductsAction } from '@/modules/inventory/actions/products.actions';
import type { ProductWithStock } from '@/modules/inventory/services/products.service';
import type { Permission } from '@/lib/auth/permissions';
import type { CompanyFeatureFlags } from '@/lib/auth/modules';

export interface CommandMenuProps {
  permissions: Permission[];
  features: CompanyFeatureFlags;
  isSuperAdmin: boolean;
}

interface AccessContext {
  permissions: Permission[];
  features: CompanyFeatureFlags;
  isSuperAdmin: boolean;
}

function hasPermission(ctx: AccessContext, permission: Permission): boolean {
  return ctx.permissions.includes(permission);
}

interface StaticEntry {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  visible: (ctx: AccessContext) => boolean;
}

/** Mismos módulos y condiciones del sidebar (src/app/(dashboard)/layout.tsx), para no divergir. */
const NAV_ITEMS: StaticEntry[] = [
  { id: 'nav-dashboard', label: 'Dashboard', href: '/dashboard', icon: Home, visible: () => true },
  {
    id: 'nav-pos',
    label: 'Punto de Venta',
    href: '/dashboard/pos',
    icon: ShoppingCart,
    visible: (ctx) => ctx.features.hasPos && hasPermission(ctx, 'pos:operate'),
  },
  {
    id: 'nav-sales',
    label: 'Ventas & Facturación',
    href: '/dashboard/sales',
    icon: CreditCard,
    visible: (ctx) => ctx.features.hasDteBilling && hasPermission(ctx, 'sales:read'),
  },
  {
    id: 'nav-purchases',
    label: 'Compras',
    href: '/dashboard/purchases',
    icon: ShoppingCart,
    visible: (ctx) => ctx.features.hasPurchases && hasPermission(ctx, 'purchases:read'),
  },
  {
    id: 'nav-products',
    label: 'Catálogo de Productos',
    href: '/dashboard/products',
    icon: Package,
    visible: (ctx) => ctx.features.hasInventory && hasPermission(ctx, 'products:read'),
  },
  {
    id: 'nav-inventory',
    label: 'Inventario',
    href: '/dashboard/inventory',
    icon: Box,
    visible: (ctx) => ctx.features.hasInventory && hasPermission(ctx, 'products:read'),
  },
  {
    id: 'nav-contacts',
    label: 'Clientes & Proveedores',
    href: '/dashboard/contacts',
    icon: Users,
    visible: (ctx) => hasPermission(ctx, 'contacts:read'),
  },
  {
    id: 'nav-cxc',
    label: 'Cuentas por Cobrar',
    href: '/dashboard/treasury/cxc',
    icon: Wallet,
    visible: (ctx) => ctx.features.hasTreasury && hasPermission(ctx, 'treasury:read'),
  },
  {
    id: 'nav-cxp',
    label: 'Cuentas por Pagar',
    href: '/dashboard/treasury/cxp',
    icon: TrendingDown,
    visible: (ctx) => ctx.features.hasTreasury && hasPermission(ctx, 'treasury:read'),
  },
  {
    id: 'nav-cashflow',
    label: 'Flujo de Caja',
    href: '/dashboard/treasury/cashflow',
    icon: Landmark,
    visible: (ctx) => ctx.features.hasTreasury && hasPermission(ctx, 'treasury:read'),
  },
  {
    id: 'nav-reports',
    label: 'Reportes Excel',
    href: '/dashboard/reports',
    icon: FileSpreadsheet,
    visible: (ctx) => ctx.features.hasAdvancedReports && hasPermission(ctx, 'reports:read'),
  },
  {
    id: 'nav-agents',
    label: 'Agentes de Inteligencia de Negocio',
    href: '/dashboard/agents',
    icon: Bot,
    visible: (ctx) => ctx.features.hasCrm && hasPermission(ctx, 'agents:view'),
  },
  {
    id: 'nav-projects',
    label: 'Eventos & Proyectos',
    href: '/dashboard/projects',
    icon: CalendarRange,
    visible: (ctx) => ctx.features.hasEventProjects && hasPermission(ctx, 'projects:read'),
  },
  {
    id: 'nav-sponsorships',
    label: 'Auspicios & Marcas',
    href: '/dashboard/sponsorships',
    icon: Handshake,
    visible: (ctx) => ctx.features.hasSponsorships && hasPermission(ctx, 'sponsorships:read'),
  },
  {
    id: 'nav-fees',
    label: 'Boletas de Honorarios',
    href: '/dashboard/fees',
    icon: Receipt,
    visible: (ctx) => ctx.features.hasFeeDocuments && hasPermission(ctx, 'fees:read'),
  },
  {
    id: 'nav-candidates',
    label: 'Candidatas & Staff',
    href: '/dashboard/candidates',
    icon: Crown,
    visible: (ctx) => ctx.features.hasCandidates && hasPermission(ctx, 'candidates:read'),
  },
  {
    id: 'nav-org-chart',
    label: 'Organigrama',
    href: '/dashboard/org-chart',
    icon: Network,
    visible: (ctx) => ctx.features.hasOrgChart && hasPermission(ctx, 'orgchart:read'),
  },
  {
    id: 'nav-settings',
    label: 'Configuración',
    href: '/dashboard/settings',
    icon: Settings,
    visible: (ctx) =>
      hasPermission(ctx, 'settings:company') || hasPermission(ctx, 'settings:users') || hasPermission(ctx, 'audit:read'),
  },
  {
    id: 'nav-superadmin',
    label: 'Panel SaaS',
    href: '/superadmin',
    icon: ShieldCheck,
    visible: (ctx) => ctx.isSuperAdmin,
  },
];

const QUICK_ACTIONS: StaticEntry[] = [
  {
    id: 'action-new-sale',
    label: '+ Nueva Venta',
    href: '/dashboard/sales/new',
    icon: CreditCard,
    visible: (ctx) => ctx.features.hasDteBilling && hasPermission(ctx, 'sales:write'),
  },
  {
    id: 'action-new-contact',
    label: '+ Nuevo Cliente',
    href: '/dashboard/contacts?new=1',
    icon: UserPlus,
    visible: (ctx) => hasPermission(ctx, 'contacts:write'),
  },
  {
    id: 'action-stock-in',
    label: '+ Entrada de Stock',
    href: '/dashboard/inventory?openStockForm=1',
    icon: PackagePlus,
    visible: (ctx) => ctx.features.hasInventory && hasPermission(ctx, 'inventory:write'),
  },
];

type FlatItem =
  | { kind: 'static'; entry: StaticEntry }
  | { kind: 'contact'; contact: Contact }
  | { kind: 'product'; product: ProductWithStock };

// Rango de diacríticos combinantes construido con String.fromCharCode en vez
// de escribirlo literal en el código fuente: ese rango de caracteres se
// corrompe con facilidad al pasar por herramientas que no preservan UTF-8
// (mismo problema documentado en import/services/parse.service.ts).
const COMBINING_DIACRITICS = new RegExp('[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g');

function normalize(text: string): string {
  return text.normalize('NFD').replace(COMBINING_DIACRITICS, '').toLowerCase();
}

const MAX_LIVE_RESULTS = 5;

export default function CommandMenu({ permissions, features, isSuperAdmin }: CommandMenuProps) {
  const router = useRouter();
  const ctx: AccessContext = React.useMemo(
    () => ({ permissions, features, isSuperAdmin }),
    [permissions, features, isSuperAdmin]
  );

  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [contactResults, setContactResults] = React.useState<Contact[]>([]);
  const [productResults, setProductResults] = React.useState<ProductWithStock[]>([]);
  const [searching, setSearching] = React.useState(false);

  const inputRef = React.useRef<HTMLInputElement>(null);

  const visibleModules = React.useMemo(() => NAV_ITEMS.filter((item) => item.visible(ctx)), [ctx]);
  const visibleActions = React.useMemo(() => QUICK_ACTIONS.filter((item) => item.visible(ctx)), [ctx]);

  const canSearchContacts = hasPermission(ctx, 'contacts:read');
  const canSearchProducts = features.hasInventory && hasPermission(ctx, 'products:read');

  const trimmedQuery = query.trim();
  const normalizedQuery = normalize(trimmedQuery);

  const matchedModules = React.useMemo(
    () => (normalizedQuery ? visibleModules.filter((item) => normalize(item.label).includes(normalizedQuery)) : visibleModules),
    [visibleModules, normalizedQuery]
  );
  const matchedActions = React.useMemo(
    () => (normalizedQuery ? visibleActions.filter((item) => normalize(item.label).includes(normalizedQuery)) : visibleActions),
    [visibleActions, normalizedQuery]
  );

  // Atajo global: Cmd+K (Mac) / Ctrl+K (Windows-Linux) abre y cierra la paleta
  // desde cualquier punto del dashboard, sin importar qué tenga el foco.
  React.useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const isShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';
      if (!isShortcut) return;
      event.preventDefault();
      setOpen((prev) => !prev);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Limpia el estado al cerrar, para que la próxima apertura empiece en blanco
  // y no muestre resultados de la búsqueda anterior por una fracción de segundo.
  React.useEffect(() => {
    if (open) {
      const timer = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(timer);
    }
    setQuery('');
    setContactResults([]);
    setProductResults([]);
    setActiveIndex(0);
  }, [open]);

  // Búsqueda en vivo de contactos y productos, debounced. Con menos de 2
  // caracteres no dispara nada: evita listar "todo" apenas se abre la paleta.
  React.useEffect(() => {
    if (trimmedQuery.length < 2) {
      setContactResults([]);
      setProductResults([]);
      setSearching(false);
      return;
    }

    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      const [contactsResult, productsResult] = await Promise.all([
        canSearchContacts ? listContactsAction(trimmedQuery) : Promise.resolve(null),
        canSearchProducts ? listProductsAction(trimmedQuery) : Promise.resolve(null),
      ]);
      if (cancelled) return;
      setContactResults(contactsResult?.success ? contactsResult.data.slice(0, MAX_LIVE_RESULTS) : []);
      setProductResults(productsResult?.success ? productsResult.data.slice(0, MAX_LIVE_RESULTS) : []);
      setSearching(false);
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [trimmedQuery, canSearchContacts, canSearchProducts]);

  const flatItems: FlatItem[] = React.useMemo(() => {
    const items: FlatItem[] = [];
    for (const entry of matchedModules) items.push({ kind: 'static', entry });
    for (const entry of matchedActions) items.push({ kind: 'static', entry });
    for (const contact of contactResults) items.push({ kind: 'contact', contact });
    for (const product of productResults) items.push({ kind: 'product', product });
    return items;
  }, [matchedModules, matchedActions, contactResults, productResults]);

  // El índice activo se recalcula con cada lista nueva: si no, sobrevive un
  // índice que ya no existe (ej. al borrar texto y perder resultados).
  React.useEffect(() => {
    setActiveIndex(0);
  }, [flatItems.length, trimmedQuery]);

  function close() {
    setOpen(false);
  }

  function goTo(href: string) {
    router.push(href);
    close();
  }

  function selectItem(item: FlatItem) {
    if (item.kind === 'static') goTo(item.entry.href);
    else if (item.kind === 'contact') goTo(`/dashboard/contacts?edit=${item.contact.id}`);
    else goTo(`/dashboard/products?edit=${item.product.id}`);
  }

  function handleInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(flatItems.length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const item = flatItems[activeIndex];
      if (item) selectItem(item);
    }
  }

  let rowCursor = -1;
  function nextRowIndex() {
    rowCursor += 1;
    return rowCursor;
  }

  const showEmptyHint = trimmedQuery.length > 0 && trimmedQuery.length < 2;
  const showNoResults =
    trimmedQuery.length >= 2 &&
    !searching &&
    matchedModules.length === 0 &&
    matchedActions.length === 0 &&
    contactResults.length === 0 &&
    productResults.length === 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Buscar módulos, clientes, productos o acciones"
        className="flex h-10 min-w-10 items-center gap-2 rounded-full border border-border bg-card px-3 text-sm text-muted-foreground transition-colors duration-150 hover:bg-muted sm:w-full sm:max-w-[300px]"
      >
        <Search className="size-4 shrink-0" strokeWidth={1.75} />
        <span className="hidden truncate sm:inline">¿Qué necesitas encontrar?</span>
        <kbd className="ml-auto hidden shrink-0 rounded-md border border-border bg-card px-1.5 py-0.5 font-mono text-[0.7rem] text-muted-foreground sm:inline-block">
          Ctrl / ⌘ K
        </kbd>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogPortal>
          <DialogBackdrop />
          <DialogPrimitive.Popup className="fixed top-[12%] left-1/2 z-50 w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-lg outline-none transition-all data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
            <DialogTitle className="sr-only">Paleta de comandos</DialogTitle>
            <DialogDescription className="sr-only">
              Busca módulos, clientes, productos o ejecuta una acción rápida
            </DialogDescription>

            <div className="flex items-center gap-2 border-b border-border px-4">
              <Search className="size-4 shrink-0 text-muted-foreground" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder="Buscar módulos, clientes, productos o acciones..."
                autoComplete="off"
                className="h-14 w-full border-0 bg-transparent text-base outline-none placeholder:text-muted-foreground"
              />
              {searching && <span className="shrink-0 text-xs text-muted-foreground">Buscando...</span>}
            </div>

            <div className="max-h-[60vh] overflow-y-auto p-2">
              {showEmptyHint && (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                  Escribe al menos 2 caracteres para buscar clientes o productos
                </p>
              )}

              {matchedModules.length > 0 && (
                <CommandGroup heading="Módulos">
                  {matchedModules.map((entry) => (
                    <CommandRow
                      key={entry.id}
                      active={nextRowIndex() === activeIndex}
                      icon={entry.icon}
                      label={entry.label}
                      onMouseEnter={() => setActiveIndex(rowCursor)}
                      onClick={() => goTo(entry.href)}
                    />
                  ))}
                </CommandGroup>
              )}

              {matchedActions.length > 0 && (
                <CommandGroup heading="Acciones rápidas">
                  {matchedActions.map((entry) => (
                    <CommandRow
                      key={entry.id}
                      active={nextRowIndex() === activeIndex}
                      icon={entry.icon}
                      label={entry.label}
                      onMouseEnter={() => setActiveIndex(rowCursor)}
                      onClick={() => goTo(entry.href)}
                    />
                  ))}
                </CommandGroup>
              )}

              {contactResults.length > 0 && (
                <CommandGroup heading="Clientes y Proveedores">
                  {contactResults.map((contact) => (
                    <CommandRow
                      key={contact.id}
                      active={nextRowIndex() === activeIndex}
                      icon={Users}
                      label={contact.razonSocial}
                      hint={contact.rut}
                      onMouseEnter={() => setActiveIndex(rowCursor)}
                      onClick={() => goTo(`/dashboard/contacts?edit=${contact.id}`)}
                    />
                  ))}
                </CommandGroup>
              )}

              {productResults.length > 0 && (
                <CommandGroup heading="Productos">
                  {productResults.map((product) => (
                    <CommandRow
                      key={product.id}
                      active={nextRowIndex() === activeIndex}
                      icon={Package}
                      label={product.name}
                      hint={`${product.sku} · ${formatCurrency(product.netPrice)}`}
                      onMouseEnter={() => setActiveIndex(rowCursor)}
                      onClick={() => goTo(`/dashboard/products?edit=${product.id}`)}
                    />
                  ))}
                </CommandGroup>
              )}

              {showNoResults && (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                  Sin resultados para &ldquo;{trimmedQuery}&rdquo;
                </p>
              )}
            </div>
          </DialogPrimitive.Popup>
        </DialogPortal>
      </Dialog>
    </>
  );
}

function CommandGroup({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <div className="mb-1">
      <p className="px-3 pt-2 pb-1 text-xs font-medium text-muted-foreground">{heading}</p>
      <div>{children}</div>
    </div>
  );
}

function CommandRow({
  active,
  icon: Icon,
  label,
  hint,
  onClick,
  onMouseEnter,
}: {
  active: boolean;
  icon: LucideIcon;
  label: string;
  hint?: string;
  onClick: () => void;
  onMouseEnter: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors',
        active ? 'bg-muted text-foreground' : 'text-foreground hover:bg-muted/60'
      )}
    >
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <span className="flex-1 truncate">{label}</span>
      {hint && <span className="shrink-0 truncate text-xs text-muted-foreground">{hint}</span>}
    </button>
  );
}
