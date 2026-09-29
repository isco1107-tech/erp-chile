'use client';

import type { KeyboardEvent } from 'react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import type { Tone } from '@/components/ui/tone';
import { cn } from '@/lib/utils';
import type { EditorTab } from './editor-shared';

export interface EditorTabDef {
  id: EditorTab;
  label: string;
  badge?: { text: string; tone: Tone; description: string } | null;
}

interface EditorTabsProps {
  tabs: EditorTabDef[];
  active: EditorTab;
  onChange: (tab: EditorTab) => void;
  /** Prefijo de ids para enlazar pestañas y panel (`aria-controls` / `aria-labelledby`). */
  idPrefix: string;
}

export function tabId(prefix: string, tab: EditorTab): string {
  return `${prefix}-tab-${tab}`;
}

export function tabPanelId(prefix: string): string {
  return `${prefix}-panel`;
}

/** Pestañas accesibles: role=tablist, flechas izquierda/derecha, Inicio y Fin. */
export function EditorTabs({ tabs, active, onChange, idPrefix }: EditorTabsProps) {
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = tabs.findIndex((tab) => tab.id === active);
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;
    event.preventDefault();
    const target = tabs[next];
    if (!target) return;
    onChange(target.id);
    document.getElementById(tabId(idPrefix, target.id))?.focus();
  }

  return (
    <div role="tablist" aria-label="Secciones del editor" onKeyDown={onKeyDown} className="-mx-1 flex gap-1 overflow-x-auto border-b border-border px-1">
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            id={tabId(idPrefix, tab.id)}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={tabPanelId(idPrefix)}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            className={cn(
              'relative flex shrink-0 items-center gap-2 rounded-t-md px-3 py-2.5 text-sm font-medium whitespace-nowrap outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50',
              selected ? 'text-foreground after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-primary' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.label}
            {tab.badge ? (
              <StatusBadge tone={tab.badge.tone} className="px-1.5 py-0 tabular-nums">
                <span aria-hidden="true">{tab.badge.text}</span>
                <span className="sr-only">{tab.badge.description}</span>
              </StatusBadge>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
