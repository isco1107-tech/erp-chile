'use client';

import { nativeSelectClass } from '@/components/ui/field-classes';
import { SPONSORSHIP_TIER_LABELS, SPONSORSHIP_TIERS } from '@/modules/sponsorships/schema';
import { cn } from '@/lib/utils';

export interface CategoryOption {
  id: string;
  name: string;
}

/**
 * Selector de la categoría de un auspicio: las fijas (valen para todos los
 * certámenes) y, aparte, las que ese certamen agregó por su cuenta. El valor es
 * el que producen `encodeCategoryChoice` / `decodeCategoryChoice` (`tier:GOLD`
 * o `cat:<id>`), así el formulario guarda una sola cosa.
 */
export function SponsorshipCategorySelect({
  id,
  value,
  onChange,
  categories,
  disabled,
  className,
  placeholder,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  /** Categorías propias del certamen elegido (ya filtradas). */
  categories: CategoryOption[];
  disabled?: boolean;
  className?: string;
  /** Si se pasa, agrega una primera opción vacía (para campos opcionales). */
  placeholder?: string;
}) {
  return (
    <select id={id} className={cn(nativeSelectClass, className)} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      <optgroup label="Categorías fijas">
        {SPONSORSHIP_TIERS.map((tier) => (
          <option key={tier} value={`tier:${tier}`}>
            {SPONSORSHIP_TIER_LABELS[tier]}
          </option>
        ))}
      </optgroup>
      {categories.length > 0 && (
        <optgroup label="Categorías de este certamen">
          {categories.map((category) => (
            <option key={category.id} value={`cat:${category.id}`}>
              {category.name}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}
