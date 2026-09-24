'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { nativeSelectClass } from '@/components/ui/field-classes';
import { getCashFlowAction } from '@/modules/treasury/actions/treasury.actions';
import { PAYMENT_METHOD_TYPE_LABELS } from '@/modules/treasury/schema';
import { CASH_FLOW_ORIGIN_LABELS, movementOriginOf } from '@/modules/treasury/labels';
import type { CashFlowMovement, CashFlowResult } from '@/modules/treasury/services/treasury.service';
import { formatCurrency } from '@/lib/chile/tax';

// Tokens del tema (globals.css), no hex sueltos: ingresos en verde de éxito,
// egresos en ámbar de advertencia, igual en claro y oscuro.
const INCOME_COLOR = 'var(--success)';
const EXPENSE_COLOR = 'var(--warning)';

type RangePreset = 'this-month' | 'last-month' | 'this-year';

const RANGE_LABELS: Record<RangePreset, string> = {
  'this-month': 'Este mes',
  'last-month': 'Mes pasado',
  'this-year': 'Este año',
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

function counterpart(m: CashFlowMovement): string {
  if (m.contact) return `${m.contact.rut} — ${m.contact.razonSocial}`;
  return m.description ?? '—';
}

function detailOf(m: CashFlowMovement): string {
  if (m.salesDocument) return `Venta folio ${m.salesDocument.folio ?? '—'}`;
  if (m.purchaseDocument) return `Compra folio ${m.purchaseDocument.folio}`;
  return m.description ?? '';
}

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function toCsv(result: CashFlowResult): string {
  const header = ['Fecha', 'Tipo', 'Origen', 'Detalle', 'Monto', 'Medio de pago', 'Caja/Banco', 'Contacto', 'N° comprobante', 'Notas'];
  const rows = result.movements.map((m) => [
    new Date(m.paymentDate).toLocaleDateString('es-CL'),
    m.type === 'INCOME' ? 'Ingreso' : 'Egreso',
    CASH_FLOW_ORIGIN_LABELS[movementOriginOf(m)],
    detailOf(m),
    String(m.amount),
    PAYMENT_METHOD_TYPE_LABELS[m.paymentMethod],
    m.treasuryAccount?.name ?? m.bankAccount ?? '',
    m.contact ? `${m.contact.rut} - ${m.contact.razonSocial}` : '',
    m.referenceNumber ?? '',
    m.notes ?? '',
  ]);
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
}

export default function CashFlowClient({ accounts = [] }: { accounts?: Array<{ id: string; name: string }> }) {
  const [preset, setPreset] = useState<RangePreset>('this-month');
  const [accountId, setAccountId] = useState('');
  const [result, setResult] = useState<CashFlowResult | null>(null);
  const [loading, setLoading] = useState(true);

  const range = useMemo(() => computeRange(preset), [preset]);

  useEffect(() => {
    setLoading(true);
    getCashFlowAction(range.start.toISOString(), range.end.toISOString(), accountId || undefined).then((res) => {
      if (res.success) setResult(res.data);
      else toast.error(res.error);
      setLoading(false);
    });
  }, [range, accountId]);

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
          {accounts.length > 0 && (
            <select aria-label="Filtrar por caja o banco" className={`${nativeSelectClass} w-auto`} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Todas las cuentas</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <Button type="button" variant="outline" onClick={handleExportCsv}>
          Exportar CSV
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Ingresos del período</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold tabular-nums text-success">{formatCurrency(result?.totalIncome ?? 0)}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Egresos del período</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold tabular-nums text-warning">{formatCurrency(result?.totalExpense ?? 0)}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Saldo neto de caja</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold tabular-nums">{formatCurrency(result?.netAmount ?? 0)}</CardContent>
        </Card>
      </div>

      {!loading && result && result.byOrigin.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <BreakdownCard
            title="¿De dónde viene y a dónde va?"
            rows={result.byOrigin.map((row) => ({ key: row.origin, label: CASH_FLOW_ORIGIN_LABELS[row.origin], income: row.income, expense: row.expense }))}
          />
          <BreakdownCard
            title="Por medio de pago"
            rows={result.byPaymentMethod.map((row) => ({ key: row.method, label: PAYMENT_METHOD_TYPE_LABELS[row.method], income: row.income, expense: row.expense }))}
          />
        </div>
      )}

      <Card>
        <CardHeader><CardTitle>Ingresos vs egresos</CardTitle></CardHeader>
        <CardContent>
          {loading && <p className="p-4 text-center text-sm text-muted-foreground">Cargando…</p>}
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
                  <YAxis tickFormatter={(value: number) => formatCurrency(value)} tick={{ fontSize: 12 }} width={90} stroke="currentColor" className="text-muted-foreground" />
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
        <table className="w-full min-w-[920px] table-auto text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="p-2 font-medium">Fecha</th>
              <th className="p-2 font-medium">Tipo</th>
              <th className="p-2 font-medium">Origen</th>
              <th className="p-2 font-medium">Contraparte / glosa</th>
              <th className="p-2 font-medium">Caja / banco</th>
              <th className="p-2 font-medium">Medio</th>
              <th className="p-2 text-right font-medium">Monto</th>
              <th className="p-2 font-medium">Comprobante</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td className="p-4 text-center text-muted-foreground" colSpan={8}>Cargando…</td></tr>
            )}
            {!loading && result?.movements.length === 0 && (
              <tr><td className="p-4 text-center text-muted-foreground" colSpan={8}>Sin movimientos en el período seleccionado</td></tr>
            )}
            {!loading &&
              result?.movements.map((m) => (
                <tr key={m.id} className="border-t border-border">
                  <td className="p-2 whitespace-nowrap">{new Date(m.paymentDate).toLocaleDateString('es-CL')}</td>
                  <td className="p-2">
                    <StatusBadge tone={m.type === 'INCOME' ? 'success' : 'warning'}>{m.type === 'INCOME' ? 'Ingreso' : 'Egreso'}</StatusBadge>
                  </td>
                  <td className="p-2">
                    <span className="block">{CASH_FLOW_ORIGIN_LABELS[movementOriginOf(m)]}</span>
                    <span className="block text-xs text-muted-foreground">{detailOf(m)}</span>
                  </td>
                  <td className="p-2">{counterpart(m)}</td>
                  <td className="p-2">{m.treasuryAccount?.name ?? m.bankAccount ?? '—'}</td>
                  <td className="p-2">{PAYMENT_METHOD_TYPE_LABELS[m.paymentMethod]}</td>
                  <td className="p-2 text-right font-medium tabular-nums">{formatCurrency(m.amount)}</td>
                  <td className="p-2">{m.referenceNumber ?? '—'}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BreakdownCard({ title, rows }: { title: string; rows: Array<{ key: string; label: string; income: number; expense: number }> }) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] table-auto text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="p-2 font-medium">Concepto</th>
                <th className="p-2 text-right font-medium">Ingresos</th>
                <th className="p-2 text-right font-medium">Egresos</th>
                <th className="p-2 text-right font-medium">Neto</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-t border-border">
                  <td className="p-2">{row.label}</td>
                  <td className="p-2 text-right tabular-nums text-success">{row.income ? formatCurrency(row.income) : '—'}</td>
                  <td className="p-2 text-right tabular-nums text-warning">{row.expense ? formatCurrency(row.expense) : '—'}</td>
                  <td className="p-2 text-right font-medium tabular-nums">{formatCurrency(row.income - row.expense)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
