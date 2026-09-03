'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/chile/tax';
import {
  getBalanceSheetAction,
  getCashFlowStatementAction,
  getIncomeStatementAction,
} from '@/modules/accounting/actions/financial-statements.actions';
import type {
  BalanceSheetResult,
  CashFlowStatementResult,
  IncomeStatementResult,
  StatementSection,
} from '@/modules/accounting/services/financial-statements.service';

type StatementKey = 'balance' | 'income' | 'cashflow';

const STATEMENT_LABELS: Record<StatementKey, string> = {
  balance: 'Balance General',
  income: 'Estado de Resultados',
  cashflow: 'Flujo de Efectivo',
};

const MONTH_LABELS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const selectClass = 'h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30';

function SectionTable({ section }: { section: StatementSection }) {
  return (
    <div>
      <p className="mb-1 text-sm font-semibold text-foreground">{section.label}</p>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[420px] table-auto text-sm">
          <tbody>
            {section.lines.length === 0 && (
              <tr><td className="p-2 text-center text-muted-foreground" colSpan={3}>Sin cuentas con movimiento</td></tr>
            )}
            {section.lines.map((line) => (
              <tr key={line.accountId} className="border-t border-border first:border-t-0">
                <td className="w-20 p-2 text-muted-foreground">{line.code}</td>
                <td className="p-2">{line.name}</td>
                <td className="p-2 text-right font-medium">{formatCurrency(line.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border bg-muted/40 font-semibold">
              <td className="p-2" colSpan={2}>Subtotal {section.label}</td>
              <td className="p-2 text-right">{formatCurrency(section.subtotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function BalanceSheetView({ data }: { data: BalanceSheetResult }) {
  return (
    <div className="space-y-4">
      <div className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${data.isBalanced ? 'border-emerald-600/30 bg-emerald-600/10 text-emerald-700' : 'border-red-600/30 bg-red-600/10 text-red-700'}`}>
        {data.isBalanced ? <CheckCircle2 className="size-4 shrink-0" /> : <AlertTriangle className="size-4 shrink-0" />}
        {data.isBalanced
          ? 'El balance cuadra: Activo = Pasivo + Patrimonio.'
          : `Descuadre de ${formatCurrency(data.difference)} entre Activo y Pasivo + Patrimonio. Revisa el motor contable.`}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Activo</h2>
          <SectionTable section={data.assetsCurrent} />
          <SectionTable section={data.assetsNonCurrent} />
          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/60 p-3 font-bold">
            <span>Total Activo</span>
            <span>{formatCurrency(data.totalAssets)}</span>
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Pasivo y Patrimonio</h2>
          <SectionTable section={data.liabilitiesCurrent} />
          <SectionTable section={data.liabilitiesNonCurrent} />
          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/60 p-3 font-medium">
            <span>Total Pasivo</span>
            <span>{formatCurrency(data.totalLiabilities)}</span>
          </div>
          <SectionTable section={data.equity} />
          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/60 p-3 font-medium">
            <span>Total Patrimonio</span>
            <span>{formatCurrency(data.totalEquity)}</span>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border bg-muted p-3 font-bold">
            <span>Total Pasivo + Patrimonio</span>
            <span>{formatCurrency(data.totalLiabilitiesAndEquity)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function IncomeStatementView({ data }: { data: IncomeStatementResult }) {
  const netColor = data.netIncome >= 0 ? 'text-emerald-700' : 'text-red-700';
  return (
    <div className="space-y-4">
      <SectionTable section={data.revenue} />
      <SectionTable section={data.costOfSales} />
      <div className="flex items-center justify-between rounded-lg border border-border bg-muted/60 p-3 font-medium">
        <span>Resultado Bruto</span>
        <span>{formatCurrency(data.grossProfit)}</span>
      </div>
      <SectionTable section={data.expenses} />
      <div className={`flex items-center justify-between rounded-lg border border-border bg-muted p-3 text-lg font-bold ${netColor}`}>
        <span>Resultado del Período</span>
        <span>{formatCurrency(data.netIncome)}</span>
      </div>
    </div>
  );
}

function CashFlowView({ data }: { data: CashFlowStatementResult }) {
  return (
    <div className="space-y-4">
      <div className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${data.reconciled ? 'border-emerald-600/30 bg-emerald-600/10 text-emerald-700' : 'border-red-600/30 bg-red-600/10 text-red-700'}`}>
        {data.reconciled ? <CheckCircle2 className="size-4 shrink-0" /> : <AlertTriangle className="size-4 shrink-0" />}
        {data.reconciled
          ? 'El flujo calculado coincide con la variación real de Caja + Banco del período.'
          : `Descuadre de ${formatCurrency(data.netCashChange - data.actualCashChange)} entre el flujo calculado y la variación real de Caja + Banco.`}
      </div>

      {data.categories.map((group) => (
        <SectionTable
          key={group.category}
          section={{ label: group.label, lines: group.lines, subtotal: group.subtotal }}
        />
      ))}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Caja Inicial</CardTitle></CardHeader>
          <CardContent className="text-xl font-bold">{formatCurrency(data.openingCash)}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Variación Neta de Caja</CardTitle></CardHeader>
          <CardContent className="text-xl font-bold">{formatCurrency(data.netCashChange)}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Caja Final</CardTitle></CardHeader>
          <CardContent className="text-xl font-bold">{formatCurrency(data.closingCash)}</CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function FinancialStatementsClient() {
  const now = useMemo(() => new Date(), []);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [statement, setStatement] = useState<StatementKey>('balance');

  const [balanceSheet, setBalanceSheet] = useState<BalanceSheetResult | null>(null);
  const [incomeStatement, setIncomeStatement] = useState<IncomeStatementResult | null>(null);
  const [cashFlow, setCashFlow] = useState<CashFlowStatementResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([getBalanceSheetAction(year, month), getIncomeStatementAction(year, month), getCashFlowStatementAction(year, month)]).then(
      ([balanceRes, incomeRes, cashFlowRes]) => {
        if (cancelled) return;
        if (balanceRes.success) setBalanceSheet(balanceRes.data);
        else toast.error(balanceRes.error);
        if (incomeRes.success) setIncomeStatement(incomeRes.data);
        else toast.error(incomeRes.error);
        if (cashFlowRes.success) setCashFlow(cashFlowRes.data);
        else toast.error(cashFlowRes.error);
        setLoading(false);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [year, month]);

  const yearOptions = useMemo(() => {
    const current = now.getFullYear();
    return Array.from({ length: 6 }, (_, i) => current - i);
  }, [now]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {(Object.keys(STATEMENT_LABELS) as StatementKey[]).map((key) => (
            <Button key={key} type="button" size="sm" variant={statement === key ? 'default' : 'outline'} onClick={() => setStatement(key)}>
              {STATEMENT_LABELS[key]}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <select className={selectClass} value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {MONTH_LABELS.map((label, i) => (
              <option key={label} value={i + 1}>{label}</option>
            ))}
          </select>
          <select className={selectClass} value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {yearOptions.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {loading && <p className="p-4 text-center text-sm text-muted-foreground">Cargando...</p>}

      {!loading && statement === 'balance' && balanceSheet && <BalanceSheetView data={balanceSheet} />}
      {!loading && statement === 'income' && incomeStatement && <IncomeStatementView data={incomeStatement} />}
      {!loading && statement === 'cashflow' && cashFlow && <CashFlowView data={cashFlow} />}
    </div>
  );
}
