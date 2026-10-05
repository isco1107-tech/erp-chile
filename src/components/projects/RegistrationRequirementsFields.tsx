'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface RequirementsValue {
  minCandidateAge: number;
  requireChileanNationality: boolean;
  requireCandidateInstagram: boolean;
  requireCandidatePhoto: boolean;
}

/**
 * Casillas de "qué se le pide a la postulante" (edad mínima, ser chilena,
 * Instagram, foto). Las usan el formulario de creación/edición del certamen y
 * la configuración de la convocatoria: lo marcado acá es lo que exige el
 * formulario público de inscripción y lo que se publica como requisitos.
 */
export default function RegistrationRequirementsFields({
  value,
  onChange,
  error,
  idPrefix = 'req',
}: {
  value: RequirementsValue;
  onChange: (next: RequirementsValue) => void;
  error?: string;
  idPrefix?: string;
}) {
  const checkbox = (key: 'requireChileanNationality' | 'requireCandidateInstagram' | 'requireCandidatePhoto', label: string, hint: string) => (
    <label htmlFor={`${idPrefix}-${key}`} className="flex cursor-pointer items-start gap-2.5 text-sm">
      <input
        id={`${idPrefix}-${key}`}
        type="checkbox"
        className="mt-0.5 size-4 shrink-0 accent-primary"
        checked={value[key]}
        onChange={(e) => onChange({ ...value, [key]: e.target.checked })}
      />
      <span>
        <span className="font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
    </label>
  );

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium">Requisitos de inscripción</legend>
      <p className="text-xs text-muted-foreground">Lo que marques se exige en el formulario público y se muestra a las postulantes como requisito.</p>
      <div className="max-w-40">
        <Label htmlFor={`${idPrefix}-minAge`}>Edad mínima (años)</Label>
        <Input
          id={`${idPrefix}-minAge`}
          type="number"
          min={1}
          max={99}
          value={value.minCandidateAge}
          onChange={(e) => onChange({ ...value, minCandidateAge: Number(e.target.value) })}
          aria-invalid={!!error}
        />
        {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
      </div>
      {checkbox('requireChileanNationality', 'Ser chilena', 'La postulante debe declararlo con una casilla al inscribirse.')}
      {checkbox('requireCandidateInstagram', 'Instagram de la candidata', 'Debe escribir su usuario de Instagram.')}
      {checkbox('requireCandidatePhoto', 'Foto de la candidata', 'Debe subir una foto suya en el formulario (JPG, PNG o WEBP, hasta 5 MB).')}
    </fieldset>
  );
}
