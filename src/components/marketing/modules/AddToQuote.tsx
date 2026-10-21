'use client';

import { ArrowUpRight, Check, Plus } from 'lucide-react';
import { openQuoteDialog, useQuoteCart } from './quote-cart';
import s from './modules.module.css';

/** Botones de la cabecera de un módulo: sumarlo a la cotización y abrir el formulario. */
export default function AddToQuote({ id }: { id: string }) {
  const { ids, toggle } = useQuoteCart();
  const selected = ids.includes(id);

  return (
    <>
      <button type="button" className={s.addButton} aria-pressed={selected} onClick={() => toggle(id)}>
        {selected ? <Check size={18} aria-hidden="true" /> : <Plus size={18} aria-hidden="true" />}
        {selected ? 'En tu cotización' : 'Agregar a la cotización'}
      </button>
      <button
        type="button"
        className={s.primary}
        onClick={() => {
          if (!selected) toggle(id);
          openQuoteDialog();
        }}
      >
        Cotizar ahora <ArrowUpRight size={16} aria-hidden="true" />
      </button>
    </>
  );
}
