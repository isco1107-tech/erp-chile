'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import type { Contact } from '@prisma/client';
import { CreditCard, Package, PackagePlus, ReceiptText, Search, Target, UserPlus, Users, X, type LucideIcon } from 'lucide-react';
import { Dialog, DialogBackdrop, DialogDescription, DialogPortal, DialogTitle } from '@/components/ui/dialog';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/chile/tax';
import { listContactsAction } from '@/modules/contacts/actions/contacts.actions';
import { listProductsAction } from '@/modules/inventory/actions/products.actions';
import type { ProductWithStock } from '@/modules/inventory/services/products.service';
import type { Permission } from '@/lib/auth/permissions';
import type { CompanyFeatureFlags } from '@/lib/auth/modules';
import { buildWorkspaceNav } from '@/lib/navigation/workspace-nav';
import { NAV_ICONS } from './SidebarNav';

export interface CommandMenuProps {
  permissions: Permission[];
  features: CompanyFeatureFlags;
  /** Ítems que la empresa apagó: tampoco deben aparecer en la paleta. */
  disabledNavItems?: readonly string[];
}

interface StaticEntry {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  /** Grupo del sidebar al que pertenece; se muestra como pista a la derecha. */
  group?: string;
  keywords?: string[];
}

interface QuickAction extends StaticEntry {
  visible: (permissions: Permission[], features: CompanyFeatureFlags) => boolean;
  /** Ítem del menú del que depende: si la empresa lo apagó, la acción tampoco se ofrece. */
  navItem?: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    id: 'action-new-sale',
    label: 'Nueva venta',
    href: '/dashboard/sales/new',
    icon: CreditCard,
    keywords: ['factura', 'boleta', 'emitir'],
    visible: (permissions, features) => features.hasDteBilling && permissions.includes('sales:write'),
    navItem: 'sales',
  },
  {
    id: 'action-new-contact',
    label: 'Nuevo cliente o proveedor',
    href: '/dashboard/contacts?new=1',
    icon: UserPlus,
    keywords: ['contacto', 'rut'],
    visible: (permissions) => permissions.includes('contacts:write'),
    navItem: 'contacts',
  },
  {
    id: 'action-stock-in',
    label: 'Entrada de stock',
    href: '/dashboard/inventory?openStockForm=1',
    icon: PackagePlus,
    keywords: ['inventario', 'ingreso', 'bodega'],
    visible: (permissions, features) => features.hasInventory && permissions.includes('inventory:write'),
    navItem: 'inventory',
  },
  {
    id: 'action-new-opportunity',
    label: 'Nueva oportunidad comercial',
    href: '/dashboard/crm?new=1',
    icon: Target,
    keywords: ['crm', 'lead', 'prospecto', 'negocio'],
    visible: (permissions, features) => features.hasSalesPipeline && permissions.includes('crm:write'),
    navItem: 'crm',
  },
  {
    id: 'action-new-expense',
    label: 'Rendir un gasto',
    href: '/dashboard/expenses?new=1',
    icon: ReceiptText,
    keywords: ['rendicion', 'reembolso', 'boleta'],
    visible: (permissions, features) => features.hasExpenseReports && permissions.includes('expenses:submit'),
    navItem: 'expenses',
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

function matches(entry: StaticEntry, normalizedQuery: string): boolean {
  if (!normalizedQuery) return true;
  if (normalize(entry.label).includes(normalizedQuery)) return true;
  return (entry.keywords ?? []).some((keyword) => normalize(keyword).includes(normalizedQuery));
}

const MAX_LIVE_RESULTS = 5;
const OPTION_ID_PREFIX = 'command-option-';

export default function CommandMenu({ permissions, features, disabledNavItems }: CommandMenuProps) {
  const router = useRouter();

  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [contactResults, setContactResults] = React.useState<Contact[]>([]);
  const [productResults, setProductResults] = React.useState<ProductWithStock[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [searchFailed, setSearchFailed] = React.useState(false);

  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

  // Mismo registro que la barra lateral: todo módulo visible allá se encuentra acá.
  const visibleModules = React.useMemo<StaticEntry[]>(
    () =>
      buildWorkspaceNav({ permissions, features, disabledNavItems }).flatMap((group) =>
        group.links.map((link) => ({
          id: `nav-${link.href}`,
          label: link.label,
          href: link.href,
          icon: NAV_ICONS[link.icon],
          group: group.label,
          keywords: link.keywords,
        }))
      ),
    [permissions, features, disabledNavItems]
  );
  const visibleActions = React.useMemo(
    () =>
      QUICK_ACTIONS.filter(
        (item) => item.visible(permissions, features) && !(item.navItem && disabledNavItems?.includes(item.navItem))
      ),
    [permissions, features, disabledNavItems]
  );

  const canSearchContacts = permissions.includes('contacts:read');
  const canSearchProducts = features.hasInventory && permissions.includes('products:read');

  const trimmedQuery = query.trim();
  const normalizedQuery = normalize(trimmedQuery);

  const matchedModules = React.useMemo(
    () => visibleModules.filter((item) => matches(item, normalizedQuery)),
    [visibleModules, normalizedQuery]
  );
  const matchedActions = React.useMemo(
    () => visibleActions.filter((item) => matches(item, normalizedQuery)),
    [visibleActions, normalizedQuery]
  );

  // Atajo global: Cmd+K (Mac) / Ctrl+K (Windows-Linux) abre y cierra la paleta
  // desde cualquier punto del dashboard, sin importar qué tenga el foco.
  React.useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const isShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';
      if (!isShortcut || (!open && document.querySelector('[aria-modal="true"]'))) return;
      event.preventDefault();
      setOpen((prev) => !prev);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  // Limpia el estado al cerrar, para que la próxima apertura empiece en blanco
  // y no muestre resultados de la búsqueda anterior por una fracción de segundo.
  React.useEffect(() => {
    if (open) return;
    setQuery('');
    setContactResults([]);
    setProductResults([]);
    setSearchFailed(false);
    setActiveIndex(0);
  }, [open]);

  // Búsqueda en vivo de contactos y productos, debounced. Con menos de 2
  // caracteres no dispara nada: evita listar "todo" apenas se abre la paleta.
  React.useEffect(() => {
    if (!open || trimmedQuery.length < 2 || (!canSearchContacts && !canSearchProducts)) {
      setContactResults([]);
      setProductResults([]);
      setSearching(false);
      setSearchFailed(false);
      return;
    }

    let cancelled = false;
    setSearching(true);
    setSearchFailed(false);
    const timer = setTimeout(async () => {
      try {
        const [contactsResult, productsResult] = await Promise.all([
          canSearchContacts ? listContactsAction(trimmedQuery) : Promise.resolve(null),
          canSearchProducts ? listProductsAction(trimmedQuery) : Promise.resolve(null),
        ]);
        if (cancelled) return;
        setContactResults(contactsResult?.success ? contactsResult.data.slice(0, MAX_LIVE_RESULTS) : []);
        setProductResults(productsResult?.success ? productsResult.data.slice(0, MAX_LIVE_RESULTS) : []);
        setSearchFailed(contactsResult?.success === false || productsResult?.success === false);
      } catch {
        // Red caída o despliegue en curso: los módulos siguen funcionando,
        // solo se avisa que la búsqueda de registros no respondió.
        if (!cancelled) setSearchFailed(true);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, trimmedQuery, canSearchContacts, canSearchProducts]);

  const flatItems: FlatItem[] = React.useMemo(() => {
    const items: FlatItem[] = [];
    for (const entry of matchedActions) items.push({ kind: 'static', entry });
    for (const entry of matchedModules) items.push({ kind: 'static', entry });
    for (const contact of contactResults) items.push({ kind: 'contact', contact });
    for (const product of productResults) items.push({ kind: 'product', product });
    return items;
  }, [matchedModules, matchedActions, contactResults, productResults]);

  // El índice activo se recalcula con cada lista nueva: si no, sobrevive un
  // índice que ya no existe (ej. al borrar texto y perder resultados).
  React.useEffect(() => {
    setActiveIndex(0);
  }, [flatItems.length, trimmedQuery]);

  // Mantiene visible la fila activa al navegar con flechas.
  React.useEffect(() => {
    listRef.current?.querySelector(`#${OPTION_ID_PREFIX}${activeIndex}`)?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  function goTo(href: string) {
    router.push(href);
    setOpen(false);
  }

  function hrefFor(item: FlatItem): string {
    if (item.kind === 'static') return item.entry.href;
    if (item.kind === 'contact') return `/dashboard/contacts?edit=${item.contact.id}`;
    return `/dashboard/products?edit=${item.product.id}`;
  }

  function handleInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(flatItems.length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const item = flatItems[activeIndex];
      if (item) goTo(hrefFor(item));
    }
  }

  const showEmptyHint = (canSearchContacts || canSearchProducts) && trimmedQuery.length === 1;
  const showNoResults = !!trimmedQuery && !showEmptyHint && !searching && !searchFailed && flatItems.length === 0;

  // Índices estables por fila (antes un contador mutable hacía que el hover
  // activara siempre la última fila construida, y Enter abría otro destino).
  const indexed = flatItems.map((item, index) => ({ item, index }));
  const sections: { heading: string; rows: typeof indexed }[] = [
    { heading: 'Acciones rápidas', rows: indexed.filter(({ item }) => item.kind === 'static' && item.entry.id.startsWith('action-')) },
    { heading: 'Módulos', rows: indexed.filter(({ item }) => item.kind === 'static' && item.entry.id.startsWith('nav-')) },
    { heading: 'Clientes y proveedores', rows: indexed.filter(({ item }) => item.kind === 'contact') },
    { heading: 'Productos', rows: indexed.filter(({ item }) => item.kind === 'product') },
  ];

  function rowProps(item: FlatItem): { icon: LucideIcon; label: string; hint?: string } {
    if (item.kind === 'static') return { icon: item.entry.icon, label: item.entry.label, hint: item.entry.group };
    if (item.kind === 'contact') return { icon: Users, label: item.contact.razonSocial, hint: item.contact.rut };
    return { icon: Package, label: item.product.name, hint: `${item.product.sku} · ${formatCurrency(item.product.netPrice)}` };
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger
        type="button"
        aria-label="Buscar clientes, productos o módulos (Ctrl+K)"
        aria-keyshortcuts="Control+K Meta+K"
        data-tutorial="command-search"
        className="flex min-h-11 min-w-11 max-w-[380px] flex-1 items-center gap-2 rounded-xl border border-transparent bg-muted px-2.5 text-sm text-muted-foreground transition-colors hover:border-border hover:bg-muted/80 focus-visible:outline-2 focus-visible:outline-ring sm:px-3"
      >
        <Search className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
        <span className="truncate font-medium">Buscar<span className="hidden md:inline"> en el ERP</span></span>
        <kbd className="ml-auto hidden shrink-0 rounded-md border border-border bg-card px-1.5 py-0.5 font-sans text-[0.7rem] text-muted-foreground pointer-fine:sm:inline-block">
          Ctrl K
        </kbd>
      </DialogPrimitive.Trigger>

      <DialogPortal>
        <DialogBackdrop />
        <DialogPrimitive.Popup
          initialFocus={inputRef}
          className="fixed top-[max(0.5rem,env(safe-area-inset-top))] left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100%-1rem)] max-w-2xl -translate-x-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-popover outline-none motion-safe:transition-opacity data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 sm:top-[8dvh] sm:max-h-[82dvh] sm:w-[calc(100%-2rem)]"
        >
          <DialogTitle className="sr-only">Buscar en Aether</DialogTitle>
          <DialogDescription className="sr-only">
            Busca módulos, clientes, productos o ejecuta una acción rápida. Usa las flechas para moverte y Enter para abrir.
          </DialogDescription>

          <div className="flex items-center gap-2 border-b border-border px-4">
            <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => {
                if (query.trim() !== event.target.value.trim()) {
                  setContactResults([]);
                  setProductResults([]);
                  setActiveIndex(0);
                }
                setQuery(event.target.value);
              }}
              onKeyDown={handleInputKeyDown}
              placeholder="Módulos, clientes, productos…"
              autoComplete="off"
              role="combobox"
              aria-label="Buscar"
              aria-expanded={flatItems.length > 0}
              aria-controls="command-menu-list"
              aria-activedescendant={flatItems.length > 0 ? `${OPTION_ID_PREFIX}${activeIndex}` : undefined}
              className="h-14 min-w-0 flex-1 border-0 bg-transparent text-base outline-none placeholder:text-muted-foreground"
            />
            <DialogPrimitive.Close
              aria-label="Cerrar búsqueda"
              className="flex size-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
            >
              <X className="size-5" aria-hidden="true" />
            </DialogPrimitive.Close>
          </div>
          {searching && <p role="status" className="px-4 py-2 text-xs text-muted-foreground">Buscando registros…</p>}

          <div ref={listRef} id="command-menu-list" role="listbox" aria-label="Resultados" className="min-h-0 overflow-y-auto overscroll-contain p-2">
            {showEmptyHint && (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                Escribe al menos 2 caracteres para buscar clientes o productos
              </p>
            )}

            {sections.map(
              (section) =>
                section.rows.length > 0 && (
                  <div key={section.heading} role="group" aria-label={section.heading} className="mb-1">
                    <p className="px-3 pt-2 pb-1 text-xs font-medium text-muted-foreground">{section.heading}</p>
                    {section.rows.map(({ item, index }) => {
                      const { icon: Icon, label, hint } = rowProps(item);
                      const active = index === activeIndex;
                      return (
                        <button
                          key={`${item.kind}-${index}`}
                          id={`${OPTION_ID_PREFIX}${index}`}
                          type="button"
                          role="option"
                          aria-selected={active}
                          tabIndex={-1}
                          onClick={() => goTo(hrefFor(item))}
                          onMouseMove={() => {
                            if (!active) setActiveIndex(index);
                          }}
                          className={cn(
                            'flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                            active ? 'bg-accent text-accent-foreground' : 'text-foreground'
                          )}
                        >
                          <Icon className={cn('size-4 shrink-0', active ? 'text-accent-foreground' : 'text-muted-foreground')} aria-hidden="true" />
                          <span className="min-w-0 flex-1 break-words">{label}</span>
                          {hint && <span className="hidden max-w-[35%] truncate text-xs text-muted-foreground sm:inline">{hint}</span>}
                        </button>
                      );
                    })}
                  </div>
                )
            )}

            {searchFailed && (
              <p className="px-3 py-4 text-center text-sm text-muted-foreground">
                No se pudo buscar clientes ni productos. Revisa tu conexión e inténtalo otra vez.
              </p>
            )}

            {showNoResults && (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                Sin resultados para &ldquo;{trimmedQuery}&rdquo;
              </p>
            )}
          </div>

          <div className="hidden items-center gap-4 border-t border-border bg-muted/40 px-4 py-2 text-xs text-muted-foreground pointer-fine:sm:flex">
            <span><kbd className="font-sans font-semibold">↑↓</kbd> moverse</span>
            <span><kbd className="font-sans font-semibold">Enter</kbd> abrir</span>
            <span><kbd className="font-sans font-semibold">Esc</kbd> cerrar</span>
          </div>
        </DialogPrimitive.Popup>
      </DialogPortal>
    </Dialog>
  );
}
