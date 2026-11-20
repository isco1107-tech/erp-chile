'use client';

import {
  AlignHorizontalJustifyCenter, AlignHorizontalJustifyEnd, AlignHorizontalJustifyStart,
  AlignHorizontalSpaceBetween, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart, AlignVerticalSpaceBetween, ClipboardPaste, Copy, CopyPlus,
  MousePointerClick, Scissors, Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { LayerAlignment, LayerDistribution } from '@/lib/events/pageant-layer-operations';
import type { PageantLayerCommand } from '@/lib/events/pageant-studio';

interface Props {
  count: number;
  movable: number;
  canPaste: boolean;
  disabled: boolean;
  onCommand: (command: PageantLayerCommand) => void;
  onPasteAt: () => void;
  onAlign: (alignment: LayerAlignment) => void;
  onDistribute: (axis: LayerDistribution) => void;
}

const ALIGNMENTS = [
  { id: 'left', label: 'Alinear a la izquierda', Icon: AlignHorizontalJustifyStart },
  { id: 'center', label: 'Centrar horizontalmente', Icon: AlignHorizontalJustifyCenter },
  { id: 'right', label: 'Alinear a la derecha', Icon: AlignHorizontalJustifyEnd },
  { id: 'top', label: 'Alinear arriba', Icon: AlignVerticalJustifyStart },
  { id: 'middle', label: 'Centrar verticalmente', Icon: AlignVerticalJustifyCenter },
  { id: 'bottom', label: 'Alinear abajo', Icon: AlignVerticalJustifyEnd },
] as const;

export function PageantSelectionTools({ count, movable, canPaste, disabled, onCommand, onPasteAt, onAlign, onDistribute }: Props) {
  if (!count && !canPaste) return null;

  const actions = [
    { id: 'copy', label: 'Copiar', Icon: Copy, available: count > 0 },
    { id: 'cut', label: 'Cortar', Icon: Scissors, available: movable > 0 },
    { id: 'paste', label: 'Pegar', Icon: ClipboardPaste, available: canPaste },
    { id: 'duplicate', label: 'Duplicar', Icon: CopyPlus, available: count > 0 },
    { id: 'delete', label: 'Eliminar', Icon: Trash2, available: movable > 0 },
  ] as const;

  return (
    <div role="group" aria-label="Acciones de las capas" className="space-y-3 rounded-lg border border-border bg-muted/25 p-3">
      <p role="status" className="text-sm font-semibold">
        {count === 0 ? 'Portapapeles de capas' : count === 1 ? '1 capa seleccionada' : `${count} capas seleccionadas`}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {actions.filter((action) => count || action.id === 'paste').map(({ id, label, Icon, available }) => (
          <Button key={id} type="button" size="sm" variant="outline" className="min-h-8" disabled={disabled || !available} onClick={() => onCommand(id)}>
            <Icon aria-hidden="true" />{label}
          </Button>
        ))}
        {canPaste && <Button type="button" size="sm" variant="outline" className="min-h-8" disabled={disabled} onClick={onPasteAt}>
          <MousePointerClick aria-hidden="true" />Pegar en otro lugar
        </Button>}
      </div>
      {count > 0 && (
        <div className="space-y-2 border-t border-border pt-2">
          <p className="text-xs font-medium text-muted-foreground">
            {count === 1 ? 'Alinear al lienzo' : movable < count ? 'Alinear a las capas bloqueadas' : 'Alinear selección'}
          </p>
          <div className="flex flex-wrap gap-1" role="group" aria-label="Alineación de las capas">
            {ALIGNMENTS.map(({ id, label, Icon }) => (
              <Button key={id} type="button" variant="outline" size="icon" title={label} aria-label={label}
                disabled={disabled || movable === 0} onClick={() => onAlign(id)}><Icon aria-hidden="true" /></Button>
            ))}
          </div>
          {count >= 3 && (
            <div className="flex flex-wrap gap-1" role="group" aria-label="Distribución del espacio entre capas">
              <Button type="button" variant="outline" size="sm" className="min-h-8" disabled={disabled || !movable}
                onClick={() => onDistribute('horizontal')}><AlignHorizontalSpaceBetween aria-hidden="true" />Distribuir horizontalmente</Button>
              <Button type="button" variant="outline" size="sm" className="min-h-8" disabled={disabled || !movable}
                onClick={() => onDistribute('vertical')}><AlignVerticalSpaceBetween aria-hidden="true" />Distribuir verticalmente</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
