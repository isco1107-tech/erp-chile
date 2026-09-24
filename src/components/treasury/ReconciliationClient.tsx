'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ArrowDownLeft, ArrowUpRight, CheckCheck, FileUp, Link2, Undo2, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { KpiCard } from '@/components/ui/KpiCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { nativeSelectClass } from '@/components/ui/field-classes';
import { formatCurrency } from '@/lib/chile/tax';
import { cn } from '@/lib/utils';
import { applyStatementActionAction, autoMatchAction, getReconciliationBoardAction } from '@/modules/treasury/reconciliation/reconciliation.actions';
import type { ReconciliationBoard, StatementLineRow } from '@/modules/treasury/reconciliation/reconciliation.service';
import { STATEMENT_COUNTERPARTS, type StatementAction, type StatementCounterpart } from '@/modules/treasury/reconciliation/schema';

type Status = 'UNMATCHED' | 'MATCHED' | 'IGNORED';
const STATUS_LABELS: Record<Status, string> = { UNMATCHED: 'Por conciliar', MATCHED: 'Conciliados', IGNORED: 'Ignorados' };

const formatDate = (date: Date | string) => new Date(date).toLocaleDateString('es-CL', { timeZone: 'UTC' });

export default function ReconciliationClient({ accounts }: { accounts: Array<{ id: string; name: string }> }) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [status, setStatus] = useState<Status>('UNMATCHED');
  const [board, setBoard] = useState<ReconciliationBoard | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!accountId) return;
    const result = await getReconciliationBoardAction({ treasuryAccountId: accountId, status });
    if (result.success) setBoard(result.data);
    else toast.error(result.error);
  }, [accountId, status]);

  useEffect(() => {
    void load();
  }, [load]);

  async function upload(file: File) {
    setBusy(true);
    try {
      const form = new FormData();
      form.set('file', file);
      form.set('treasuryAccountId', accountId);
      const response = await fetch('/api/treasury/bank-statements/import', { method: 'POST', body: form });
      const result = (await response.json()) as { success: boolean; error?: string; data?: { imported: number; duplicates: number; errors: Array<{ row: number; message: string }>; from: string | null; to: string | null } };
      if (!result.success || !result.data) {
        toast.error(result.error ?? 'No se pudo importar la cartola');
        return;
      }
      const { imported, duplicates, errors } = result.data;
      toast.success(`${imported} movimiento(s) nuevos${duplicates ? ` · ${duplicates} ya estaban importados` : ''}${errors.length ? ` · ${errors.length} fila(s) omitidas` : ''}`);
      setStatus('UNMATCHED');
      await load();
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function act(lineId: string, action: StatementAction) {
    setBusy(true);
    try {
      const result = await applyStatementActionAction(lineId, action);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Listo');
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function autoMatch() {
    setBusy(true);
    try {
      const result = await autoMatchAction(accountId);
      if (!result.success) toast.error(result.error);
      else toast.success(result.message ?? 'Listo');
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (accounts.length === 0) {
    return (
      <EmptyState
        title="Primero registra tu cuenta bancaria"
        description="La conciliación compara la cartola del banco contra una cuenta bancaria de Tesorería. Créala en Tesorería → Cajas & Bancos."
        action={
          <Link href="/dashboard/treasury/accounts" className="text-sm font-medium text-primary underline">
            Ir a Cajas & Bancos
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Cuenta bancaria" className={`${nativeSelectClass} w-auto`} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.csv,.txt"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
          }}
        />
        <Button type="button" disabled={busy} onClick={() => fileRef.current?.click()}>
          <FileUp aria-hidden="true" /> Importar cartola (.xlsx / .csv)
        </Button>
        <Button type="button" variant="outline" disabled={busy || !board || board.counts.UNMATCHED === 0} onClick={() => void autoMatch()}>
          <Wand2 aria-hidden="true" /> Conciliar automáticamente
        </Button>
      </div>

      {board && (
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <KpiCard label="Por conciliar" value={String(board.counts.UNMATCHED)} icon={Link2} tone={board.counts.UNMATCHED > 0 ? 'warning' : 'success'} />
          <KpiCard label="Abonos sin conciliar" value={formatCurrency(board.unmatchedAmount.income)} icon={ArrowDownLeft} tone="success" />
          <KpiCard label="Cargos sin conciliar" value={formatCurrency(board.unmatchedAmount.expense)} icon={ArrowUpRight} tone="danger" />
        </section>
      )}

      <div className="flex gap-1 border-b border-border">
        {(Object.keys(STATUS_LABELS) as Status[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setStatus(key)}
            className={cn('border-b-2 px-3 py-2 text-sm font-medium', status === key ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}
          >
            {STATUS_LABELS[key]} {board ? `(${board.counts[key]})` : ''}
          </button>
        ))}
      </div>

      {!board ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : board.lines.length === 0 ? (
        <EmptyState
          title={status === 'UNMATCHED' ? 'Todo conciliado' : 'Sin movimientos'}
          description={status === 'UNMATCHED' ? 'Importa la cartola del banco para conciliar sus movimientos con lo registrado en el sistema.' : undefined}
          icon={status === 'UNMATCHED' ? <CheckCheck className="size-10 text-success" aria-hidden="true" /> : undefined}
        />
      ) : (
        <ul className="space-y-2">
          {board.lines.map((line) => (
            <LineCard key={line.id} line={line} board={board} busy={busy} onAct={(action) => void act(line.id, action)} />
          ))}
        </ul>
      )}
    </div>
  );
}

function LineCard({ line, board, busy, onAct }: { line: StatementLineRow; board: ReconciliationBoard; busy: boolean; onAct: (action: StatementAction) => void }) {
  const income = line.amount > 0;
  const [choice, setChoice] = useState('');
  const counterparts = (Object.entries(STATEMENT_COUNTERPARTS) as Array<[StatementCounterpart, (typeof STATEMENT_COUNTERPARTS)[StatementCounterpart]]>).filter(
    ([, config]) => config.direction === (income ? 'INCOME' : 'EXPENSE')
  );
  const documents = (income ? board.openReceivables : board.openPayables).filter((doc) => doc.pending >= Math.abs(line.amount));

  function register() {
    if (!choice) return;
    const [kind, id] = choice.split(':');
    if (kind === 'DOC') onAct(income ? { kind: 'SALES_DOCUMENT', salesDocumentId: id! } : { kind: 'PURCHASE_DOCUMENT', purchaseDocumentId: id! });
    else if (kind === 'OTHER') onAct({ kind: 'OTHER', counterpart: id as StatementCounterpart });
  }

  return (
    <li className="rounded-xl border border-border bg-card p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">{line.description}</p>
          <p className="text-xs text-muted-foreground">
            {formatDate(line.date)}
            {line.reference ? ` · Doc. ${line.reference}` : ''}
          </p>
        </div>
        <span className={cn('text-base font-semibold tabular-nums', income ? 'text-success' : 'text-danger')}>
          {income ? '+' : '−'}
          {formatCurrency(Math.abs(line.amount))}
        </span>
      </div>

      {line.status === 'UNMATCHED' && (
        <div className="mt-3 space-y-2">
          {line.suggestions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {line.suggestions.map((suggestion) => (
                <Button
                  key={`${suggestion.kind}:${suggestion.id}`}
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  title={suggestion.detail}
                  onClick={() =>
                    onAct(
                      suggestion.kind === 'PAYMENT'
                        ? { kind: 'MATCH', paymentId: suggestion.id }
                        : suggestion.kind === 'SALES_DOCUMENT'
                          ? { kind: 'SALES_DOCUMENT', salesDocumentId: suggestion.id }
                          : { kind: 'PURCHASE_DOCUMENT', purchaseDocumentId: suggestion.id }
                    )
                  }
                >
                  <Link2 aria-hidden="true" /> {suggestion.label}
                </Button>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <select aria-label="Registrar como" className={`${nativeSelectClass} w-auto max-w-full`} value={choice} onChange={(e) => setChoice(e.target.value)}>
              <option value="">Registrar como…</option>
              {documents.length > 0 && (
                <optgroup label={income ? 'Cobro de factura' : 'Pago de factura'}>
                  {documents.map((doc) => (
                    <option key={doc.id} value={`DOC:${doc.id}`}>
                      {doc.label} (pendiente {formatCurrency(doc.pending)})
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label="Otro movimiento">
                {counterparts.map(([key, config]) => (
                  <option key={key} value={`OTHER:${key}`}>
                    {config.label}
                  </option>
                ))}
              </optgroup>
            </select>
            <Button type="button" size="sm" disabled={busy || !choice} onClick={register}>
              Registrar
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => onAct({ kind: 'IGNORE' })}>
              Ignorar
            </Button>
          </div>
        </div>
      )}

      {line.status === 'MATCHED' && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="text-muted-foreground">
            <StatusBadge tone="success">Conciliado</StatusBadge>{' '}
            {line.payment ? `${line.payment.description ?? line.payment.contact?.razonSocial ?? 'Movimiento'} · ${formatDate(line.payment.paymentDate)}` : ''}
          </span>
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => onAct({ kind: 'UNDO' })}>
            <Undo2 aria-hidden="true" /> Deshacer
          </Button>
        </div>
      )}

      {line.status === 'IGNORED' && (
        <div className="mt-2 flex justify-end">
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => onAct({ kind: 'UNDO' })}>
            <Undo2 aria-hidden="true" /> Volver a pendientes
          </Button>
        </div>
      )}
    </li>
  );
}
