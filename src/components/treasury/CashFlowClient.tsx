'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getCashFlowAction } from '@/modules/treasury/actions/treasury.actions';
import { PAYMENT_METHOD_TYPE_LABELS } from '@/modules/treasury/schema';
import type { CashFlowResult } from '@/modules/treasury/services/treasury.service';
import { formatCurrency } from '@/lib/chile/tax';

const INCOME_COLOR = '#2563eb';
const EXPENSE_COLOR = '#d97706';

type RangePreset = 'this-month' | 'last-month' | 'this-year';

const RANGE_LABELS: Record<RangePreset, string> = {
  'this-month': 'Este Mes',
  'last-month': 'Mes Pasado',
  'this-year': 'Este Año',
};

function computeRange(preset: RangePreset): { start: Date; end: Date } {
  const now = new Date();
  if (preset === 'this-month') {
    return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59) };
  }
  if (preset === 'last-month') {
    return { start: new Date(now.getFullYear(), now.getMonth() - 1, 1), end: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59) };
  }
  return { start: new Date(now.getFullYear(), 0, 1), end: new Date(now.getFullYear(), 11, 31, 23, 59, 59) };
}

function toCsv(result: CashFlowResult): string {
  const header = ['Fecha', 'Tipo', 'Monto', 'Medio de Pago', 'Contacto', 'N° Comprobante', 'Banco/Cuenta', 'Notas'];
  const rows = result.movements.map((m) => [
    new Date(m.paymentDate).toLocaleDateString('es-CL'),
    m.type === 'INCOME' ? 'Ingreso' : 'Egreso',
    String(m.amount),
    PAYMENT_METHOD_TYPE_LABELS[m.paymentMethod],
    `${m.contact.rut} - ${m.contact.razonSocial}`,
    m.referenceNumber ?? '',
    m.bankAccount ?? '',
    (m.notes ?? '').replace(/[\r\n,]/g, ' '),
  ]);
  return [header, ...rows].map((r) => r.join(',')).join('\n');
}

export default function CashFlowClient() {
  const [preset, setPreset] = useState<RangePreset>('this-month');
  const [result, setResult] = useState<CashFlowResult | null>(null);
  const [loading, setLoading] = useState(true);

  const range = useMemo(() => computeRange(preset), [preset]);

  useEffect(() => {
    setLoading(true);
    getCashFlowAction(range.start.toISOString(), range.end.toISOString()).then((res) => {
      if (res.success) setResult(res.data);
      else toast.error(res.error);
      setLoading(false);
    });
  }, [range]);

  function handleExportCsv() {
    if (!result || result.movements.length === 0) {
      toast.error('No hay movimientos para exportar');
      return;
    }
    const csv = toCsv(result);
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `flujo-caja-${preset}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {(Object.keys(RANGE_LABELS) as RangePreset[]).map((key) => (
            <Button key={key} type="button" size="sm" variant={preset === key ? 'default' : 'outline'} onClick={() => setPreset(key)}>
              {RANGE_LABELS[key]}
            </Button>
          ))}
        </div>
        <Button type="button" variant="outline" onClick={handleExportCsv}>Exportar CSV</Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Ingresos del Período</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold" style={{ color: INCOME_COLOR }}>{formatCurrency(result?.totalIncome ?? 0)}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Egresos del Período</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold" style={{ color: EXPENSE_COLOR }}>{formatCurrency(result?.totalExpense ?? 0)}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Saldo Neto de Caja</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{formatCurrency(result?.netAmount ?? 0)}</CardContent>
        </Card>
      </div>

      {!loading && result && result.byPaymentMethod.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Consolidado por Medio de Pago</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] table-auto text-sm">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="p-2 font-medium">Medio de Pago</th>
                    <th className="p-2 font-medium">Ingresos</th>
                    <th className="p-2 font-medium">Egresos</th>
                    <th className="p-2 font-medium">Neto</th>
                  </tr>
                </thead>
                <tbody>
                  {result.byPaymentMethod.map((row) => (
                    <tr key={row.method} className="border-t border-border">
                      <td className="p-2">{PAYMENT_METHOD_TYPE_LABELS[row.method]}</td>
                      <td className="p-2" style={{ color: INCOME_COLOR }}>{formatCurrency(row.income)}</td>
                      <td className="p-2" style={{ color: EXPENSE_COLOR }}>{formatCurrency(row.expense)}</td>
                      <td className="p-2 font-medium">{formatCurrency(row.net)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Ingresos vs Egresos</CardTitle></CardHeader>
        <CardContent>
          {loading && <p className="p-4 text-center text-sm text-muted-foreground">Cargando...</p>}
          {!loading && (!result || result.series.length === 0) && (
            <p className="p-4 text-center text-sm text-muted-foreground">Sin movimientos en el período seleccionado</p>
          )}
          {!loading && result && result.series.length > 0 && (
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={result.series} barGap={2}>
                  <CartesianGrid vertical={false} stroke="currentColor" className="text-border" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(value: string) => new Date(value).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit' })}
                    tick={{ fontSize: 12 }}
                    stroke="currentColor"
                    className="text-muted-foreground"
                  />
                  <YAxis
                    tickFormatter={(value: number) => formatCurrency(value)}
                    tick={{ fontSize: 12 }}
                    width={90}
                    stroke="currentColor"
                    className="text-muted-foreground"
                  />
                  <Tooltip
                    formatter={(value, name) => [formatCurrency(Number(value ?? 0)), name === 'income' ? 'Ingresos' : 'Egresos']}
                    labelFormatter={(label) => new Date(String(label)).toLocaleDateString('es-CL')}
                  />
                  <Legend formatter={(value) => (value === 'income' ? 'Ingresos' : 'Egresos')} />
                  <Bar dataKey="income" name="income" fill={INCOME_COLOR} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expense" name="expense" fill={EXPENSE_COLOR} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[820px] table-auto text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="p-2 font-medium">Fecha</th>
              <th className="p-2 font-medium">Tipo</th>
              <th className="p-2 font-medium">Contacto</th>
              <th className="p-2 font-medium">Medio de Pago</th>
              <th className="p-2 font-medium">Monto</th>
              <th className="p-2 font-medium">N° Comprobante</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td className="p-4 text-center text-muted-foreground" colSpan={6}>Cargando...</td></tr>
            )}
            {!loading && result?.movements.length === 0 && (
              <tr><td className="p-4 text-center text-muted-foreground" colSpan={6}>Sin movimientos en el período seleccionado</td></tr>
            )}
            {!loading && result?.movements.map((m) => (
              <tr key={m.id} className="border-t border-border">
                <td className="p-2">{new Date(m.paymentDate).toLocaleDateString('es-CL')}</td>
                <td className="p-2">
                  <span
                    className="rounded-full px-2 py-0.5 text-xs font-medium"
                    style={{ color: m.type === 'INCOME' ? INCOME_COLOR : EXPENSE_COLOR, backgroundColor: m.type === 'INCOME' ? `${INCOME_COLOR}1a` : `${EXPENSE_COLOR}1a` }}
                  >
                    {m.type === 'INCOME' ? 'Ingreso' : 'Egreso'}
                  </span>
                </td>
                <td className="p-2">{m.contact.rut} — {m.contact.razonSocial}</td>
                <td className="p-2">{PAYMENT_METHOD_TYPE_LABELS[m.paymentMethod]}</td>
                <td className="p-2 font-medium">{formatCurrency(m.amount)}</td>
                <td className="p-2">{m.referenceNumber ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
