'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { ShowcaseCard } from '@/lib/marketing/module-showcase-content';
import ModuleCard from './ModuleCard';
import s from './modules.module.css';

/** Tarjetas visibles en «Todos» antes de desplegar el resto (dos filas en escritorio). */
const COLLAPSED_COUNT = 8;

/**
 * Grilla de la vitrina con filtro por área. En «Todos» muestra dos filas y un
 * botón para ver el resto, así la landing no se alarga; cada área muestra sus
 * módulos completos. Sin JavaScript se ven todos (ver `data-collapsed` en el CSS).
 */
export default function ModulesGrid({ cards, categories }: { cards: ShowcaseCard[]; categories: string[] }) {
  const [category, setCategory] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const shown = category ? cards.filter((card) => card.category === category) : cards;
  const collapsed = !category && !expanded && cards.length > COLLAPSED_COUNT;

  return (
    <div className={s.tokens}>
      <ul className={s.filters} aria-label="Filtrar módulos por área">
        <li>
          <button type="button" aria-pressed={category === null} onClick={() => setCategory(null)}>
            Todos <span>{cards.length}</span>
          </button>
        </li>
        {categories.map((name) => (
          <li key={name}>
            <button type="button" aria-pressed={category === name} onClick={() => setCategory(name)}>
              {name} <span>{cards.filter((card) => card.category === name).length}</span>
            </button>
          </li>
        ))}
      </ul>

      <ul id="modulos-grilla" className={s.grid} data-collapsed={collapsed || undefined}>
        {shown.map((card) => (
          <li key={card.slug}><ModuleCard card={card} /></li>
        ))}
      </ul>

      {collapsed && (
        <div className={s.more}>
          <button type="button" className={s.moreButton} aria-controls="modulos-grilla" aria-expanded={false} onClick={() => setExpanded(true)}>
            Ver los {cards.length} módulos <ChevronDown size={17} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
