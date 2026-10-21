'use client';

import type { ReactNode } from 'react';
import { Menu } from '@base-ui/react/menu';
import { ArrowRightLeft, Copy, CopyPlus, MoreHorizontal, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SectionMenuProps {
  name: string;
  disabled: boolean;
  canDuplicate: boolean;
  duplicateReason: string | null;
  hasOtherPages: boolean;
  onDuplicate: () => void;
  onMoveToPage: () => void;
  onCopyToPage: () => void;
  onRemove: () => void;
}

const itemClass =
  'flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm outline-none select-none data-[highlighted]:bg-muted data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50';

function Item({ icon, children, onClick, disabled, danger }: { icon: ReactNode; children: ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <Menu.Item className={cn(itemClass, danger && 'text-danger')} disabled={disabled} onClick={onClick}>
      {icon}
      <span className="min-w-0 flex-1">{children}</span>
    </Menu.Item>
  );
}

/** Menú “Más acciones” de una sección: duplicar, mover o copiar a otra página y eliminar. */
export function SectionMenu({ name, disabled, canDuplicate, duplicateReason, hasOtherPages, onDuplicate, onMoveToPage, onCopyToPage, onRemove }: SectionMenuProps) {
  return (
    <Menu.Root>
      <Menu.Trigger
        disabled={disabled}
        aria-label={`Más acciones de ${name}`}
        className="grid size-7 place-items-center rounded-[min(var(--radius-md),12px)] text-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 data-[popup-open]:bg-muted"
      >
        <MoreHorizontal className="size-4" aria-hidden="true" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner className="z-50" sideOffset={4} align="end">
          <Menu.Popup className="min-w-56 rounded-xl border border-border bg-card p-1 text-card-foreground shadow-lg outline-none data-[ending-style]:opacity-0 data-[starting-style]:opacity-0">
            <Item icon={<Copy className="size-4" aria-hidden="true" />} onClick={onDuplicate} disabled={!canDuplicate}>
              Duplicar
              {duplicateReason ? <span className="block text-xs text-muted-foreground">{duplicateReason}</span> : null}
            </Item>
            <Item icon={<ArrowRightLeft className="size-4" aria-hidden="true" />} onClick={onMoveToPage} disabled={!hasOtherPages}>
              Mover a otra página…
              {!hasOtherPages ? <span className="block text-xs text-muted-foreground">Primero crea otra página</span> : null}
            </Item>
            <Item icon={<CopyPlus className="size-4" aria-hidden="true" />} onClick={onCopyToPage} disabled={!hasOtherPages}>
              Copiar a otra página…
            </Item>
            <Menu.Separator className="mx-1 my-1 h-px bg-border" />
            <Item icon={<Trash2 className="size-4" aria-hidden="true" />} onClick={onRemove} danger>
              Eliminar sección
            </Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
