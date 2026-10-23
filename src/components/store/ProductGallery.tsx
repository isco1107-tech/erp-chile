'use client';

import { useEffect, useRef, useState } from 'react';
import { Expand, X } from 'lucide-react';
import { cx } from '@/components/web-sites/site/parts';
import { ProductImage } from './ui';

/** Galería de la ficha: foto principal y miniaturas (solo si hay más de una). */
export default function ProductGallery({ images, title }: { images: Array<{ url: string; alt: string }>; title: string }) {
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const zoomTrigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!zoom) return;
    const element = dialog.current;
    const opener = zoomTrigger.current;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    element?.showModal();
    return () => {
      element?.close();
      document.body.style.overflow = previous;
      opener?.focus();
    };
  }, [zoom]);
  const current = images[Math.min(index, Math.max(0, images.length - 1))];
  return (
    <div className="min-w-0">
      <div className="ws-card relative overflow-hidden !rounded-2xl">
        <ProductImage src={current?.url ?? null} alt={current?.alt || title} eager className="aspect-square w-full object-cover" />
        {current && (
          <button
            type="button"
            className="ws-cbtn absolute right-3 bottom-3 !bg-[color:var(--s-bg)]"
            ref={zoomTrigger}
            aria-label="Ampliar foto del producto"
            onClick={() => setZoom(true)}
          >
            <Expand className="size-4" />
          </button>
        )}
      </div>
      {zoom && current && (
        <dialog
          ref={dialog}
          onCancel={() => setZoom(false)}
          className="fixed inset-0 m-auto max-h-[90dvh] w-[min(900px,92vw)] max-w-[92vw] rounded-2xl border-0 bg-[color:var(--s-bg)] p-5 text-[color:var(--s-fg)] backdrop:bg-black/60"
          aria-label={`Foto ampliada de ${title}`}
        >
          <button type="button" className="ws-cbtn ml-auto" aria-label="Cerrar foto ampliada" onClick={() => setZoom(false)}>
            <X className="size-5" />
          </button>
          <ProductImage src={current.url} alt={current.alt || title} className="max-h-[72dvh] w-full object-contain" />
        </dialog>
      )}
      {images.length > 1 && (
        <ul className="mt-3 grid grid-cols-5 gap-2" aria-label="Fotos del producto">
          {images.map((image, i) => (
            <li key={`${image.url}-${i}`}>
              <button
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Ver foto ${i + 1} de ${images.length}`}
                aria-current={i === index ? 'true' : undefined}
                className={cx(
                  'ws-card block w-full cursor-pointer overflow-hidden !p-0',
                  i === index && '[border-color:var(--s-mark)] ring-2 ring-[color:var(--s-mark)]',
                )}
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
