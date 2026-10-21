import { renderGala } from './gala';
import { renderEditorial } from './editorial';
import { renderImpacto } from './impacto';
import type { PosterRenderInput } from './primitives';

export type { PosterImages, PosterRenderInput, PosterTypeKit } from './primitives';

/** Dibuja el afiche (elemento para `ImageResponse`) en el estilo pedido. */
export function renderPoster(input: PosterRenderInput) {
  switch (input.style) {
    case 'gala':
      return renderGala(input);
    case 'editorial':
      return renderEditorial(input);
    case 'impacto':
      return renderImpacto(input);
  }
}
