'use client';

import { useState } from 'react';
import { cx } from '@/components/web-sites/site/parts';
import { ProductImage } from './ui';

/** Galería de la ficha: foto principal y miniaturas (solo si hay más de una). */
export default function ProductGallery({ images, title }: { images: Array<{ url: string; alt: string }>; title: string }) {
  const [index, setIndex] = useState(0);
  const current = images[Math.min(index, Math.max(0, images.length - 1))];
  return (
    <div className="min-w-0">
      <div className="ws-card overflow-hidden">
        <ProductImage src={current?.url ?? null} alt={current?.alt || title} eager className="aspect-square w-full object-cover" />
      </div>
      {images.length > 1 && (
        <ul className="mt-3 grid grid-cols-5 gap-2" aria-label="Fotos del producto">
          {images.map((image, i) => (
            <li key={`${image.url}-${i}`}>
              <button
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Ver foto ${i + 1} de ${images.length}`}
                aria-current={i === index ? 'true' : undefined}
                className={cx('ws-card block w-full cursor-pointer overflow-hidden !p-0', i === index && '[border-color:var(--s-mark)] ring-2 ring-[color:var(--s-mark)]')}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image.url} alt="" loading="lazy" decoding="async" className="aspect-square w-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
