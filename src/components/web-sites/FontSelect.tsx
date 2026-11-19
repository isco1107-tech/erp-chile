'use client';

import { useId } from 'react';
import { nativeSelectClass } from '@/components/ui/field-classes';
import { Label } from '@/components/ui/label';
import { FONT_OPTIONS, FONT_STACKS, fontOverrideSchema, type SiteFont } from '@/lib/web-sites/theme';

interface Props {
  value?: SiteFont;
  disabled: boolean;
  onChange: (font: SiteFont | undefined) => void;
}

export function FontSelect({ value, disabled, onChange }: Props) {
  const id = useId();

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>Tipografía</Label>
      <select
        id={id}
        className={nativeSelectClass}
        value={value ?? ''}
        disabled={disabled}
        onChange={(event) => onChange(fontOverrideSchema.parse(event.currentTarget.value))}
      >
        <option value="">Predeterminada del sitio</option>
        {FONT_OPTIONS.map((font) => <option key={font} value={font}>{FONT_STACKS[font].label}</option>)}
      </select>
    </div>
  );
}
