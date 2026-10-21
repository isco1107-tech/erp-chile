'use client';

import { useState, type CSSProperties } from 'react';
import { MoveHorizontal } from 'lucide-react';
import { cx, Img } from './parts';

/**
 * Comparador "antes y después": la foto de después se recorta sobre la de
 * antes y se desliza con un control de rango real (teclado, lector de
 * pantalla y dedo). Sin JavaScript queda en la mitad, que ya muestra ambas.
 */
export default function BeforeAfter({ before, after, alt, beforeLabel, afterLabel, className }: { before: string; after: string; alt: string; beforeLabel: string; afterLabel: string; className?: string }) {
  const [position, setPosition] = useState(50);
  return (
    <div className={cx('ws-ba select-none', className)} style={{ '--ws-ba': `${position}%` } as CSSProperties}>
      <Img src={before} alt={alt ? `${beforeLabel}: ${alt}` : beforeLabel} className="block h-full w-full object-cover" />
      <div className="ws-ba-after">
        <Img src={after} alt={alt ? `${afterLabel}: ${alt}` : afterLabel} className="block h-full w-full object-cover" />
      </div>
      <span className="ws-ba-tag left-3">{beforeLabel}</span>
      <span className="ws-ba-tag right-3">{afterLabel}</span>
      <span className="ws-ba-handle">
        <span className="ws-ba-knob">
          <MoveHorizontal className="size-5" aria-hidden="true" />
        </span>
      </span>
      <input
        type="range"
        min={0}
        max={100}
        value={position}
        onChange={(event) => setPosition(Number(event.target.value))}
        onClick={(event) => event.stopPropagation()}
        className="ws-ba-range"
        aria-label={`Desliza para comparar ${beforeLabel.toLowerCase()} y ${afterLabel.toLowerCase()}`}
        aria-valuetext={`${position} %`}
      />
    </div>
  );
}
