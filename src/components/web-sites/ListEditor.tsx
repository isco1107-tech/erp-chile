'use client';

import { useEffect, useId, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, Copy, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-provider';
import { cn } from '@/lib/utils';

let keyCounter = 0;
/** Clave estable de un ítem: sobrevive a subir/bajar/quitar, así los campos con estado propio no se cruzan. */
function nextKey(): string {
  keyCounter += 1;
  return `item-${keyCounter}`;
}

/** ¿Hay algo escrito (o elegido) en este ítem? Decide si pedir confirmación al quitarlo. */
function hasContent(value: unknown): boolean {
  if (typeof value === 'string') return value.trim() !== '';
  if (typeof value === 'number') return value > 0;
  if (Array.isArray(value)) return value.some(hasContent);
  if (value && typeof value === 'object') return Object.values(value).some(hasContent);
  return false;
}

export interface ListEditorProps<T extends object> {
  /** Prefijo de los ids de los botones (para devolver el foco tras reordenar). */
  idPrefix: string;
  /** "tarjeta", "pregunta"…: se usa en los títulos y en los textos de los botones. */
  noun: string;
  items: T[];
  max: number;
  disabled?: boolean;
  addLabel: string;
  createItem: () => T;
  onChange: (items: T[]) => void;
  renderItem: (item: T, update: (patch: Partial<T>) => void, index: number) => ReactNode;
  /** Frase corta del contenido del ítem (se ve en el encabezado, sobre todo al plegarlo). */
  summary?: (item: T) => string;
  /** `cards`: cada ítem en su tarjeta plegable · `rows`: filas compactas (tablas). */
  variant?: 'cards' | 'rows';
  /** Texto del botón de duplicar (por omisión "Duplicar {noun}"). */
  duplicateLabel?: string;
  /** Mensaje cuando la lista está vacía. */
  emptyText?: string;
}

/**
 * Lista editable de ítems (tarjetas, preguntas, filas…): agregar, quitar,
 * duplicar, reordenar y plegar, con el foco bien puesto tras cada acción.
 */
export function ListEditor<T extends object>({
  idPrefix,
  noun,
  items,
  max,
  disabled,
  addLabel,
  createItem,
  onChange,
  renderItem,
  summary,
  variant = 'cards',
  duplicateLabel,
  emptyText,
}: ListEditorProps<T>) {
  const confirm = useConfirm();
  const bodyPrefix = useId();
  const [keys, setKeys] = useState<string[]>(() => items.map(() => nextKey()));
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [focusRequest, setFocusRequest] = useState<{ index: number; dir: -1 | 1 } | null>(null);

  // Si la lista cambia desde afuera (deshacer, cargar otro borrador), se reparten claves nuevas.
  let currentKeys = keys;
  if (keys.length !== items.length) {
    currentKeys = items.map((_, index) => keys[index] ?? nextKey());
    setKeys(currentKeys);
  }

  // Tras reordenar, el foco vuelve al botón del ítem que se movió (o a su par si ya no puede seguir).
  useEffect(() => {
    if (!focusRequest) return;
    const up = window.document.getElementById(`${idPrefix}-${focusRequest.index}-up`) as HTMLButtonElement | null;
    const down = window.document.getElementById(`${idPrefix}-${focusRequest.index}-down`) as HTMLButtonElement | null;
    const first = focusRequest.dir === -1 ? up : down;
    const second = focusRequest.dir === -1 ? down : up;
    (first && !first.disabled ? first : second)?.focus();
    setFocusRequest(null);
  }, [focusRequest, idPrefix]);

  function commit(nextItems: T[], nextKeys: string[]) {
    setKeys(nextKeys);
    onChange(nextItems);
  }

  function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= items.length) return;
    const nextItems = [...items];
    const nextKeys = [...currentKeys];
    const [moved] = nextItems.splice(index, 1);
    const [movedKey] = nextKeys.splice(index, 1);
    if (!moved || !movedKey) return;
    nextItems.splice(target, 0, moved);
    nextKeys.splice(target, 0, movedKey);
    setFocusRequest({ index: target, dir });
    commit(nextItems, nextKeys);
  }

  function duplicate(index: number) {
    const source = items[index];
    if (!source || items.length >= max) return;
    const nextItems = [...items];
    const nextKeys = [...currentKeys];
    nextItems.splice(index + 1, 0, structuredClone(source));
    nextKeys.splice(index + 1, 0, nextKey());
    commit(nextItems, nextKeys);
  }

  async function remove(index: number) {
    const item = items[index];
    if (item && hasContent(item) && !(await confirm({ title: `¿Quitar ${noun} ${index + 1}?`, description: 'Se perderá lo que escribiste en ella.', confirmLabel: 'Quitar' }))) return;
    commit(
      items.filter((_, i) => i !== index),
      currentKeys.filter((_, i) => i !== index)
    );
  }

  function add() {
    if (items.length >= max) return;
    commit([...items, createItem()], [...currentKeys, nextKey()]);
  }

  function toggle(key: string) {
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const actions = (index: number) => (
    <>
      <Button id={`${idPrefix}-${index}-up`} type="button" variant="ghost" size="icon-sm" disabled={disabled || index === 0} aria-label={`Subir ${noun} ${index + 1}`} onClick={() => move(index, -1)}>
        <ArrowUp aria-hidden="true" />
      </Button>
      <Button id={`${idPrefix}-${index}-down`} type="button" variant="ghost" size="icon-sm" disabled={disabled || index === items.length - 1} aria-label={`Bajar ${noun} ${index + 1}`} onClick={() => move(index, 1)}>
        <ArrowDown aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={disabled || items.length >= max}
        aria-label={`${duplicateLabel ?? 'Duplicar'} ${noun} ${index + 1}`}
        title={items.length >= max ? `Llegaste al máximo de ${max}` : (duplicateLabel ?? `Duplicar ${noun}`)}
        onClick={() => duplicate(index)}
      >
        <Copy aria-hidden="true" />
      </Button>
      <Button type="button" variant="ghost" size="icon-sm" disabled={disabled} aria-label={`Quitar ${noun} ${index + 1}`} onClick={() => void remove(index)}>
        <Trash2 aria-hidden="true" />
      </Button>
    </>
  );

  return (
    <div className="space-y-3">
      {items.length === 0 ? <p className="rounded-lg bg-muted px-3 py-3 text-sm text-muted-foreground">{emptyText ?? `Todavía no hay ninguna ${noun}. Agrega la primera.`}</p> : null}
      <ol className="space-y-3">
        {items.map((item, index) => {
          const key = currentKeys[index] ?? `fallback-${index}`;
          const update = (patch: Partial<T>) => onChange(items.map((current, i) => (i === index ? { ...current, ...patch } : current)));

          if (variant === 'rows') {
            return (
              <li key={key} className="rounded-lg border border-border bg-muted/40 p-2 md:border-0 md:bg-transparent md:p-0">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">{renderItem(item, update, index)}</div>
                  <div className="flex shrink-0 items-center gap-0.5">{actions(index)}</div>
                </div>
              </li>
            );
          }

          const isCollapsed = collapsed.has(key);
          const bodyId = `${bodyPrefix}-${key}`;
          const brief = summary?.(item).trim() ?? '';
          return (
            <li key={key} className="rounded-lg border border-border bg-muted/40">
              <div className={cn('flex items-center justify-between gap-2 px-3 py-1.5', !isCollapsed && 'border-b border-border')}>
                <button
                  type="button"
                  aria-expanded={!isCollapsed}
                  aria-controls={isCollapsed ? undefined : bodyId}
                  onClick={() => toggle(key)}
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-md py-1 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <ChevronDown className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform', isCollapsed && '-rotate-90')} aria-hidden="true" />
                  <span className="shrink-0 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    {noun} {index + 1}
                  </span>
                  {brief ? <span className="truncate text-xs text-foreground">{brief}</span> : null}
                  <span className="sr-only">{isCollapsed ? ' (plegada, toca para abrir)' : ' (abierta, toca para plegar)'}</span>
                </button>
                <div className="flex shrink-0 items-center gap-0.5">{actions(index)}</div>
              </div>
              {isCollapsed ? null : (
                <div id={bodyId} className="space-y-3 p-3">
                  {renderItem(item, update, index)}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" size="sm" variant="outline" disabled={disabled || items.length >= max} onClick={add}>
          <Plus aria-hidden="true" /> {addLabel}
        </Button>
        {items.length >= max ? <p className="text-xs text-muted-foreground">Llegaste al máximo de {max}.</p> : null}
      </div>
    </div>
  );
}
