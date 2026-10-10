'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight, Check, LayoutGrid, Plus } from 'lucide-react';
import type { ShowcaseCard } from '@/lib/marketing/module-showcase-content';
import { useQuoteCart } from './quote-cart';
import s from './modules.module.css';

/**
 * Recuadro de un módulo: la captura real y una descripción corta. Todo el
 * recuadro abre la página del módulo; la casilla de la esquina lo agrega o lo
 * quita de la cotización (no es parte del enlace: dos controles separados).
 */
export default function ModuleCard({ card, headingLevel = 3 }: { card: ShowcaseCard; headingLevel?: 2 | 3 }) {
  const { ids, toggle } = useQuoteCart();
  const selected = card.quoteId !== null && ids.includes(card.quoteId);
  const Heading = headingLevel === 2 ? 'h2' : 'h3';

  return (
    <article className={s.card} data-selected={selected || undefined}>
      <div className={s.cardMedia}>
        {card.cover ? (
          <div className={s.cardShot}>
            <Image src={card.cover} alt="" fill sizes="(max-width: 560px) 104px, (max-width: 1100px) 45vw, 340px" />
          </div>
        ) : (
          <span className={s.cardPlaceholder}><LayoutGrid size={30} strokeWidth={1.4} aria-hidden="true" /></span>
        )}
      </div>
      <div className={s.cardBody}>
        <p className={s.cardCategory}>{card.category}</p>
        <Heading className={s.cardTitle}>
          <Link className={s.cardLink} href={`/modulos/${card.slug}`}>{card.title}</Link>
        </Heading>
        <p className={s.cardSummary}>{card.summary}</p>
        <span className={s.cardMore} aria-hidden="true">Ver cómo funciona <ArrowUpRight size={15} /></span>
      </div>
      {card.quoteId ? (
        <label className={s.toggle} title={selected ? 'Quitar de la cotización' : 'Agregar a la cotización'}>
          <input
            type="checkbox"
            checked={selected}
            onChange={() => card.quoteId && toggle(card.quoteId)}
            aria-label={`Agregar ${card.title} a la cotización`}
          />
          {selected ? <Check size={20} strokeWidth={2.4} aria-hidden="true" /> : <Plus size={20} strokeWidth={2.2} aria-hidden="true" />}
        </label>
      ) : (
        <span className={s.included} title="Viene con la plataforma base, sin costo adicional">Incluido</span>
      )}
    </article>
  );
}
