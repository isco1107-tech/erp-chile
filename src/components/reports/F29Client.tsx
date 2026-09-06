'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { FileText, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { InfoTooltip } from '@/components/ui/InfoTooltip';
import { TAX_GLOSSARY } from '@/lib/chile/glossary';
import { formatCurrency } from '@/lib/chile/tax';
import { getF29Action } from '@/modules/reports/actions/reports.actions';
import type { F29Result } from '@/lib/chile/f29';

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const MONTH_ITEMS = Object.fromEntries(MONTHS.map((label, index) => [String(index + 1), label]));

interface Row {
  label: string;
  value: number;
  glossary?: string;
  emphasis?: boolean;
}

export default function F29Client() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [result, setResult] = useState<F29Result | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    getF29Action(year, month)
      .then((res) => {
        if (!res.success) {
          toast.error(res.error);
          setResult(null);
          return;
        }
        setResult(res.data);
      })
      .finally(() => setLoading(false));
  }, [year, month]);

  const rows: Row[] = result
    ? [
        { label: 'Ventas netas del período', value: result.netSales },
        { label: 'Débito fiscal (IVA de tus ventas)', value: result.debitVat, glossary: TAX_GLOSSARY.debitoFiscal },
        { label: 'Crédito fiscal (IVA de tus compras)', value: result.creditVat, glossary: TAX_GLOSSARY.creditoFiscal },
        { label: 'Remanente del mes anterior', value: result.previousRemanent, glossary: TAX_GLOSSARY.remanente },
        { label: 'Remanente para el próximo mes', value: result.remanentCredit, glossary: TAX_GLOSSARY.remanente },
        { label: 'PPM (Pago Provisional Mensual)', value: result.ppmAmount, glossary: TAX_GLOSSARY.ppm },
        { label: 'Impuesto determinado (IVA + PPM a pagar)', value: result.determinedTax, emphasis: true },
        { label: 'Retención de honorarios del período', value: result.honorariumRetentionAmount, glossary: TAX_GLOSSARY.retencionHonorarios, emphasis: true },
      ]
    : [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="size-5" /> Formulario 29 (F29)
            <InfoTooltip text={TAX_GLOSSARY.f29} />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="text-sm text-muted-foreground">
            Estimación calculada con tus documentos ya emitidos y recibidos en el sistema — no es un número inventado, pero
            la declaración formal ante el SII la presenta tu contador con su propio sistema.
          </p>

          <div className="grid gap-4 sm:grid-cols-[1fr_1fr] sm:items-end sm:max-w-md">
            <div className="space-y-2">
              <Label htmlFor="f29-month">Mes</Label>
              <Select items={MONTH_ITEMS} value={String(month)} onValueChange={(value) => setMonth(Number(value))}>
                <SelectTrigger id="f29-month">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((label, index) => (
                    <SelectItem key={label} value={String(index + 1)}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="f29-year">Año</Label>
              <Input
                id="f29-year"
                type="number"
                min={2000}
                max={2100}
                value={year}
                onChange={(e) => setYear(Number(e.target.value) || now.getFullYear())}
              />
            </div>
          </div>

          {loading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Calculando…
            </p>
          ) : result ? (
            <div className="divide-y divide-border rounded-xl border border-border">
              {rows.map((row) => (
                <div key={row.label} className="flex items-center justify-between px-4 py-3">
                  <span className={row.emphasis ? 'text-sm font-semibold text-foreground' : 'text-sm text-muted-foreground'}>
                    {row.label}
                    {row.glossary && <InfoTooltip text={row.glossary} />}
                  </span>
                  <span className={row.emphasis ? 'text-base font-semibold text-foreground' : 'text-sm text-foreground'}>
                    {formatCurrency(row.value)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No se pudo calcular el período seleccionado.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
