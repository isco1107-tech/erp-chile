/**
 * Inspecciones de calidad. Puro (sin Prisma): decide si una inspección
 * aprueba o falla a partir de los parámetros de la plantilla y los valores
 * medidos. El servidor SIEMPRE lo recalcula; el resultado que diga el
 * cliente no se guarda.
 */

export type ParameterType = 'NUMBER' | 'CHECK';

export interface QualityParameter {
  key: string;
  name: string;
  type: ParameterType;
  unit?: string;
  /** Solo NUMBER: límites inclusivos; `null`/ausente = sin límite (solo se registra). */
  min?: number | null;
  max?: number | null;
  required: boolean;
}

/** Valor medido: número (NUMBER) o cumple/no cumple (CHECK). */
export type MeasuredValue = number | boolean | null | undefined;

export interface ParameterResult {
  key: string;
  name: string;
  value: number | boolean | null;
  ok: boolean;
  /** Por qué falló (texto para el equipo). */
  reason?: string;
}

export interface InspectionEvaluation {
  status: 'PASSED' | 'FAILED';
  results: ParameterResult[];
  failed: string[];
  /** Parámetros obligatorios sin valor: la inspección no se puede guardar así. */
  missing: string[];
}

function formatNumber(value: number): string {
  return value.toLocaleString('es-CL', { maximumFractionDigits: 3 });
}

export function evaluateInspection(parameters: QualityParameter[], values: Record<string, MeasuredValue>): InspectionEvaluation {
  const results: ParameterResult[] = [];
  const failed: string[] = [];
  const missing: string[] = [];

  for (const parameter of parameters) {
    const raw = values[parameter.key];
    const empty = raw === undefined || raw === null || (typeof raw === 'number' && !Number.isFinite(raw));
    if (empty) {
      if (parameter.required) missing.push(parameter.name);
      results.push({ key: parameter.key, name: parameter.name, value: null, ok: true });
      continue;
    }

    if (parameter.type === 'CHECK') {
      const ok = raw === true;
      results.push({ key: parameter.key, name: parameter.name, value: ok, ok, reason: ok ? undefined : 'No cumple' });
      if (!ok) failed.push(parameter.name);
      continue;
    }

    const value = typeof raw === 'number' ? raw : Number.NaN;
    if (Number.isNaN(value)) {
      missing.push(parameter.name);
      results.push({ key: parameter.key, name: parameter.name, value: null, ok: true });
      continue;
    }
    const unit = parameter.unit ? ` ${parameter.unit}` : '';
    let reason: string | undefined;
    if (parameter.min != null && value < parameter.min) reason = `${formatNumber(value)}${unit} está bajo el mínimo (${formatNumber(parameter.min)}${unit})`;
    else if (parameter.max != null && value > parameter.max) reason = `${formatNumber(value)}${unit} supera el máximo (${formatNumber(parameter.max)}${unit})`;
    results.push({ key: parameter.key, name: parameter.name, value, ok: reason === undefined, reason });
    if (reason) failed.push(parameter.name);
  }

  return { status: failed.length === 0 ? 'PASSED' : 'FAILED', results, failed, missing };
}

export interface ScorecardInput {
  contactId: string;
  status: 'PASSED' | 'FAILED';
  inspectedAt: Date;
}

export interface SupplierScore {
  contactId: string;
  total: number;
  passed: number;
  failed: number;
  /** % de lotes aprobados, entero. */
  passRate: number;
  lastInspectedAt: Date;
}

/** Desempeño de cada productor/proveedor según las inspecciones de recepción. */
export function supplierScorecard(rows: ScorecardInput[]): SupplierScore[] {
  const byContact = new Map<string, SupplierScore>();
  for (const row of rows) {
    const current = byContact.get(row.contactId) ?? { contactId: row.contactId, total: 0, passed: 0, failed: 0, passRate: 0, lastInspectedAt: row.inspectedAt };
    current.total += 1;
    if (row.status === 'PASSED') current.passed += 1;
    else current.failed += 1;
    if (row.inspectedAt > current.lastInspectedAt) current.lastInspectedAt = row.inspectedAt;
    byContact.set(row.contactId, current);
  }
  return [...byContact.values()]
    .map((s) => ({ ...s, passRate: Math.round((s.passed / s.total) * 100) }))
    .sort((a, b) => a.passRate - b.passRate || b.total - a.total);
}
