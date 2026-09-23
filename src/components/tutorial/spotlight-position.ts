export type TutorialPlacement = 'top' | 'bottom' | 'left' | 'right';

export interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface TooltipPosition {
  top: number;
  left: number;
  placement: TutorialPlacement;
  /** Desplazamiento horizontal (top/bottom) o vertical (left/right) de la flecha dentro del tooltip, en px desde su esquina superior izquierda. */
  arrowOffset: number;
}

const GAP = 14;
const VIEWPORT_MARGIN = 12;
const ARROW_CLEARANCE = 20;

/** Espacio libre hacia cada lado del rect respecto al viewport. */
function spaceAround(rect: Rect, viewportWidth: number, viewportHeight: number) {
  return {
    top: rect.top,
    bottom: viewportHeight - (rect.top + rect.height),
    left: rect.left,
    right: viewportWidth - (rect.left + rect.width),
  };
}

/**
 * Elige el lado del tooltip: respeta `preferred` si entra, si no cae al lado
 * con más espacio libre. `tooltipMainAxisSize` es el alto (para top/bottom) o
 * ancho (para left/right) del tooltip ya medido.
 */
function pickPlacement(
  preferred: TutorialPlacement,
  rect: Rect,
  tooltipMainAxisSize: number,
  viewportWidth: number,
  viewportHeight: number
): TutorialPlacement {
  const space = spaceAround(rect, viewportWidth, viewportHeight);
  const fits: Record<TutorialPlacement, boolean> = {
    top: space.top >= tooltipMainAxisSize + GAP,
    bottom: space.bottom >= tooltipMainAxisSize + GAP,
    left: space.left >= tooltipMainAxisSize + GAP,
    right: space.right >= tooltipMainAxisSize + GAP,
  };

  if (fits[preferred]) return preferred;

  const opposite: Record<TutorialPlacement, TutorialPlacement> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
  if (fits[opposite[preferred]]) return opposite[preferred];

  const bySpace = (Object.entries(space) as [TutorialPlacement, number][]).sort((a, b) => b[1] - a[1]);
  return bySpace[0][0];
}

/**
 * Calcula dónde poner el tooltip (y su flecha) respecto al elemento
 * resaltado, dentro del viewport. `tooltipSize` es el tamaño real ya medido
 * (dos pasadas: se renderiza oculto, se mide, se reposiciona) para no
 * adivinar su alto con contenido variable.
 */
export function computeTooltipPosition(
  rect: Rect,
  tooltipSize: { width: number; height: number },
  preferred: TutorialPlacement,
  viewportWidth: number,
  viewportHeight: number
): TooltipPosition {
  const mainAxisSize = preferred === 'top' || preferred === 'bottom' ? tooltipSize.height : tooltipSize.width;
  const placement = pickPlacement(preferred, rect, mainAxisSize, viewportWidth, viewportHeight);

  let top: number;
  let left: number;

  if (placement === 'bottom' || placement === 'top') {
    left = rect.left + rect.width / 2 - tooltipSize.width / 2;
    left = clamp(left, VIEWPORT_MARGIN, viewportWidth - tooltipSize.width - VIEWPORT_MARGIN);
    top = placement === 'bottom' ? rect.top + rect.height + GAP : rect.top - GAP - tooltipSize.height;
  } else {
    top = rect.top + rect.height / 2 - tooltipSize.height / 2;
    top = clamp(top, VIEWPORT_MARGIN, viewportHeight - tooltipSize.height - VIEWPORT_MARGIN);
    left = placement === 'right' ? rect.left + rect.width + GAP : rect.left - GAP - tooltipSize.width;
  }

  top = clamp(top, VIEWPORT_MARGIN, Math.max(VIEWPORT_MARGIN, viewportHeight - tooltipSize.height - VIEWPORT_MARGIN));
  left = clamp(left, VIEWPORT_MARGIN, Math.max(VIEWPORT_MARGIN, viewportWidth - tooltipSize.width - VIEWPORT_MARGIN));

  const targetCenterX = rect.left + rect.width / 2;
  const targetCenterY = rect.top + rect.height / 2;
  const arrowOffset =
    placement === 'top' || placement === 'bottom'
      ? clamp(targetCenterX - left, ARROW_CLEARANCE, tooltipSize.width - ARROW_CLEARANCE)
      : clamp(targetCenterY - top, ARROW_CLEARANCE, tooltipSize.height - ARROW_CLEARANCE);

  return { top, left, placement, arrowOffset };
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}
