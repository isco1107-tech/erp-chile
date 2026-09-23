'use client';

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { nativeSelectClass } from '@/components/ui/field-classes';
import { AFP_INSTITUTIONS, AFP_LABELS, type AfpInstitutionKey } from '@/lib/chile/payroll';

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export interface PeriodParamsValues {
  year: number;
  month: number;
  ufValue: number;
  utmValue: number;
  minimumWage: number;
  taxableCapUf: number;
  unemploymentCapUf: number;
  sisRateBps: number;
  mutualRateBps: number;
  employerPensionRateBps: number;
  afpCommissionBps: Record<AfpInstitutionKey, number>;
}

const toText = (value: number, decimals = 2) => (value ? value.toLocaleString('es-CL', { maximumFractionDigits: decimals, useGrouping: false }) : '');
/**
 * Acepta "39.850,12" y "39850,12" (formato chileno) y también "39850.12":
 * un punto seguido de 1-2 decimales y sin coma se lee como decimal, no como
 * separador de miles.
 */
const parseNumber = (text: string) => {
  const trimmed = text.trim();
  const normalized = trimmed.includes(',')
    ? trimmed.replace(/\./g, '').replace(',', '.')
    : /^\d+\.\d{1,2}$/.test(trimmed)
      ? trimmed
      : trimmed.replace(/\./g, '');
  const value = Number(normalized);
  return Number.isFinite(value) ? value : 0;
};
/** Porcentaje escrito por el usuario ("1,27") → basis points (127). */
const pctToBps = (text: string) => Math.round(parseNumber(text) * 100);
const bpsToPct = (bps: number) => (bps / 100).toLocaleString('es-CL', { maximumFractionDigits: 2, useGrouping: false });

/**
 * Parámetros previsionales del mes. Se editan como texto (con coma decimal,
 * como se leen en Previred) y se convierten recién al entregarlos.
 */
export function PeriodParamsForm({
  initial,
  editablePeriod,
  onChange,
}: {
  initial: PeriodParamsValues;
  editablePeriod: boolean;
  onChange: (values: PeriodParamsValues) => void;
}) {
  const [text, setText] = useState(() => ({
    uf: toText(initial.ufValue),
    utm: toText(initial.utmValue, 0),
    imm: toText(initial.minimumWage, 0),
    taxableCap: toText(initial.taxableCapUf, 1),
    unemploymentCap: toText(initial.unemploymentCapUf, 1),
    sis: bpsToPct(initial.sisRateBps),
    mutual: bpsToPct(initial.mutualRateBps),
    employerPension: bpsToPct(initial.employerPensionRateBps),
    afp: Object.fromEntries(AFP_INSTITUTIONS.map((afp) => [afp, bpsToPct(initial.afpCommissionBps[afp])])) as Record<AfpInstitutionKey, string>,
  }));
  const [period, setPeriod] = useState({ year: initial.year, month: initial.month });

  function emit(nextText: typeof text, nextPeriod = period) {
    onChange({
      year: nextPeriod.year,
      month: nextPeriod.month,
      ufValue: parseNumber(nextText.uf),
      utmValue: Math.round(parseNumber(nextText.utm)),
      minimumWage: Math.round(parseNumber(nextText.imm)),
      taxableCapUf: parseNumber(nextText.taxableCap),
      unemploymentCapUf: parseNumber(nextText.unemploymentCap),
      sisRateBps: pctToBps(nextText.sis),
      mutualRateBps: pctToBps(nextText.mutual),
      employerPensionRateBps: pctToBps(nextText.employerPension),
      afpCommissionBps: Object.fromEntries(AFP_INSTITUTIONS.map((afp) => [afp, pctToBps(nextText.afp[afp])])) as Record<AfpInstitutionKey, number>,
    });
  }

  function setField(key: Exclude<keyof typeof text, 'afp'>, value: string) {
    const next = { ...text, [key]: value };
    setText(next);
    emit(next);
  }

  function setAfp(afp: AfpInstitutionKey, value: string) {
    const next = { ...text, afp: { ...text.afp, [afp]: value } };
    setText(next);
    emit(next);
  }

  const field = (id: string, label: string, key: Exclude<keyof typeof text, 'afp'>, suffix?: string, placeholder?: string) => (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input id={id} inputMode="decimal" value={text[key]} onChange={(e) => setField(key, e.target.value)} placeholder={placeholder} className={suffix ? 'pr-10' : undefined} />
        {suffix && <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-muted-foreground">{suffix}</span>}
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      <p className="flex gap-2 rounded-md bg-warning-soft p-3 text-xs text-warning">
        <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
        Confirma estos valores en los indicadores previsionales de previred.com antes de calcular. Vienen precargados del último período o son de referencia, y cambian mes a mes o cada año.
      </p>

      {editablePeriod && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="period-month">Mes</Label>
            <select
              id="period-month"
              className={nativeSelectClass}
              value={period.month}
              onChange={(e) => {
                const next = { ...period, month: Number(e.target.value) };
                setPeriod(next);
                emit(text, next);
              }}
            >
              {MONTHS.map((name, index) => (
                <option key={name} value={index + 1}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="period-year">Año</Label>
            <Input
              id="period-year"
              type="number"
              value={period.year}
              onChange={(e) => {
                const next = { ...period, year: Number(e.target.value) };
                setPeriod(next);
                emit(text, next);
              }}
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {field('param-uf', 'UF del último día del mes', 'uf', '$', 'Ej.: 39850,12')}
        {field('param-utm', 'UTM del mes', 'utm', '$', 'Ej.: 69542')}
        {field('param-imm', 'Ingreso mínimo mensual', 'imm', '$')}
        {field('param-cap', 'Tope imponible AFP/salud', 'taxableCap', 'UF')}
        {field('param-ucap', 'Tope seguro de cesantía', 'unemploymentCap', 'UF')}
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Aportes del empleador</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {field('param-sis', 'SIS', 'sis', '%')}
          {field('param-mutual', 'Mutual (básica + adicional)', 'mutual', '%')}
          {field('param-employer', 'Aporte empleador Ley 21.735', 'employerPension', '%')}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Comisión de cada AFP (sobre el 10% obligatorio)</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {AFP_INSTITUTIONS.map((afp) => (
            <div key={afp}>
              <Label htmlFor={`afp-${afp}`}>{AFP_LABELS[afp]}</Label>
              <div className="relative">
                <Input id={`afp-${afp}`} inputMode="decimal" value={text.afp[afp]} onChange={(e) => setAfp(afp, e.target.value)} className="pr-8" />
                <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-muted-foreground">%</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
