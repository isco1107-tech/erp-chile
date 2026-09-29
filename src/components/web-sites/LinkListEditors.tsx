'use client';

import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp, CornerDownRight, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { newLinkId, MAX_FOOTER_COLUMNS, MAX_FOOTER_LINKS, MAX_MENU_ITEMS, MAX_SUBMENU_ITEMS, type FooterColumn, type MenuItem, type MenuLink, type SiteDocument } from '@/lib/web-sites/site';
import { cn } from '@/lib/utils';
import { TextField } from './fields';
import { LinkField } from './LinkField';

/** Con más opciones que esto, el menú se llena y en el celular es difícil de usar. */
export const MENU_COMFORT_LIMIT = 6;

function moveIn<T>(list: T[], index: number, dir: -1 | 1): T[] {
  const target = index + dir;
  if (index < 0 || target < 0 || target >= list.length) return list;
  const next = [...list];
  const [moved] = next.splice(index, 1);
  if (moved === undefined) return list;
  next.splice(target, 0, moved);
  return next;
}

/** Tras subir o bajar, el navegador suelta el foco del botón; se le devuelve para seguir con el teclado. */
function refocusMove(id: string, dir: -1 | 1) {
  window.requestAnimationFrame(() => {
    const first = window.document.getElementById(`${id}-${dir < 0 ? 'up' : 'down'}`) as HTMLButtonElement | null;
    const second = window.document.getElementById(`${id}-${dir < 0 ? 'down' : 'up'}`) as HTMLButtonElement | null;
    (first && !first.disabled ? first : second)?.focus();
  });
}

const newLink = (): MenuLink => ({ id: newLinkId(), label: '', href: '', newTab: false });
const newItem = (): MenuItem => ({ ...newLink(), children: [] });

interface RowProps {
  idPrefix: string;
  position: number;
  total: number;
  link: MenuLink;
  /** «la opción», «la opción del submenú», «el enlace»: para etiquetas y avisos. */
  noun: string;
  placeholder: string;
  doc: SiteDocument;
  pageId: string;
  disabled: boolean;
  /** El enlace puede quedar vacío (un ítem con submenú solo despliega sus opciones). */
  hrefOptional?: boolean;
  nested?: boolean;
  onPatch: (patch: Partial<MenuLink>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  children?: ReactNode;
}

/** Una opción de menú, de submenú o del pie: texto, a dónde lleva y subir / bajar / quitar. */
function LinkRow({ idPrefix, position, total, link, noun, placeholder, doc, pageId, disabled, hrefOptional, nested, onPatch, onMove, onRemove, children }: RowProps) {
  const noLabel = !link.label.trim();
  const noHref = !link.href.trim();
  return (
    <div className={cn('space-y-3 rounded-lg border border-border p-3', nested ? 'bg-card' : 'bg-muted/40')}>
      <div className="flex items-start gap-2">
        {nested ? <CornerDownRight className="mt-8 size-4 shrink-0 text-muted-foreground" aria-hidden="true" /> : null}
        <TextField
          className="min-w-0 flex-1"
          label={`Texto de ${noun} ${position}`}
          value={link.label}
          max={40}
          placeholder={placeholder}
          disabled={disabled}
          warning={noLabel ? 'Sin texto no se muestra en el sitio.' : null}
          onChange={(value) => onPatch({ label: value })}
        />
        <div className="mt-6 flex shrink-0 items-center gap-0.5">
          <Button id={`${idPrefix}-up`} type="button" variant="ghost" size="icon-sm" disabled={disabled || position <= 1} aria-label={`Subir ${noun} ${position}`} onClick={() => onMove(-1)}>
            <ArrowUp aria-hidden="true" />
          </Button>
          <Button id={`${idPrefix}-down`} type="button" variant="ghost" size="icon-sm" disabled={disabled || position >= total} aria-label={`Bajar ${noun} ${position}`} onClick={() => onMove(1)}>
            <ArrowDown aria-hidden="true" />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" disabled={disabled} aria-label={`Quitar ${noun} ${position}`} onClick={onRemove}>
            <Trash2 aria-hidden="true" />
          </Button>
        </div>
      </div>
      <LinkField
        label={`¿A dónde lleva ${noun} ${position}?`}
        value={link.href}
        onChange={(value) => onPatch({ href: value })}
        document={doc}
        pageId={pageId}
        disabled={disabled}
        newTab={{ checked: link.newTab, onChange: (checked) => onPatch({ newTab: checked }) }}
        hint={hrefOptional ? 'Opcional: si la dejas sin enlace, al tocarla solo se despliega el submenú.' : undefined}
      />
      {noHref && !hrefOptional ? <p className="text-xs font-medium text-warning">Sin enlace no se muestra en el sitio: elige a dónde lleva.</p> : null}
      {children}
    </div>
  );
}

interface MenuItemsEditorProps {
  doc: SiteDocument;
  pageId: string;
  items: MenuItem[];
  onChange: (updater: (items: MenuItem[]) => MenuItem[]) => void;
  disabled: boolean;
}

/** Editor del menú propio: opciones con su enlace y, si quieres, un submenú de un nivel. */
export function MenuItemsEditor({ doc, pageId, items, onChange, disabled }: MenuItemsEditorProps) {
  const patchItem = (id: string, patch: Partial<MenuItem>) => onChange((list) => list.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  const patchChild = (parentId: string, id: string, patch: Partial<MenuLink>) =>
    onChange((list) => list.map((item) => (item.id === parentId ? { ...item, children: item.children.map((child) => (child.id === id ? { ...child, ...patch } : child)) } : item)));
  const setChildren = (parentId: string, updater: (children: MenuLink[]) => MenuLink[]) => onChange((list) => list.map((item) => (item.id === parentId ? { ...item, children: updater(item.children) } : item)));

  return (
    <div className="space-y-3">
      {items.length > MENU_COMFORT_LIMIT ? (
        <p role="status" className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
          Tu menú tiene {items.length} opciones. Con {MENU_COMFORT_LIMIT} o menos se lee mejor, sobre todo en el celular: puedes agrupar las demás dentro de un submenú.
        </p>
      ) : null}

      {items.length === 0 ? <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">Tu menú está vacío. Agrega la primera opción, por ejemplo «Servicios» o «Contacto».</p> : null}

      <ol className="space-y-3">
        {items.map((item, index) => (
          <li key={item.id}>
            <LinkRow
              idPrefix={`menu-${item.id}`}
              position={index + 1}
              total={items.length}
              link={item}
              noun="la opción"
              placeholder="Ej.: Servicios"
              doc={doc}
              pageId={pageId}
              disabled={disabled}
              hrefOptional={item.children.length > 0}
              onPatch={(patch) => patchItem(item.id, patch)}
              onMove={(dir) => {
                onChange((list) => moveIn(list, index, dir));
                refocusMove(`menu-${item.id}`, dir);
              }}
              onRemove={() => onChange((list) => list.filter((entry) => entry.id !== item.id))}
            >
              <div className="space-y-2 border-t border-border pt-3">
                {item.children.length === 0 ? (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">¿Quieres que al pasar el mouse (o tocar, en el celular) se desplieguen más opciones?</p>
                    <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => setChildren(item.id, () => [newLink()])}>
                      <Plus aria-hidden="true" /> Agregar submenú
                    </Button>
                  </div>
                ) : (
                  <>
                    <p className="text-xs font-semibold text-foreground">
                      Submenú de «{item.label.trim() || `la opción ${index + 1}`}» <span className="font-normal text-muted-foreground">({item.children.length} de {MAX_SUBMENU_ITEMS})</span>
                    </p>
                    <ol className="space-y-2">
                      {item.children.map((child, childIndex) => (
                        <li key={child.id}>
                          <LinkRow
                            idPrefix={`menu-${item.id}-${child.id}`}
                            position={childIndex + 1}
                            total={item.children.length}
                            link={child}
                            noun="la opción del submenú"
                            placeholder="Ej.: Remodelaciones"
                            doc={doc}
                            pageId={pageId}
                            disabled={disabled}
                            nested
                            onPatch={(patch) => patchChild(item.id, child.id, patch)}
                            onMove={(dir) => {
                              setChildren(item.id, (list) => moveIn(list, childIndex, dir));
                              refocusMove(`menu-${item.id}-${child.id}`, dir);
                            }}
                            onRemove={() => setChildren(item.id, (list) => list.filter((entry) => entry.id !== child.id))}
                          />
                        </li>
                      ))}
                    </ol>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="outline" size="sm" disabled={disabled || item.children.length >= MAX_SUBMENU_ITEMS} onClick={() => setChildren(item.id, (list) => [...list, newLink()])}>
                        <Plus aria-hidden="true" /> Agregar opción al submenú
                      </Button>
                      <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => setChildren(item.id, () => [])}>
                        Quitar el submenú
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </LinkRow>
          </li>
        ))}
      </ol>

      <Button type="button" variant="outline" disabled={disabled || items.length >= MAX_MENU_ITEMS} onClick={() => onChange((list) => [...list, newItem()])}>
        <Plus aria-hidden="true" /> Agregar opción al menú
      </Button>
      {items.length >= MAX_MENU_ITEMS ? <p className="text-xs text-muted-foreground">El menú puede tener hasta {MAX_MENU_ITEMS} opciones.</p> : null}
    </div>
  );
}

interface FooterColumnsEditorProps {
  doc: SiteDocument;
  pageId: string;
  columns: FooterColumn[];
  onChange: (updater: (columns: FooterColumn[]) => FooterColumn[]) => void;
  disabled: boolean;
}

/** Columnas de enlaces del pie: cada una con un título y sus enlaces. */
export function FooterColumnsEditor({ doc, pageId, columns, onChange, disabled }: FooterColumnsEditorProps) {
  const patchColumn = (id: string, patch: Partial<FooterColumn>) => onChange((list) => list.map((column) => (column.id === id ? { ...column, ...patch } : column)));
  const setLinks = (columnId: string, updater: (links: MenuLink[]) => MenuLink[]) => onChange((list) => list.map((column) => (column.id === columnId ? { ...column, links: updater(column.links) } : column)));

  return (
    <div className="space-y-3">
      {columns.length === 0 ? <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">Aún no hay columnas. Agrega una, por ejemplo «Empresa» con «Nosotros» y «Contacto».</p> : null}
      <ol className="space-y-3">
        {columns.map((column, index) => (
          <li key={column.id} className="space-y-3 rounded-lg border border-border bg-muted/40 p-3">
            <div className="flex items-start gap-2">
              <TextField className="min-w-0 flex-1" label={`Título de la columna ${index + 1}`} value={column.title} max={40} placeholder="Ej.: Empresa" disabled={disabled} onChange={(value) => patchColumn(column.id, { title: value })} />
              <div className="mt-6 flex shrink-0 items-center gap-0.5">
                <Button id={`footer-${column.id}-up`} type="button" variant="ghost" size="icon-sm" disabled={disabled || index === 0} aria-label={`Subir la columna ${index + 1}`} onClick={() => {
                  onChange((list) => moveIn(list, index, -1));
                  refocusMove(`footer-${column.id}`, -1);
                }}>
                  <ArrowUp aria-hidden="true" />
                </Button>
                <Button id={`footer-${column.id}-down`} type="button" variant="ghost" size="icon-sm" disabled={disabled || index === columns.length - 1} aria-label={`Bajar la columna ${index + 1}`} onClick={() => {
                  onChange((list) => moveIn(list, index, 1));
                  refocusMove(`footer-${column.id}`, 1);
                }}>
                  <ArrowDown aria-hidden="true" />
                </Button>
                <Button type="button" variant="ghost" size="icon-sm" disabled={disabled} aria-label={`Quitar la columna ${index + 1}`} onClick={() => onChange((list) => list.filter((entry) => entry.id !== column.id))}>
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
            </div>
            <ol className="space-y-2">
              {column.links.map((entry, linkIndex) => (
                <li key={entry.id}>
                  <LinkRow
                    idPrefix={`footer-${column.id}-${entry.id}`}
                    position={linkIndex + 1}
                    total={column.links.length}
                    link={entry}
                    noun="el enlace"
                    placeholder="Ej.: Nosotros"
                    doc={doc}
                    pageId={pageId}
                    disabled={disabled}
                    nested
                    onPatch={(patch) => setLinks(column.id, (list) => list.map((item) => (item.id === entry.id ? { ...item, ...patch } : item)))}
                    onMove={(dir) => {
                      setLinks(column.id, (list) => moveIn(list, linkIndex, dir));
                      refocusMove(`footer-${column.id}-${entry.id}`, dir);
                    }}
                    onRemove={() => setLinks(column.id, (list) => list.filter((item) => item.id !== entry.id))}
                  />
                </li>
              ))}
            </ol>
            <Button type="button" variant="outline" size="sm" disabled={disabled || column.links.length >= MAX_FOOTER_LINKS} onClick={() => setLinks(column.id, (list) => [...list, newLink()])}>
              <Plus aria-hidden="true" /> Agregar enlace {column.links.length >= MAX_FOOTER_LINKS ? `(máximo ${MAX_FOOTER_LINKS})` : ''}
            </Button>
          </li>
        ))}
      </ol>
      <Button type="button" variant="outline" disabled={disabled || columns.length >= MAX_FOOTER_COLUMNS} onClick={() => onChange((list) => [...list, { id: newLinkId(), title: '', links: [] }])}>
        <Plus aria-hidden="true" /> Agregar columna {columns.length >= MAX_FOOTER_COLUMNS ? `(máximo ${MAX_FOOTER_COLUMNS})` : ''}
      </Button>
    </div>
  );
}
