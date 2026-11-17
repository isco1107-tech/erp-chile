'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Scale } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { nativeSelectClass } from '@/components/ui/field-classes';
import { updateScaleLabelFormatAction } from '@/modules/pos/actions/scale-label.actions';
import {
  buildScaleLabel,
  DEFAULT_SCALE_LABEL_FORMAT,
  describeScaleLabel,
  parseScaleLabel,
  scaleProblemMessage,
  scaleValueLength,
  SCALE_CODE_LENGTHS,
  SCALE_LABEL_MODES,
  SCALE_LABEL_MODE_LABELS,
  SCALE_PREFIXES,
  type ScaleCodeLength,
  type ScaleLabelFormat,
  type ScaleLabelMode,
  type ScalePrefix,
} from '@/lib/pos/scale-label';

interface Props {
  initial: ScaleLabelFormat | null;
}

/**
 * Configuración → Perfil de Empresa → Etiquetas de balanza. Le dice a todas
 * las cajas cómo imprime la balanza sus etiquetas EAN-13 de peso o precio
 * variable (prefijos 20–29). El PLU de cada producto se escribe en su ficha.
 */
export default function ScaleLabelForm({ initial }: Props) {
  const [enabled, setEnabled] = useState(initial !== null);
  const [format, setFormat] = useState<ScaleLabelFormat>(initial ?? DEFAULT_SCALE_LABEL_FORMAT);
  const [saving, setSaving] = useState(false);
  const [sample, setSample] = useState('');

  const usedPrefixes = new Set(format.rules.map((rule) => rule.prefix));
  const nextFreePrefix = SCALE_PREFIXES.find((prefix) => !usedPrefixes.has(prefix));

  const example = useMemo(() => {
    const rule = format.rules[0];
    if (!rule) return null;
    const value = rule.mode === 'WEIGHT' ? 512 : 1495;
    const label = buildScaleLabel(rule.prefix, '123', value, format.codeLength);
    return { label, value: rule.mode === 'WEIGHT' ? '0,512 kg' : '$1.495' };
  }, [format]);

  const sampleResult = useMemo(() => {
    const text = sample.trim();
    if (!text) return null;
    const parsed = parseScaleLabel(text, format);
    if (!parsed) return { ok: false, text: 'No es una etiqueta de balanza con este formato (13 dígitos y uno de los prefijos de la lista).' };
    if (!parsed.ok) return { ok: false, text: scaleProblemMessage(parsed) };
    return { ok: true, text: `PLU ${parsed.code} · ${describeScaleLabel(parsed)}` };
  }, [sample, format]);

  function setRule(index: number, patch: Partial<{ prefix: ScalePrefix; mode: ScaleLabelMode }>) {
    setFormat((current) => ({ ...current, rules: current.rules.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)) }));
  }

  function addRule() {
    if (!nextFreePrefix) return;
    setFormat((current) => ({ ...current, rules: [...current.rules, { prefix: nextFreePrefix, mode: 'WEIGHT' }] }));
  }

  function removeRule(index: number) {
    setFormat((current) => ({ ...current, rules: current.rules.filter((_, i) => i !== index) }));
  }

  async function save() {
    setSaving(true);
    try {
      const result = await updateScaleLabelFormatAction(enabled ? { enabled: true, format } : { enabled: false });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-4" aria-labelledby="scale-label-title">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <Scale className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="min-w-0">
            <h2 id="scale-label-title" className="text-sm font-semibold">Etiquetas de balanza (productos a granel)</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              La caja lee la etiqueta que imprime la balanza de la fiambrería, carnicería o verdulería (código que empieza con 20 a 29) y agrega el producto con su peso. Indica aquí cómo está programada tu balanza y escribe el PLU de cada producto en su ficha del catálogo.
            </p>
          </div>
        </div>
        <Switch checked={enabled} onCheckedChange={setEnabled} disabled={saving} label="Leer etiquetas de balanza en la caja" />
      </div>

      {enabled && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="scale-code-length">Dígitos del PLU en la etiqueta</Label>
              <select
                id="scale-code-length"
                className={nativeSelectClass}
                value={format.codeLength}
                onChange={(event) => setFormat((current) => ({ ...current, codeLength: Number(event.target.value) as ScaleCodeLength }))}
              >
                {SCALE_CODE_LENGTHS.map((length) => (
                  <option key={length} value={length}>
                    {length} dígitos de PLU y {scaleValueLength(length)} de peso o precio
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Prefijos que imprime la balanza</p>
            {format.rules.map((rule, index) => (
              <div key={`${rule.prefix}-${index}`} className="grid grid-cols-1 gap-2 sm:grid-cols-[8rem_minmax(0,1fr)_auto] sm:items-end">
                <div>
                  <Label htmlFor={`scale-prefix-${index}`}>Prefijo</Label>
                  <select
                    id={`scale-prefix-${index}`}
                    className={nativeSelectClass}
                    value={rule.prefix}
                    onChange={(event) => setRule(index, { prefix: event.target.value as ScalePrefix })}
                  >
                    {SCALE_PREFIXES.filter((prefix) => prefix === rule.prefix || !usedPrefixes.has(prefix)).map((prefix) => (
                      <option key={prefix} value={prefix}>{prefix}</option>
                    ))}
                  </select>
                </div>
                <div className="min-w-0">
                  <Label htmlFor={`scale-mode-${index}`}>Qué trae la etiqueta</Label>
                  <select
                    id={`scale-mode-${index}`}
                    className={nativeSelectClass}
                    value={rule.mode}
                    onChange={(event) => setRule(index, { mode: event.target.value as ScaleLabelMode })}
                  >
                    {SCALE_LABEL_MODES.map((mode) => (
                      <option key={mode} value={mode}>{SCALE_LABEL_MODE_LABELS[mode]}</option>
                    ))}
                  </select>
                </div>
                <Button type="button" variant="outline" size="sm" disabled={format.rules.length <= 1} onClick={() => removeRule(index)}>
                  Quitar
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" disabled={!nextFreePrefix} onClick={addRule}>
              + Agregar prefijo
            </Button>
          </div>

          {example && (
            <p className="break-words text-xs text-muted-foreground">
              Ejemplo: <span className="font-mono text-foreground">{example.label}</span> = producto con PLU 123 y {example.value}.
            </p>
          )}
          {format.rules.some((rule) => rule.mode === 'PRICE') && (
            <p className="rounded-md border border-warning/30 bg-warning-soft p-3 text-xs text-warning">
              Con etiquetas de precio, la caja calcula el peso con el precio del catálogo y lo redondea al gramo: el total puede diferir en unos pesos de lo impreso. Si tu balanza puede imprimir el peso, prefiérelo. En ambos casos, mantén en la balanza los mismos precios del catálogo.
            </p>
          )}

          <div className="max-w-md">
            <Label htmlFor="scale-sample">Probar una etiqueta</Label>
            <Input
              id="scale-sample"
              value={sample}
              onChange={(event) => setSample(event.target.value)}
              placeholder="Escanea o escribe una etiqueta impresa por tu balanza"
              inputMode="numeric"
              autoComplete="off"
            />
            {sampleResult && (
              <p className={`mt-1 text-xs ${sampleResult.ok ? 'text-success' : 'text-destructive'}`} role="status">
                {sampleResult.text}
              </p>
            )}
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <Button type="button" onClick={save} disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar etiquetas de balanza'}
        </Button>
      </div>
    </section>
  );
}
